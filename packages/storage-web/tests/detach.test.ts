import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { deleteDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import { DB_NAME, IndexedDbStorage, StorageDetachedError } from "../src/indexeddb-storage";
import { MemoryStorage } from "../src/memory-storage";

// A tab that hears another tab is deleting all data detaches its storage, so nothing it still has
// in flight can write the deleted data back (001 FR-017a, security review finding 1).

const noWebExtras = { cacheStorage: undefined, serviceWorker: undefined, localStorage: undefined };
const RECORD = { id: "profile", targetLanguage: "ja" };

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

async function everyOperation(storage: IndexedDbStorage | MemoryStorage): Promise<unknown[]> {
  return Promise.all([
    storage.get("profile", "profile").catch((e: unknown) => e),
    storage.put("profile", RECORD).catch((e: unknown) => e),
    storage.delete("profile", "profile").catch((e: unknown) => e),
    storage.query("messages").catch((e: unknown) => e),
    storage.getCredentialRecord("mock").catch((e: unknown) => e),
    storage.listCredentialRecords().catch((e: unknown) => e),
    storage.deleteCredentialRecord("mock").catch((e: unknown) => e),
    storage.deleteAllCredentialRecords().catch((e: unknown) => e),
    storage.clearAll().catch((e: unknown) => e),
  ]);
}

describe("IndexedDbStorage.detach", () => {
  it("makes every operation reject with StorageDetachedError", async () => {
    const storage = new IndexedDbStorage(noWebExtras);
    await storage.put("profile", RECORD);
    storage.detach();
    const results = await everyOperation(storage);
    expect(results.every((r) => r instanceof StorageDetachedError)).toBe(true);
    expect(await storage.isAvailable()).toBe(false);
  });

  it("closes its connection, so another tab's deletion is not blocked", async () => {
    const storage = new IndexedDbStorage(noWebExtras);
    await storage.put("profile", RECORD);
    storage.detach();
    let blocked = false;
    await deleteDB(DB_NAME, { blocked: () => (blocked = true) });
    expect(blocked).toBe(false);
  });

  it("never reopens, and so never recreates, a database another tab deleted", async () => {
    const storage = new IndexedDbStorage(noWebExtras);
    await storage.put("profile", RECORD);
    storage.detach();
    await deleteDB(DB_NAME);
    await everyOperation(storage);
    expect(await indexedDB.databases()).toEqual([]);
  });
});

describe("MemoryStorage.detach", () => {
  it("makes every operation reject with StorageDetachedError", async () => {
    const storage = new MemoryStorage({ localStorage: undefined });
    await storage.put("profile", RECORD);
    storage.detach();
    const results = await everyOperation(storage);
    expect(results.every((r) => r instanceof StorageDetachedError)).toBe(true);
  });
});
