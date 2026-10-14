import { describe, expect, it } from "vitest";
import { DataController } from "../../src/credentials/data-controller";
import { sealSecret, type SecretHandle } from "../../src/ports/secret-handle";
import type {
  Collection,
  CredentialDescription,
  CredentialMeta,
  CredentialStorageMode,
  CredentialStore,
  StoragePort,
  StoredRecord,
} from "../../src/ports/storage";

const KEY = "sk-ant-api03-SECRETSECRETSECRET-a1b2";
const META: CredentialMeta = { providerId: "anthropic", maskedHint: "sk-ant-…a1b2" };

/** In-memory storage that logs `clearAll` and can be told to fail its emptiness check. */
class FakeStorage implements StoragePort {
  readonly tables = new Map<Collection, Map<string, StoredRecord>>();
  failVerification = false;
  constructor(readonly log: string[] = []) {}
  #table(collection: Collection): Map<string, StoredRecord> {
    let table = this.tables.get(collection);
    if (!table) this.tables.set(collection, (table = new Map()));
    return table;
  }
  async get<T>(collection: Collection, id: string): Promise<T | undefined> {
    return this.#table(collection).get(id) as T | undefined;
  }
  async put<T extends StoredRecord>(collection: Collection, value: T): Promise<void> {
    this.#table(collection).set(value.id, value);
  }
  async delete(collection: Collection, id: string): Promise<void> {
    this.#table(collection).delete(id);
  }
  async query<T>(collection: Collection): Promise<T[]> {
    return [...this.#table(collection).values()] as T[];
  }
  async clearAll(): Promise<void> {
    this.log.push("clearAll");
    this.tables.clear();
    if (this.failVerification) throw new Error("Could not verify that all Tarjuman data was removed");
  }
  async isAvailable(): Promise<boolean> {
    return true;
  }
}

/** Holds a session key in memory or a persistent one, like the web store. `remove` can be broken. */
class FakeCredentials implements CredentialStore {
  current: { secret: string; mode: CredentialStorageMode } | undefined;
  removeFails = false;
  removeIsNoop = false;
  constructor(readonly log: string[] = []) {}
  async save(secret: string, mode: CredentialStorageMode): Promise<void> {
    this.current = { secret, mode };
  }
  async load(): Promise<SecretHandle | undefined> {
    this.log.push("load");
    return this.current === undefined ? undefined : sealSecret(this.current.secret);
  }
  async describe(): Promise<CredentialDescription | undefined> {
    this.log.push("describe");
    if (this.current === undefined) return undefined;
    return { ...META, storageMode: this.current.mode, validatedAt: "2026-10-13T00:00:00.000Z" };
  }
  async remove(): Promise<void> {
    this.log.push("remove");
    if (this.removeFails) throw new Error("remove failed");
    if (!this.removeIsNoop) this.current = undefined;
  }
}

async function world(mode: CredentialStorageMode = "persistent") {
  const log: string[] = [];
  const storage = new FakeStorage(log);
  const credentials = new FakeCredentials(log);
  await storage.put("profile", { id: "profile", mediationLanguage: "es", targetLanguage: "ja" });
  await storage.put("conversations", { id: "c1" });
  await storage.put("messages", { id: "m1", conversationId: "c1" });
  await storage.put("usage", { id: "u1", conversationId: "c1" });
  await credentials.save(KEY, mode);
  return { storage, credentials, log, data: new DataController({ storage, credentials }) };
}

describe("DataController.deleteAll", () => {
  it.each<CredentialStorageMode>(["persistent", "session"])(
    "clears storage and the %s key, and leaves the app at first run",
    async (mode) => {
      const { data, storage, credentials } = await world(mode);
      expect(await data.deleteAll()).toEqual({ ok: true });
      // First run: no profile and no key, which is what makes `boot()` start onboarding.
      expect(await storage.get("profile", "profile")).toBeUndefined();
      expect(await storage.query("conversations")).toEqual([]);
      expect(await storage.query("messages")).toEqual([]);
      expect(await storage.query("usage")).toEqual([]);
      expect(await credentials.describe()).toBeUndefined();
      expect(await credentials.load()).toBeUndefined();
    },
  );

  it("removes the key and checks it is gone before dropping storage", async () => {
    const { data, log } = await world();
    await data.deleteAll();
    // Checking the key after `clearAll` would reopen (and so recreate) the database it just dropped.
    expect(log).toEqual(["remove", "describe", "load", "clearAll"]);
  });

  it("reports a failure, never success, when the storage emptiness check fails", async () => {
    const { data, storage } = await world();
    storage.failVerification = true;
    expect(await data.deleteAll()).toEqual({ ok: false, code: "not_verified" });
  });

  it("reports a failure when the key is still there after removal, and still drops storage", async () => {
    const { data, credentials, log } = await world("session");
    credentials.removeIsNoop = true;
    expect(await data.deleteAll()).toEqual({ ok: false, code: "not_verified" });
    expect(log).toContain("clearAll");
  });

  it("reports a failure when removing the key throws, and still drops storage", async () => {
    const { data, credentials, log } = await world();
    credentials.removeFails = true;
    expect(await data.deleteAll()).toEqual({ ok: false, code: "not_verified" });
    expect(log).toContain("clearAll");
  });

  it("never puts the key in its outcome", async () => {
    const { data, credentials } = await world();
    credentials.removeIsNoop = true;
    expect(JSON.stringify(await data.deleteAll())).not.toContain("SECRETSECRET");
  });
});
