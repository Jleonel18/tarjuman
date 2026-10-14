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
// Fake Gemini key (004): never a real credential.
const GEMINI_KEY = "AQ.FAKEdataCONTROLLERgeminiKEYfakeFAKE_-fakeFAKE0001";
const GEMINI_META: CredentialMeta = { providerId: "gemini", maskedHint: "AQ.…0001" };

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

/** Holds keys per provider, like the web store. `removeAll` can be broken or skip one provider. */
class FakeCredentials implements CredentialStore {
  readonly keys = new Map<string, { secret: string; mode: CredentialStorageMode }>();
  removeFails = false;
  removeIsNoop = false;
  /** A provider whose key `removeAll` forgets, as a buggy store might. */
  survivor: string | undefined;
  constructor(readonly log: string[] = []) {}
  async save(secret: string, mode: CredentialStorageMode, meta: CredentialMeta): Promise<void> {
    this.keys.set(meta.providerId, { secret, mode });
  }
  async load(providerId: string): Promise<SecretHandle | undefined> {
    this.log.push(`load:${providerId}`);
    const entry = this.keys.get(providerId);
    return entry === undefined ? undefined : sealSecret(entry.secret);
  }
  async describe(providerId: string): Promise<CredentialDescription | undefined> {
    const entry = this.keys.get(providerId);
    if (entry === undefined) return undefined;
    return { providerId, maskedHint: "…", storageMode: entry.mode, validatedAt: "2026-10-13T00:00:00.000Z" };
  }
  async list(): Promise<CredentialDescription[]> {
    this.log.push("list");
    const out: CredentialDescription[] = [];
    for (const id of this.keys.keys()) out.push((await this.describe(id))!);
    return out;
  }
  async remove(providerId: string): Promise<void> {
    this.keys.delete(providerId);
  }
  async removeAll(): Promise<void> {
    this.log.push("removeAll");
    if (this.removeFails) throw new Error("remove failed");
    if (this.removeIsNoop) return;
    for (const id of [...this.keys.keys()]) if (id !== this.survivor) this.keys.delete(id);
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
  await credentials.save(KEY, mode, META);
  await credentials.save(GEMINI_KEY, mode, GEMINI_META);
  return {
    storage,
    credentials,
    log,
    data: new DataController({ storage, credentials, providerIds: ["anthropic", "gemini"] }),
  };
}

describe("DataController.deleteAll", () => {
  it.each<CredentialStorageMode>(["persistent", "session"])(
    "clears storage and every provider's %s key, and leaves the app at first run (004 SC-007)",
    async (mode) => {
      const { data, storage, credentials } = await world(mode);
      expect(await data.deleteAll()).toEqual({ ok: true });
      // First run: no profile and no key, which is what makes `boot()` start onboarding.
      expect(await storage.get("profile", "profile")).toBeUndefined();
      expect(await storage.query("conversations")).toEqual([]);
      expect(await storage.query("messages")).toEqual([]);
      expect(await storage.query("usage")).toEqual([]);
      for (const id of ["anthropic", "gemini"]) {
        expect(await credentials.describe(id)).toBeUndefined();
        expect(await credentials.load(id)).toBeUndefined();
      }
    },
  );

  it("removes the key and checks it is gone before dropping storage", async () => {
    const { data, log } = await world();
    await data.deleteAll();
    // Checking the key after `clearAll` would reopen (and so recreate) the database it just dropped.
    expect(log).toEqual(["removeAll", "list", "load:anthropic", "load:gemini", "clearAll"]);
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

  it("reports a failure when one provider's key survives, and still drops storage", async () => {
    const { data, credentials, log } = await world("persistent");
    credentials.survivor = "gemini";
    expect(await data.deleteAll()).toEqual({ ok: false, code: "not_verified" });
    expect(log).toContain("clearAll");
  });

  it("checks every offered provider even if the list looks empty", async () => {
    const { data, credentials } = await world();
    // A store whose list forgets an entry must still be caught by loading each provider.
    credentials.survivor = "gemini";
    credentials.list = async () => [];
    expect(await data.deleteAll()).toEqual({ ok: false, code: "not_verified" });
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
    const outcome = JSON.stringify(await data.deleteAll());
    expect(outcome).not.toContain("SECRETSECRET");
    expect(outcome).not.toContain("geminiKEY");
  });
});
