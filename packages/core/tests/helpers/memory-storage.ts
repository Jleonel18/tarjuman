import type { Collection, StoragePort, StorageQuery, StoredRecord } from "../../src/ports/storage";

/** In-memory StoragePort for core tests. The core cannot import the IndexedDB adapter. */
export class MemoryStorage implements StoragePort {
  readonly data = new Map<Collection, Map<string, StoredRecord>>();

  #table(collection: Collection): Map<string, StoredRecord> {
    let table = this.data.get(collection);
    if (!table) {
      table = new Map();
      this.data.set(collection, table);
    }
    return table;
  }

  async get<T>(collection: Collection, id: string): Promise<T | undefined> {
    const value = this.#table(collection).get(id);
    return value === undefined ? undefined : (structuredClone(value) as T);
  }

  async put<T extends StoredRecord>(collection: Collection, value: T): Promise<void> {
    this.#table(collection).set(value.id, structuredClone(value));
  }

  async delete(collection: Collection, id: string): Promise<void> {
    this.#table(collection).delete(id);
  }

  async query<T>(collection: Collection, q?: StorageQuery): Promise<T[]> {
    const all = [...this.#table(collection).values()] as Record<string, unknown>[];
    const rows = q ? all.filter((row) => row[q.index] === q.equals) : all;
    return structuredClone(rows) as T[];
  }

  async clearAll(): Promise<void> {
    this.data.clear();
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  count(collection: Collection): number {
    return this.#table(collection).size;
  }
}

/** Deterministic ids and clock, so tests never depend on crypto or Date. */
export function makeClock() {
  let n = 0;
  let t = 0;
  return {
    newId: () => `id-${++n}`,
    now: () => new Date(Date.UTC(2026, 9, 3, 0, 0, t++)).toISOString(),
  };
}
