import type { SecretHandle } from "./secret-handle";

/**
 * StoragePort and CredentialStore: the persistence boundary (FR-005, FR-013, FR-017).
 * See contracts/storage-port.md. The web adapter uses IndexedDB and WebCrypto.
 */

export type Collection = "profile" | "settings" | "conversations" | "messages" | "usage";

export interface StoredRecord {
  id: string;
}

export interface StorageQuery {
  index: string;
  equals: string;
}

export interface StoragePort {
  get<T>(collection: Collection, id: string): Promise<T | undefined>;
  put<T extends StoredRecord>(collection: Collection, value: T): Promise<void>;
  delete(collection: Collection, id: string): Promise<void>;
  query<T>(collection: Collection, q?: StorageQuery): Promise<T[]>;
  /** Must leave zero Tarjuman data and verify it (SC-007); throws if emptiness cannot be verified. */
  clearAll(): Promise<void>;
  /** False in private mode or when the browser blocks storage. */
  isAvailable(): Promise<boolean>;
}

export type CredentialStorageMode = "persistent" | "session";

export interface CredentialMeta {
  providerId: string;
  /** Only displayable form of the key (FR-015), e.g. "sk-ant-…a1b2". */
  maskedHint: string;
}

export interface CredentialDescription extends CredentialMeta {
  storageMode: CredentialStorageMode;
  validatedAt: string;
}

export interface CredentialStore {
  /** Called only after a successful validation. The mode has no default (FR-016). */
  save(secret: string, mode: CredentialStorageMode, meta: CredentialMeta): Promise<void>;
  load(): Promise<SecretHandle | undefined>;
  /** Never returns the secret. */
  describe(): Promise<CredentialDescription | undefined>;
  /** Irrecoverable removal (US7-1). */
  remove(): Promise<void>;
}
