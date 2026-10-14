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

/**
 * At most one key per provider (004 FR-004). Keys of different providers live side by side, each
 * with its own mode, hint, and validation date; acting on one never touches another.
 */
export interface CredentialStore {
  /**
   * Stores under `meta.providerId`, replacing that provider's key in either mode. Called only after
   * a successful validation. The mode has no default (FR-016).
   */
  save(secret: string, mode: CredentialStorageMode, meta: CredentialMeta): Promise<void>;
  load(providerId: string): Promise<SecretHandle | undefined>;
  /** Never returns the secret. */
  describe(providerId: string): Promise<CredentialDescription | undefined>;
  /** Every stored key's description, never a secret. */
  list(): Promise<CredentialDescription[]>;
  /** Irrecoverable removal of one provider's key, in both modes (US7-1). */
  remove(providerId: string): Promise<void>;
  /** Irrecoverable removal of every key, in both modes ("delete all my data"). */
  removeAll(): Promise<void>;
}
