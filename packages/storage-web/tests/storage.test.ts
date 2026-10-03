import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";
import { COLLECTIONS, IndexedDbStorage, StorageNotEmptyError } from "../src/indexeddb-storage";
import { SessionSecrets } from "../src/session-secrets";
import { sealSecret } from "@tarjuman/core";

const noWebExtras = { cacheStorage: undefined, serviceWorker: undefined };

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
      id: "current",
      providerId: "anthropic",
      storageMode: "persistent",
      maskedHint: "sk-ant-…1234",
      validatedAt: "2026-10-02T00:00:00.000Z",
      iv: new Uint8Array(12),
      ciphertext: new Uint8Array(8),
      wrappingKey: await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]),
    });
    session.set(sealSecret("sk-ant-session"), { providerId: "anthropic", maskedHint: "x", validatedAt: "t" });

    await storage.clearAll();

    expect(await indexedDB.databases()).toEqual([]);
    expect(session.handle).toBeUndefined();
    const reopened = new IndexedDbStorage(noWebExtras);
    for (const collection of COLLECTIONS) expect(await reopened.query(collection)).toEqual([]);
    expect(await reopened.getCredentialRecord()).toBeUndefined();
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
