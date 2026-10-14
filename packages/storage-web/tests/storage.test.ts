import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { unsealSecret } from "@tarjuman/core/adapter";
import { openDB } from "idb";
import { WebCredentialStore } from "../src/credential-store";
import { COLLECTIONS, DB_NAME, DB_VERSION, IndexedDbStorage, StorageNotEmptyError } from "../src/indexeddb-storage";
import { SessionSecrets } from "../src/session-secrets";
import { sealSecret } from "@tarjuman/core";
import { FakeLocalStorage, throwingLocalStorage } from "./fake-local-storage";

/** The collections of database versions 1 and 2, before 005 added `saved_resources`. */
const VERSION_1_COLLECTIONS = ["profile", "settings", "conversations", "messages", "usage"] as const;

const noWebExtras = { cacheStorage: undefined, serviceWorker: undefined, localStorage: undefined };

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("IndexedDbStorage round trip", () => {
  it("puts, gets, queries, and deletes in every collection", async () => {
    const storage = new IndexedDbStorage(noWebExtras);
    for (const collection of COLLECTIONS) {
      await storage.put(collection, { id: "a", value: collection });
      await storage.put(collection, { id: "b", value: "other" });
      expect(await storage.get(collection, "a")).toEqual({ id: "a", value: collection });
      expect(await storage.query(collection)).toHaveLength(2);
      await storage.delete(collection, "a");
      expect(await storage.get(collection, "a")).toBeUndefined();
      expect(await storage.query(collection)).toHaveLength(1);
    }
  });

  it("returns undefined for a record that was never stored", async () => {
    expect(await new IndexedDbStorage(noWebExtras).get("profile", "missing")).toBeUndefined();
  });

  it("queries messages and usage by conversationId", async () => {
    const storage = new IndexedDbStorage(noWebExtras);
    await storage.put("messages", { id: "m1", conversationId: "c1" });
    await storage.put("messages", { id: "m2", conversationId: "c2" });
    await storage.put("usage", { id: "u1", conversationId: "c1" });
    expect(await storage.query("messages", { index: "conversationId", equals: "c1" })).toEqual([
      { id: "m1", conversationId: "c1" },
    ]);
    expect(await storage.query("usage", { index: "conversationId", equals: "c2" })).toEqual([]);
  });

  it("persists across storage instances on the same database", async () => {
    await new IndexedDbStorage(noWebExtras).put("profile", { id: "profile", level: "B1" });
    expect(await new IndexedDbStorage(noWebExtras).get("profile", "profile")).toEqual({ id: "profile", level: "B1" });
  });
});

describe("IndexedDbStorage.clearAll (SC-007)", () => {
  it("leaves zero data: no database, no records, session secret gone", async () => {
    const session = new SessionSecrets();
    const storage = new IndexedDbStorage({ ...noWebExtras, sessionSecrets: session });
    for (const collection of COLLECTIONS) await storage.put(collection, { id: "x", conversationId: "c" });
    await storage.putCredentialRecord({
      id: "anthropic",
      providerId: "anthropic",
      storageMode: "persistent",
      maskedHint: "sk-ant-…1234",
      validatedAt: "2026-10-02T00:00:00.000Z",
      iv: new Uint8Array(12),
      ciphertext: new Uint8Array(8),
      wrappingKey: await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]),
    });
    session.set(sealSecret("sk-ant-session"), { providerId: "anthropic", maskedHint: "x", validatedAt: "t" });
    session.set(sealSecret("AQ.session"), { providerId: "gemini", maskedHint: "y", validatedAt: "t" });

    await storage.clearAll();

    expect(await indexedDB.databases()).toEqual([]);
    expect(session.providerIds()).toEqual([]);
    const reopened = new IndexedDbStorage(noWebExtras);
    for (const collection of COLLECTIONS) expect(await reopened.query(collection)).toEqual([]);
    expect(await reopened.listCredentialRecords()).toEqual([]);
  });

  it("is safe to call on an empty install and more than once", async () => {
    const storage = new IndexedDbStorage(noWebExtras);
    await storage.clearAll();
    await storage.clearAll();
    expect(await indexedDB.databases()).toEqual([]);
  });

  it("works again after clearing", async () => {
    const storage = new IndexedDbStorage(noWebExtras);
    await storage.put("profile", { id: "p" });
    await storage.clearAll();
    await storage.put("profile", { id: "q" });
    expect(await storage.query("profile")).toEqual([{ id: "q" }]);
  });

  it("clears Cache Storage and service worker registrations", async () => {
    const caches = new Map([["app-shell", 1], ["assets", 1]]);
    const registrations = [{ unregister: async () => registrations.splice(0, 1).length > 0 }];
    const storage = new IndexedDbStorage({
      cacheStorage: {
        keys: async () => [...caches.keys()],
        delete: async (name) => caches.delete(name),
      },
      serviceWorker: { getRegistrations: async () => [...registrations] },
    });
    await storage.put("profile", { id: "p" });
    await storage.clearAll();
    expect(caches.size).toBe(0);
    expect(registrations).toHaveLength(0);
  });

  it("throws instead of claiming success when cache storage cannot be emptied", async () => {
    const storage = new IndexedDbStorage({
      cacheStorage: { keys: async () => ["stuck"], delete: async () => false },
      serviceWorker: undefined,
    });
    await expect(storage.clearAll()).rejects.toBeInstanceOf(StorageNotEmptyError);
  });

  it("throws when a service worker registration cannot be removed", async () => {
    const storage = new IndexedDbStorage({
      cacheStorage: undefined,
      serviceWorker: { getRegistrations: async () => [{ unregister: async () => false }] },
    });
    await expect(storage.clearAll()).rejects.toBeInstanceOf(StorageNotEmptyError);
  });

  it("throws when the database survives deletion", async () => {
    const factory = new IDBFactory();
    const realDelete = factory.deleteDatabase.bind(factory);
    // Pretend to delete: the request succeeds but targets a different database.
    factory.deleteDatabase = (name: string) => realDelete(`decoy-${name}`);
    globalThis.indexedDB = factory;
    const storage = new IndexedDbStorage(noWebExtras);
    await storage.put("profile", { id: "p" });
    await expect(storage.clearAll()).rejects.toThrow(/still exists/);
  });

  it("removes every tarjuman.* key from localStorage and leaves other keys alone (FR-003a)", async () => {
    const local = new FakeLocalStorage({ "tarjuman.theme": "dark", "tarjuman.future": "x", "other-app": "keep" });
    const storage = new IndexedDbStorage({ ...noWebExtras, localStorage: local });
    await storage.put("profile", { id: "p" });
    await storage.clearAll();
    expect([...local.items.keys()]).toEqual(["other-app"]);
  });

  it("throws when a tarjuman.* key survives removal", async () => {
    const local = new FakeLocalStorage({ "tarjuman.theme": "dark" });
    local.stuck = true;
    const storage = new IndexedDbStorage({ ...noWebExtras, localStorage: local });
    await expect(storage.clearAll()).rejects.toThrow(/local storage entries remain/);
    await expect(storage.clearAll()).rejects.toBeInstanceOf(StorageNotEmptyError);
  });

  it("treats blocked localStorage as empty, not as a failure", async () => {
    const storage = new IndexedDbStorage({ ...noWebExtras, localStorage: throwingLocalStorage });
    await expect(storage.clearAll()).resolves.toBeUndefined();
  });
});

describe("IndexedDbStorage.isAvailable", () => {
  it("is true when storage works", async () => {
    expect(await new IndexedDbStorage(noWebExtras).isAvailable()).toBe(true);
  });

  it("is false when opening the database is denied (private mode, blocked storage)", async () => {
    globalThis.indexedDB = {
      open() {
        throw new DOMException("denied", "SecurityError");
      },
    } as unknown as IDBFactory;
    expect(await new IndexedDbStorage(noWebExtras).isAvailable()).toBe(false);
  });

  it("is false when IndexedDB does not exist", async () => {
    // @ts-expect-error simulating an environment without IndexedDB
    delete globalThis.indexedDB;
    expect(await new IndexedDbStorage(noWebExtras).isAvailable()).toBe(false);
  });
});

describe("IndexedDbStorage upgrade from version 1 (004 FR-002, SC-006)", () => {
  const OLD_KEY = "sk-ant-api03-FAKE-KEY-STORED-BEFORE-004-abcdefgh-0001";

  /** Builds the database exactly as 001-003 left it: version 1, one credential under "current". */
  async function createVersion1Database(): Promise<void> {
    const db = await openDB(DB_NAME, 1, {
      upgrade(database) {
        for (const name of VERSION_1_COLLECTIONS) {
          const store = database.createObjectStore(name, { keyPath: "id" });
          if (name === "messages" || name === "usage") store.createIndex("conversationId", "conversationId");
        }
        database.createObjectStore("credential", { keyPath: "id" });
      },
    });
    const wrappingKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: new TextEncoder().encode("anthropic") },
        wrappingKey,
        new TextEncoder().encode(OLD_KEY),
      ),
    );
    await db.put("credential", {
      id: "current",
      providerId: "anthropic",
      storageMode: "persistent",
      maskedHint: "sk-ant-…0001",
      validatedAt: "2026-10-01T00:00:00.000Z",
      iv,
      ciphertext,
      wrappingKey,
    });
    await db.put("profile", { id: "profile", level: "B1" });
    db.close();
  }

  it("is now version 3", () => {
    expect(DB_VERSION).toBe(3);
  });

  it("moves the old credential under its provider id and keeps it readable", async () => {
    await createVersion1Database();
    const storage = new IndexedDbStorage(noWebExtras);
    const store = new WebCredentialStore({ records: storage, sessionSecrets: new SessionSecrets() });

    expect(unsealSecret((await store.load("anthropic"))!)).toBe(OLD_KEY);
    expect((await store.describe("anthropic"))?.maskedHint).toBe("sk-ant-…0001");
    expect(await storage.get("profile", "profile")).toEqual({ id: "profile", level: "B1" });

    const raw = await openDB(DB_NAME);
    expect(await raw.getAllKeys("credential")).toEqual(["anthropic"]);
    raw.close();
  });

  it("upgrades a version-1 database that holds no credential", async () => {
    const db = await openDB(DB_NAME, 1, {
      upgrade(database) {
        for (const name of VERSION_1_COLLECTIONS) database.createObjectStore(name, { keyPath: "id" });
        database.createObjectStore("credential", { keyPath: "id" });
      },
    });
    db.close();
    const store = new WebCredentialStore({ records: new IndexedDbStorage(noWebExtras), sessionSecrets: new SessionSecrets() });
    expect(await store.list()).toEqual([]);
  });
});

describe("IndexedDbStorage upgrade from version 2 (005)", () => {
  /** The database as 004 left it: version 2, the five collections, one credential keyed by provider. */
  async function createVersion2Database(): Promise<void> {
    const db = await openDB(DB_NAME, 2, {
      upgrade(database) {
        for (const name of VERSION_1_COLLECTIONS) {
          const store = database.createObjectStore(name, { keyPath: "id" });
          if (name === "messages" || name === "usage") store.createIndex("conversationId", "conversationId");
        }
        database.createObjectStore("credential", { keyPath: "id" });
      },
    });
    await db.put("profile", { id: "profile", level: "B1" });
    await db.put("messages", { id: "m1", conversationId: "c1" });
    await db.put("settings", { id: "theme-ish", value: 1 });
    db.close();
  }

  it("adds the saved_resources store and keeps every record", async () => {
    await createVersion2Database();
    const storage = new IndexedDbStorage(noWebExtras);
    expect(await storage.get("profile", "profile")).toEqual({ id: "profile", level: "B1" });
    expect(await storage.query("messages", { index: "conversationId", equals: "c1" })).toEqual([
      { id: "m1", conversationId: "c1" },
    ]);
    expect(await storage.get("settings", "theme-ish")).toEqual({ id: "theme-ish", value: 1 });

    await storage.put("saved_resources", { id: "youtube:aaaaaaaaaaa", savedAt: "2026-10-14" });
    expect(await storage.query("saved_resources")).toHaveLength(1);

    const raw = await openDB(DB_NAME);
    expect(raw.version).toBe(3);
    expect([...raw.objectStoreNames].sort()).toEqual(
      ["conversations", "credential", "messages", "profile", "saved_resources", "settings", "usage"],
    );
    raw.close();
  });

  it("starts a fresh database at version 3 with the store already there", async () => {
    const storage = new IndexedDbStorage(noWebExtras);
    await storage.put("saved_resources", { id: "youtube:bbbbbbbbbbb" });
    const raw = await openDB(DB_NAME);
    expect(raw.version).toBe(3);
    expect(raw.objectStoreNames.contains("saved_resources")).toBe(true);
    raw.close();
  });

  it("upgrades a version-1 database straight to 3, keeping the moved credential and adding the store", async () => {
    const db = await openDB(DB_NAME, 1, {
      upgrade(database) {
        for (const name of VERSION_1_COLLECTIONS) database.createObjectStore(name, { keyPath: "id" });
        database.createObjectStore("credential", { keyPath: "id" });
      },
    });
    db.close();
    const storage = new IndexedDbStorage(noWebExtras);
    await storage.put("saved_resources", { id: "youtube:ccccccccccc" });
    expect(await storage.query("saved_resources")).toHaveLength(1);
  });

  it("clearAll removes saved resources too, and verifies the database is gone", async () => {
    const storage = new IndexedDbStorage(noWebExtras);
    await storage.put("saved_resources", { id: "youtube:ddddddddddd" });
    await storage.clearAll();
    expect(await new IndexedDbStorage(noWebExtras).query("saved_resources")).toEqual([]);
  });
});
