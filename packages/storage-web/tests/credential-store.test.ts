import "fake-indexeddb/auto";
import { unsealSecret } from "@tarjuman/core/adapter";
import { IDBFactory } from "fake-indexeddb";
import { openDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import { WebCredentialStore } from "../src/credential-store";
import { DB_NAME, IndexedDbStorage, type CredentialRecord } from "../src/indexeddb-storage";
import { SessionSecrets } from "../src/session-secrets";

const SECRET = "sk-ant-api03-FAKE-SECRET-FOR-TESTS-abcdefghijklmnop-WXYZ";
const META = { providerId: "anthropic", maskedHint: "sk-ant-…WXYZ" };
const noWebExtras = { cacheStorage: undefined, serviceWorker: undefined };

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

function build(session = new SessionSecrets()) {
  const storage = new IndexedDbStorage({ ...noWebExtras, sessionSecrets: session });
  return { storage, session, store: new WebCredentialStore({ records: storage, sessionSecrets: session }) };
}

/** Independent connection to the raw database, as an attacker reading the disk would see it. */
async function rawContents(): Promise<Record<string, unknown[]>> {
  const db = await openDB(DB_NAME);
  const out: Record<string, unknown[]> = {};
  for (const name of Array.from(db.objectStoreNames)) out[name] = await db.getAll(name);
  db.close();
  return out;
}

function containsBytes(haystack: Uint8Array, needle: string): boolean {
  const n = new TextEncoder().encode(needle);
  outer: for (let i = 0; i + n.length <= haystack.length; i++) {
    for (let j = 0; j < n.length; j++) if (haystack[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
}

/** Walks any structure; true if the secret appears as text or as raw bytes anywhere. */
function leaks(value: unknown, secret: string): boolean {
  if (typeof value === "string") return value.includes(secret);
  if (value instanceof Uint8Array) return containsBytes(value, secret);
  if (value instanceof ArrayBuffer) return containsBytes(new Uint8Array(value), secret);
  if (Array.isArray(value)) return value.some((v) => leaks(v, secret));
  if (value && typeof value === "object" && !(value instanceof CryptoKey)) {
    return Object.values(value).some((v) => leaks(v, secret));
  }
  return false;
}

describe("persistent mode", () => {
  it("round-trips the secret through encryption", async () => {
    const { store } = build();
    await store.save(SECRET, "persistent", META);
    const handle = await store.load();
    expect(handle).toBeDefined();
    expect(unsealSecret(handle!)).toBe(SECRET);
  });

  it("survives a reload: new storage and new session holder, same database", async () => {
    await build().store.save(SECRET, "persistent", META);
    const reloaded = build();
    expect(unsealSecret((await reloaded.store.load())!)).toBe(SECRET);
    expect((await reloaded.store.describe())?.storageMode).toBe("persistent");
  });

  it("leaves no plaintext key anywhere in the raw database contents", async () => {
    const { store } = build();
    await store.save(SECRET, "persistent", META);
    const raw = await rawContents();
    expect(raw["credential"]).toHaveLength(1);
    expect(leaks(raw, SECRET)).toBe(false);
    // Sanity: the scanner does find a planted secret, so a pass above is meaningful.
    expect(leaks({ hidden: new TextEncoder().encode(`xx${SECRET}yy`) }, SECRET)).toBe(true);
  });

  it("stores a wrapping key that cannot be exported", async () => {
    const { storage, store } = build();
    await store.save(SECRET, "persistent", META);
    const record = (await storage.getCredentialRecord()) as CredentialRecord;
    expect(record.wrappingKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", record.wrappingKey)).rejects.toThrow();
    await expect(crypto.subtle.exportKey("jwk", record.wrappingKey)).rejects.toThrow();
  });

  it("uses a fresh key and IV for every save", async () => {
    const { storage, store } = build();
    await store.save(SECRET, "persistent", META);
    const first = (await storage.getCredentialRecord()) as CredentialRecord;
    await store.save(SECRET, "persistent", META);
    const second = (await storage.getCredentialRecord()) as CredentialRecord;
    expect(Array.from(first.iv)).not.toEqual(Array.from(second.iv));
    expect(Array.from(first.ciphertext)).not.toEqual(Array.from(second.ciphertext));
  });

  it("treats tampered ciphertext as absent instead of returning garbage", async () => {
    const { storage, store } = build();
    await store.save(SECRET, "persistent", META);
    const record = (await storage.getCredentialRecord()) as CredentialRecord;
    record.ciphertext[0] = (record.ciphertext[0]! + 1) % 256;
    await storage.putCredentialRecord(record);
    expect(await store.load()).toBeUndefined();
  });
});

describe("describe()", () => {
  it("never exposes the secret and returns only the documented fields", async () => {
    const { store } = build();
    await store.save(SECRET, "persistent", META);
    const description = await store.describe();
    expect(Object.keys(description!).sort()).toEqual(["maskedHint", "providerId", "storageMode", "validatedAt"]);
    expect(JSON.stringify(description)).not.toContain(SECRET);
    expect(description?.maskedHint).toBe(META.maskedHint);
  });

  it("is undefined when nothing is stored", async () => {
    expect(await build().store.describe()).toBeUndefined();
  });

  it("rejects a masked hint that contains the key", async () => {
    await expect(build().store.save(SECRET, "persistent", { ...META, maskedHint: `x ${SECRET}` })).rejects.toThrow(/masked hint/);
  });

  it("rejects an empty key", async () => {
    await expect(build().store.save("", "persistent", META)).rejects.toThrow();
  });
});

describe("session mode (FR-016)", () => {
  it("writes no ciphertext and nothing at all about the key to disk", async () => {
    const { store } = build();
    await store.save(SECRET, "session", META);
    const raw = await rawContents();
    expect(raw["credential"]).toEqual([]);
    expect(leaks(raw, SECRET)).toBe(false);
    expect(JSON.stringify(raw)).not.toContain(META.maskedHint);
  });

  it("works during the session", async () => {
    const { store } = build();
    await store.save(SECRET, "session", META);
    expect(unsealSecret((await store.load())!)).toBe(SECRET);
    expect((await store.describe())?.storageMode).toBe("session");
  });

  it("is empty after a simulated reload", async () => {
    await build().store.save(SECRET, "session", META);
    const reloaded = build();
    expect(await reloaded.store.load()).toBeUndefined();
    expect(await reloaded.store.describe()).toBeUndefined();
  });

  it("replaces a previously remembered key instead of leaving it on disk", async () => {
    const { store, storage } = build();
    await store.save(SECRET, "persistent", META);
    await store.save("sk-ant-other-key-1111", "session", { providerId: "anthropic", maskedHint: "sk-ant-…1111" });
    expect(await storage.getCredentialRecord()).toBeUndefined();
    expect(unsealSecret((await store.load())!)).toBe("sk-ant-other-key-1111");
  });

  it("drops the in-memory key when switching to remembered", async () => {
    const { store, session } = build();
    await store.save(SECRET, "session", META);
    await store.save(SECRET, "persistent", META);
    expect(session.handle).toBeUndefined();
    expect((await store.describe())?.storageMode).toBe("persistent");
  });
});

describe("remove()", () => {
  it("makes a remembered key unrecoverable", async () => {
    const { store, storage } = build();
    await store.save(SECRET, "persistent", META);
    await store.remove();
    expect(await store.load()).toBeUndefined();
    expect(await store.describe()).toBeUndefined();
    expect(await storage.getCredentialRecord()).toBeUndefined();
    expect(leaks(await rawContents(), SECRET)).toBe(false);
  });

  it("invalidates handles already handed out for a session key", async () => {
    const { store } = build();
    await store.save(SECRET, "session", META);
    const handle = (await store.load())!;
    await store.remove();
    expect(() => unsealSecret(handle)).toThrow();
  });
});
