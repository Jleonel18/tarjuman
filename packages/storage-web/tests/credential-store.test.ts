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
// Fake Gemini auth key (004): never a real credential.
const GEMINI_SECRET = "AQ.FAKEcredentialSTOREgeminiKEYfakeFAKE_-fakeFAKE0001";
const GEMINI_META = { providerId: "gemini", maskedHint: "AQ.…0001" };
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
    const handle = await store.load("anthropic");
    expect(handle).toBeDefined();
    expect(unsealSecret(handle!)).toBe(SECRET);
  });

  it("survives a reload: new storage and new session holder, same database", async () => {
    await build().store.save(SECRET, "persistent", META);
    const reloaded = build();
    expect(unsealSecret((await reloaded.store.load("anthropic"))!)).toBe(SECRET);
    expect((await reloaded.store.describe("anthropic"))?.storageMode).toBe("persistent");
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
    const record = (await storage.getCredentialRecord("anthropic")) as CredentialRecord;
    expect(record.wrappingKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", record.wrappingKey)).rejects.toThrow();
    await expect(crypto.subtle.exportKey("jwk", record.wrappingKey)).rejects.toThrow();
  });

  it("uses a fresh key and IV for every save", async () => {
    const { storage, store } = build();
    await store.save(SECRET, "persistent", META);
    const first = (await storage.getCredentialRecord("anthropic")) as CredentialRecord;
    await store.save(SECRET, "persistent", META);
    const second = (await storage.getCredentialRecord("anthropic")) as CredentialRecord;
    expect(Array.from(first.iv)).not.toEqual(Array.from(second.iv));
    expect(Array.from(first.ciphertext)).not.toEqual(Array.from(second.ciphertext));
  });

  it("treats tampered ciphertext as absent instead of returning garbage", async () => {
    const { storage, store } = build();
    await store.save(SECRET, "persistent", META);
    const record = (await storage.getCredentialRecord("anthropic")) as CredentialRecord;
    record.ciphertext[0] = (record.ciphertext[0]! + 1) % 256;
    await storage.putCredentialRecord(record);
    expect(await store.load("anthropic")).toBeUndefined();
  });
});

describe("describe()", () => {
  it("never exposes the secret and returns only the documented fields", async () => {
    const { store } = build();
    await store.save(SECRET, "persistent", META);
    const description = await store.describe("anthropic");
    expect(Object.keys(description!).sort()).toEqual(["maskedHint", "providerId", "storageMode", "validatedAt"]);
    expect(JSON.stringify(description)).not.toContain(SECRET);
    expect(description?.maskedHint).toBe(META.maskedHint);
  });

  it("is undefined when nothing is stored", async () => {
    expect(await build().store.describe("anthropic")).toBeUndefined();
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
    expect(unsealSecret((await store.load("anthropic"))!)).toBe(SECRET);
    expect((await store.describe("anthropic"))?.storageMode).toBe("session");
  });

  it("is empty after a simulated reload", async () => {
    await build().store.save(SECRET, "session", META);
    const reloaded = build();
    expect(await reloaded.store.load("anthropic")).toBeUndefined();
    expect(await reloaded.store.describe("anthropic")).toBeUndefined();
  });

  it("replaces a previously remembered key instead of leaving it on disk", async () => {
    const { store, storage } = build();
    await store.save(SECRET, "persistent", META);
    await store.save("sk-ant-other-key-1111", "session", { providerId: "anthropic", maskedHint: "sk-ant-…1111" });
    expect(await storage.getCredentialRecord("anthropic")).toBeUndefined();
    expect(unsealSecret((await store.load("anthropic"))!)).toBe("sk-ant-other-key-1111");
  });

  it("drops the in-memory key when switching to remembered", async () => {
    const { store, session } = build();
    await store.save(SECRET, "session", META);
    await store.save(SECRET, "persistent", META);
    expect(session.handle("anthropic")).toBeUndefined();
    expect((await store.describe("anthropic"))?.storageMode).toBe("persistent");
  });
});

describe("remove()", () => {
  it("makes a remembered key unrecoverable", async () => {
    const { store, storage } = build();
    await store.save(SECRET, "persistent", META);
    await store.remove("anthropic");
    expect(await store.load("anthropic")).toBeUndefined();
    expect(await store.describe("anthropic")).toBeUndefined();
    expect(await storage.getCredentialRecord("anthropic")).toBeUndefined();
    expect(leaks(await rawContents(), SECRET)).toBe(false);
  });

  it("invalidates handles already handed out for a session key", async () => {
    const { store } = build();
    await store.save(SECRET, "session", META);
    const handle = (await store.load("anthropic"))!;
    await store.remove("anthropic");
    expect(() => unsealSecret(handle)).toThrow();
  });
});

describe("one key per provider (004 FR-004)", () => {
  it("keeps an Anthropic and a Gemini key side by side and loads each by provider", async () => {
    const { store } = build();
    await store.save(SECRET, "persistent", META);
    await store.save(GEMINI_SECRET, "persistent", GEMINI_META);
    expect(unsealSecret((await store.load("anthropic"))!)).toBe(SECRET);
    expect(unsealSecret((await store.load("gemini"))!)).toBe(GEMINI_SECRET);
    expect((await store.describe("gemini"))?.maskedHint).toBe("AQ.…0001");
    expect(await store.load("ollama")).toBeUndefined();
  });

  it("keeps both in mixed modes, and both survive or not as their mode says", async () => {
    const { store } = build();
    await store.save(SECRET, "persistent", META);
    await store.save(GEMINI_SECRET, "session", GEMINI_META);
    expect((await store.describe("anthropic"))?.storageMode).toBe("persistent");
    expect((await store.describe("gemini"))?.storageMode).toBe("session");
    const reloaded = build();
    expect(unsealSecret((await reloaded.store.load("anthropic"))!)).toBe(SECRET);
    expect(await reloaded.store.load("gemini")).toBeUndefined();
  });

  it("lists every stored key, never the secrets", async () => {
    const { store } = build();
    await store.save(SECRET, "session", META);
    await store.save(GEMINI_SECRET, "persistent", GEMINI_META);
    const list = await store.list();
    expect(list.map((d) => d.providerId).sort()).toEqual(["anthropic", "gemini"]);
    expect(JSON.stringify(list)).not.toContain(SECRET);
    expect(JSON.stringify(list)).not.toContain(GEMINI_SECRET);
  });

  it("remove(gemini) leaves the Anthropic key untouched, in either mode", async () => {
    for (const mode of ["persistent", "session"] as const) {
      globalThis.indexedDB = new IDBFactory();
      const { store } = build();
      await store.save(SECRET, mode, META);
      await store.save(GEMINI_SECRET, mode, GEMINI_META);
      await store.remove("gemini");
      expect(await store.load("gemini")).toBeUndefined();
      expect(unsealSecret((await store.load("anthropic"))!), mode).toBe(SECRET);
    }
  });

  it("saving Gemini in session mode removes only the persistent Gemini key", async () => {
    const { store, storage } = build();
    await store.save(SECRET, "persistent", META);
    await store.save(GEMINI_SECRET, "persistent", GEMINI_META);
    await store.save(GEMINI_SECRET, "session", GEMINI_META);
    expect(await storage.getCredentialRecord("gemini")).toBeUndefined();
    expect(await storage.getCredentialRecord("anthropic")).toBeDefined();
    expect((await store.describe("gemini"))?.storageMode).toBe("session");
  });

  it("saving Gemini in persistent mode drops only the in-memory Gemini key", async () => {
    const { store } = build();
    await store.save(SECRET, "session", META);
    await store.save(GEMINI_SECRET, "session", GEMINI_META);
    await store.save(GEMINI_SECRET, "persistent", GEMINI_META);
    expect((await store.describe("anthropic"))?.storageMode).toBe("session");
    expect((await store.describe("gemini"))?.storageMode).toBe("persistent");
  });

  it("removeAll leaves nothing in either mode", async () => {
    const { store } = build();
    await store.save(SECRET, "session", META);
    await store.save(GEMINI_SECRET, "persistent", GEMINI_META);
    await store.removeAll();
    expect(await store.list()).toEqual([]);
    expect(await store.load("anthropic")).toBeUndefined();
    expect(await store.load("gemini")).toBeUndefined();
    expect(leaks(await rawContents(), GEMINI_SECRET)).toBe(false);
  });

  it("binds each ciphertext to its provider: a record moved to another provider id does not decrypt", async () => {
    const { store, storage } = build();
    await store.save(GEMINI_SECRET, "persistent", GEMINI_META);
    const record = (await storage.getCredentialRecord("gemini")) as CredentialRecord;
    await storage.putCredentialRecord({ ...record, id: "anthropic", providerId: "anthropic" });
    expect(await store.load("anthropic")).toBeUndefined();
  });
});
