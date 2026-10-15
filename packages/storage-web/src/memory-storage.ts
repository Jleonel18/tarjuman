import type { Collection, StoragePort, StorageQuery, StoredRecord } from "@tarjuman/core";
import { StorageDetachedError, type CredentialRecord, type CredentialRecordAccess } from "./indexeddb-storage";
import { defaultLocalStorage, removeTarjumanKeys, type LocalStorageLike } from "./local-storage";

const clone = <T>(value: T): T => structuredClone(value);

/**
 * The fallback when the browser blocks IndexedDB (private mode, blocked site data). Everything
 * lives in memory and is gone on reload, which is exactly what the user is told in that mode
 * (FR-016, storage-port invariant 5). It never touches the disk, apart from removing the
 * `tarjuman.*` preferences in `localStorage` on "delete all" (003 FR-003a).
 */
export class MemoryStorage implements StoragePort, CredentialRecordAccess {
  readonly #tables = new Map<Collection, Map<string, StoredRecord>>();
  readonly #credentials = new Map<string, CredentialRecord>();
  readonly #localStorage: LocalStorageLike | undefined;
  #detached = false;

  /** `localStorage` defaults to the browser's; `undefined` means there is none. */
  constructor(options: { localStorage?: LocalStorageLike | undefined } = {}) {
    this.#localStorage = "localStorage" in options ? options.localStorage : defaultLocalStorage();
  }

  /** Refuses every later operation, as `IndexedDbStorage.detach` does (001 FR-017a). */
  detach(): void {
    this.#detached = true;
  }

  #check(): void {
    if (this.#detached) throw new StorageDetachedError();
  }

  #table(collection: Collection): Map<string, StoredRecord> {
    let table = this.#tables.get(collection);
    if (!table) {
      table = new Map();
      this.#tables.set(collection, table);
    }
    return table;
  }

  async get<T>(collection: Collection, id: string): Promise<T | undefined> {
    this.#check();
    const value = this.#table(collection).get(id);
    return value === undefined ? undefined : (clone(value) as T);
  }

  async put<T extends StoredRecord>(collection: Collection, value: T): Promise<void> {
    this.#check();
    this.#table(collection).set(value.id, clone(value));
  }

  async delete(collection: Collection, id: string): Promise<void> {
    this.#check();
    this.#table(collection).delete(id);
  }

  async query<T>(collection: Collection, q?: StorageQuery): Promise<T[]> {
    this.#check();
    const all = [...this.#table(collection).values()] as unknown as Record<string, unknown>[];
    const rows = q ? all.filter((row) => row[q.index] === q.equals) : all;
    return clone(rows) as T[];
  }

  async clearAll(): Promise<void> {
    this.#check();
    this.#tables.clear();
    this.#credentials.clear();
    removeTarjumanKeys(this.#localStorage);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getCredentialRecord(providerId: string): Promise<CredentialRecord | undefined> {
    this.#check();
    return this.#credentials.get(providerId);
  }

  async listCredentialRecords(): Promise<CredentialRecord[]> {
    this.#check();
    return [...this.#credentials.values()];
  }

  async putCredentialRecord(record: CredentialRecord): Promise<void> {
    this.#check();
    if (record.id !== record.providerId) throw new Error("A credential record is keyed by its provider id.");
    this.#credentials.set(record.providerId, record);
  }

  async deleteCredentialRecord(providerId: string): Promise<void> {
    this.#check();
    this.#credentials.delete(providerId);
  }

  async deleteAllCredentialRecords(): Promise<void> {
    this.#check();
    this.#credentials.clear();
  }
}
