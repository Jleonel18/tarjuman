import type { Collection, StoragePort, StorageQuery, StoredRecord } from "@tarjuman/core";
import { deleteDB, openDB, type IDBPDatabase } from "idb";
import { defaultLocalStorage, removeTarjumanKeys, tarjumanKeys, type LocalStorageLike } from "./local-storage";
import { defaultSessionSecrets, type SessionSecrets } from "./session-secrets";

export const DB_NAME = "tarjuman";
/**
 * 2 since 004: credential records are keyed by provider id instead of the fixed key "current".
 * 3 since 005: the `saved_resources` store. Only a store is created; no record is touched.
 */
export const DB_VERSION = 3;

/** The `credential` store is internal: it is not a `Collection`, so `StoragePort` cannot reach it. */
const CREDENTIAL_STORE = "credential";
/** The single credential key of version 1, moved to its provider id by the upgrade to version 2. */
const LEGACY_CREDENTIAL_KEY = "current";

export const COLLECTIONS: readonly Collection[] = [
  "profile",
  "settings",
  "conversations",
  "messages",
  "usage",
  "saved_resources",
];

/** What is persisted for a remembered key. The secret itself is only ever present as ciphertext. */
export interface CredentialRecord {
  /** Always equal to `providerId`: at most one record per provider (004 FR-004). */
  id: string;
  providerId: string;
  storageMode: "persistent";
  maskedHint: string;
  validatedAt: string;
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: Uint8Array<ArrayBuffer>;
  /** Non-extractable AES-GCM key. IndexedDB clones it without ever exposing its bytes. */
  wrappingKey: CryptoKey;
}

/** Access to the credential records for `WebCredentialStore`, kept out of `StoragePort`. */
export interface CredentialRecordAccess {
  getCredentialRecord(providerId: string): Promise<CredentialRecord | undefined>;
  listCredentialRecords(): Promise<CredentialRecord[]>;
  /** Stored under `record.id`, which must equal `record.providerId`. */
  putCredentialRecord(record: CredentialRecord): Promise<void>;
  deleteCredentialRecord(providerId: string): Promise<void>;
  deleteAllCredentialRecords(): Promise<void>;
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
  /** Holds the `tarjuman.*` preferences, such as the theme. Defaults to the browser's `localStorage`. */
  localStorage?: LocalStorageLike | undefined;
}

export class StorageNotEmptyError extends Error {
  constructor(detail: string) {
    super(`Could not verify that all Tarjuman data was removed: ${detail}`);
    this.name = "StorageNotEmptyError";
  }
}

/**
 * Thrown by a storage that was detached because another tab is deleting all data (001 FR-017a).
 * The tab restarts soon after; until then it must not write the deleted data back.
 */
export class StorageDetachedError extends Error {
  constructor() {
    super("Storage is detached: another tab is deleting all Tarjuman data.");
    this.name = "StorageDetachedError";
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
  readonly #localStorage: LocalStorageLike | undefined;
  #detached = false;

  constructor(options: IndexedDbStorageOptions = {}) {
    this.#sessionSecrets = options.sessionSecrets ?? defaultSessionSecrets;
    this.#cacheStorage =
      "cacheStorage" in options ? options.cacheStorage : (globalThis as { caches?: CacheStorageLike }).caches;
    this.#serviceWorker =
      "serviceWorker" in options
        ? options.serviceWorker
        : (globalThis as { navigator?: { serviceWorker?: ServiceWorkerContainerLike } }).navigator?.serviceWorker;
    this.#localStorage = "localStorage" in options ? options.localStorage : defaultLocalStorage();
  }

  /**
   * Another tab is deleting all data (001 FR-017a): close the connection so the deletion is not
   * blocked, and refuse every later operation, because opening the database again would recreate
   * it and anything still in flight here would write deleted data back. There is no way back; the
   * tab restarts instead.
   */
  detach(): void {
    this.#detached = true;
    void this.#close();
  }

  #open(): Promise<IDBPDatabase> {
    if (this.#detached) return Promise.reject(new StorageDetachedError());
    this.#dbPromise ??= openDB(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          for (const name of COLLECTIONS) {
            const store = db.createObjectStore(name, { keyPath: "id" });
            if (name === "messages" || name === "usage") store.createIndex("conversationId", "conversationId");
          }
          db.createObjectStore(CREDENTIAL_STORE, { keyPath: "id" });
        }
        if (oldVersion >= 1 && oldVersion < 2) {
          // Keep the key a learner saved before 004 (FR-002): same record, keyed by its provider.
          // The ciphertext's additional data is already the provider id, so it still decrypts.
          const credentials = transaction.objectStore(CREDENTIAL_STORE);
          const legacy = (await credentials.get(LEGACY_CREDENTIAL_KEY)) as CredentialRecord | undefined;
          if (legacy) {
            await credentials.put({ ...legacy, id: legacy.providerId });
            await credentials.delete(LEGACY_CREDENTIAL_KEY);
          }
        }
        if (oldVersion >= 1 && oldVersion < 3 && !db.objectStoreNames.contains("saved_resources")) {
          db.createObjectStore("saved_resources", { keyPath: "id" });
        }
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

  async getCredentialRecord(providerId: string): Promise<CredentialRecord | undefined> {
    return (await (await this.#open()).get(CREDENTIAL_STORE, providerId)) as CredentialRecord | undefined;
  }

  async listCredentialRecords(): Promise<CredentialRecord[]> {
    return (await (await this.#open()).getAll(CREDENTIAL_STORE)) as CredentialRecord[];
  }

  async putCredentialRecord(record: CredentialRecord): Promise<void> {
    if (record.id !== record.providerId) throw new Error("A credential record is keyed by its provider id.");
    await (await this.#open()).put(CREDENTIAL_STORE, record);
  }

  async deleteCredentialRecord(providerId: string): Promise<void> {
    await (await this.#open()).delete(CREDENTIAL_STORE, providerId);
  }

  async deleteAllCredentialRecords(): Promise<void> {
    await (await this.#open()).clear(CREDENTIAL_STORE);
  }

  /**
   * Removes every trace of Tarjuman data and verifies it (FR-017, SC-007). Dropping the database
   * also removes the wrapping CryptoKey, which lives inside it. The `tarjuman.*` keys in
   * `localStorage` (the theme preference, 003 FR-003a) go too. Throws `StorageNotEmptyError`
   * rather than reporting success it cannot confirm.
   */
  async clearAll(): Promise<void> {
    if (this.#detached) throw new StorageDetachedError();
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
    removeTarjumanKeys(this.#localStorage);

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
    if (tarjumanKeys(this.#localStorage).length > 0) {
      throw new StorageNotEmptyError("local storage entries remain");
    }
  }
}
