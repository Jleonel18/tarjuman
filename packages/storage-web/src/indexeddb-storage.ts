import type { Collection, StoragePort, StorageQuery, StoredRecord } from "@tarjuman/core";
import { deleteDB, openDB, type IDBPDatabase } from "idb";
import { defaultSessionSecrets, type SessionSecrets } from "./session-secrets";

export const DB_NAME = "tarjuman";
export const DB_VERSION = 1;

/** The `credential` store is internal: it is not a `Collection`, so `StoragePort` cannot reach it. */
const CREDENTIAL_STORE = "credential";
const CREDENTIAL_KEY = "current";

export const COLLECTIONS: readonly Collection[] = [
  "profile",
  "settings",
  "conversations",
  "messages",
  "usage",
];

/** What is persisted for a remembered key. The secret itself is only ever present as ciphertext. */
export interface CredentialRecord {
  id: typeof CREDENTIAL_KEY;
  providerId: string;
  storageMode: "persistent";
  maskedHint: string;
  validatedAt: string;
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: Uint8Array<ArrayBuffer>;
  /** Non-extractable AES-GCM key. IndexedDB clones it without ever exposing its bytes. */
  wrappingKey: CryptoKey;
}

/** Access to the credential record for `WebCredentialStore`, kept out of `StoragePort`. */
export interface CredentialRecordAccess {
  getCredentialRecord(): Promise<CredentialRecord | undefined>;
  putCredentialRecord(record: CredentialRecord): Promise<void>;
  deleteCredentialRecord(): Promise<void>;
}

/** Minimal views of browser APIs so tests can inject doubles. */
export interface CacheStorageLike {
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
}

export interface ServiceWorkerContainerLike {
  getRegistrations(): Promise<readonly { unregister(): Promise<boolean> }[]>;
}

export interface IndexedDbStorageOptions {
  sessionSecrets?: SessionSecrets;
  cacheStorage?: CacheStorageLike | undefined;
  serviceWorker?: ServiceWorkerContainerLike | undefined;
}

export class StorageNotEmptyError extends Error {
  constructor(detail: string) {
    super(`Could not verify that all Tarjuman data was removed: ${detail}`);
    this.name = "StorageNotEmptyError";
  }
}

/**
 * IndexedDB implementation of `StoragePort` (contracts/storage-port.md). One database,
 * `tarjuman`, with a store per collection. It uses the global `indexedDB`, as `idb` does.
 */
export class IndexedDbStorage implements StoragePort, CredentialRecordAccess {
  #dbPromise: Promise<IDBPDatabase> | undefined;
  readonly #sessionSecrets: SessionSecrets;
  readonly #cacheStorage: CacheStorageLike | undefined;
  readonly #serviceWorker: ServiceWorkerContainerLike | undefined;

  constructor(options: IndexedDbStorageOptions = {}) {
    this.#sessionSecrets = options.sessionSecrets ?? defaultSessionSecrets;
    this.#cacheStorage =
      "cacheStorage" in options ? options.cacheStorage : (globalThis as { caches?: CacheStorageLike }).caches;
    this.#serviceWorker =
      "serviceWorker" in options
        ? options.serviceWorker
        : (globalThis as { navigator?: { serviceWorker?: ServiceWorkerContainerLike } }).navigator?.serviceWorker;
  }

  #open(): Promise<IDBPDatabase> {
    this.#dbPromise ??= openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const name of COLLECTIONS) {
          const store = db.createObjectStore(name, { keyPath: "id" });
          if (name === "messages" || name === "usage") store.createIndex("conversationId", "conversationId");
        }
        db.createObjectStore(CREDENTIAL_STORE, { keyPath: "id" });
      },
      // Another tab is deleting or upgrading the database: step aside instead of blocking it.
      blocking() {
        void closeQuietly();
      },
      terminated: () => {
        this.#dbPromise = undefined;
      },
    });
    const closeQuietly = async () => {
      const pending = this.#dbPromise;
      this.#dbPromise = undefined;
      (await pending)?.close();
    };
    return this.#dbPromise;
  }

  async #close(): Promise<void> {
    const pending = this.#dbPromise;
    this.#dbPromise = undefined;
    if (pending) (await pending.catch(() => undefined))?.close();
  }

  async isAvailable(): Promise<boolean> {
    try {
      if (typeof indexedDB === "undefined") return false;
      await this.#open();
      return true;
    } catch {
      this.#dbPromise = undefined;
      return false;
    }
  }

  async get<T>(collection: Collection, id: string): Promise<T | undefined> {
    return (await (await this.#open()).get(collection, id)) as T | undefined;
  }

  async put<T extends StoredRecord>(collection: Collection, value: T): Promise<void> {
    await (await this.#open()).put(collection, value);
  }

  async delete(collection: Collection, id: string): Promise<void> {
    await (await this.#open()).delete(collection, id);
  }

  async query<T>(collection: Collection, q?: StorageQuery): Promise<T[]> {
    const db = await this.#open();
    if (q) return (await db.getAllFromIndex(collection, q.index, q.equals)) as T[];
    return (await db.getAll(collection)) as T[];
  }

  async getCredentialRecord(): Promise<CredentialRecord | undefined> {
    return (await (await this.#open()).get(CREDENTIAL_STORE, CREDENTIAL_KEY)) as CredentialRecord | undefined;
  }

  async putCredentialRecord(record: CredentialRecord): Promise<void> {
    await (await this.#open()).put(CREDENTIAL_STORE, record);
  }

  async deleteCredentialRecord(): Promise<void> {
    await (await this.#open()).delete(CREDENTIAL_STORE, CREDENTIAL_KEY);
  }

  /**
   * Removes every trace of Tarjuman data and verifies it (FR-017, SC-007). Dropping the database
   * also removes the wrapping CryptoKey, which lives inside it. Throws `StorageNotEmptyError`
   * rather than reporting success it cannot confirm.
   */
  async clearAll(): Promise<void> {
    this.#sessionSecrets.clear();
    await this.#close();
    await deleteDB(DB_NAME, {
      blocked: () => {
        // Another tab still holds a connection; our own `blocking` handler there closes it.
      },
    });

    if (this.#cacheStorage) {
      for (const name of await this.#cacheStorage.keys()) await this.#cacheStorage.delete(name);
    }
    if (this.#serviceWorker) {
      for (const registration of await this.#serviceWorker.getRegistrations()) await registration.unregister();
    }

    await this.#verifyEmpty();
  }

  async #verifyEmpty(): Promise<void> {
    // If the database still existed, reopening it would not run `upgrade`. An upgrade from
    // version 0 proves it was gone. The probe database is deleted again right away.
    let wasFresh = false;
    const probe = await openDB(DB_NAME, DB_VERSION, {
      upgrade(_db, oldVersion) {
        wasFresh = oldVersion === 0;
      },
    });
    probe.close();
    await deleteDB(DB_NAME);

    if (!wasFresh) throw new StorageNotEmptyError("the database still exists after deletion");
    if (this.#cacheStorage && (await this.#cacheStorage.keys()).length > 0) {
      throw new StorageNotEmptyError("cache storage entries remain");
    }
    if (this.#serviceWorker && (await this.#serviceWorker.getRegistrations()).length > 0) {
      throw new StorageNotEmptyError("service worker registrations remain");
    }
  }
}
