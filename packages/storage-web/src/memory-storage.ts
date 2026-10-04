import type { Collection, StoragePort, StorageQuery, StoredRecord } from "@tarjuman/core";
import type { CredentialRecord, CredentialRecordAccess } from "./indexeddb-storage";

const clone = <T>(value: T): T => structuredClone(value);

/**
 * The fallback when the browser blocks IndexedDB (private mode, blocked site data). Everything
 * lives in memory and is gone on reload, which is exactly what the user is told in that mode
 * (FR-016, storage-port invariant 5). It never touches the disk.
 */
export class MemoryStorage implements StoragePort, CredentialRecordAccess {
  readonly #tables = new Map<Collection, Map<string, StoredRecord>>();
  #credential: CredentialRecord | undefined;

  #table(collection: Collection): Map<string, StoredRecord> {
    let table = this.#tables.get(collection);
    if (!table) {
      table = new Map();
      this.#tables.set(collection, table);
    }
    return table;
  }

  async get<T>(collection: Collection, id: string): Promise<T | undefined> {
    const value = this.#table(collection).get(id);
    return value === undefined ? undefined : (clone(value) as T);
  }

  async put<T extends StoredRecord>(collection: Collection, value: T): Promise<void> {
    this.#table(collection).set(value.id, clone(value));
  }

  async delete(collection: Collection, id: string): Promise<void> {
    this.#table(collection).delete(id);
  }

  async query<T>(collection: Collection, q?: StorageQuery): Promise<T[]> {
    const all = [...this.#table(collection).values()] as unknown as Record<string, unknown>[];
    const rows = q ? all.filter((row) => row[q.index] === q.equals) : all;
    return clone(rows) as T[];
  }

  async clearAll(): Promise<void> {
    this.#tables.clear();
    this.#credential = undefined;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getCredentialRecord(): Promise<CredentialRecord | undefined> {
    return this.#credential;
  }

  async putCredentialRecord(record: CredentialRecord): Promise<void> {
    this.#credential = record;
  }

  async deleteCredentialRecord(): Promise<void> {
    this.#credential = undefined;
  }
}
