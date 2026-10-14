import type {
  CredentialDescription,
  CredentialMeta,
  CredentialStorageMode,
  CredentialStore,
  SecretHandle,
} from "@tarjuman/core";
import { sealSecret } from "@tarjuman/core";
import { unsealSecret } from "@tarjuman/core/adapter";
import type { CredentialRecordAccess } from "./indexeddb-storage";
import { defaultSessionSecrets, type SessionSecrets } from "./session-secrets";

export interface WebCredentialStoreOptions {
  records: CredentialRecordAccess;
  sessionSecrets?: SessionSecrets;
  crypto?: Crypto;
  now?: () => string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Web `CredentialStore` (contracts/storage-port.md, FR-013, FR-016), one key per provider
 * (004 contracts/multi-provider-core.md).
 *
 * - `persistent`: a fresh non-extractable AES-GCM key encrypts the secret. The `CryptoKey` and the
 *   `{ iv, ciphertext }` go into IndexedDB; the secret is never stored in the clear.
 * - `session`: the secret lives only in memory and nothing about it is written to disk. A reload
 *   forgets it and the app asks again.
 *
 * Honest limit: a non-extractable key stops the bytes from being copied, but script running on
 * this origin could still ask the browser to decrypt. The CSP and the lack of third-party
 * scripts are what make that unlikely (see SECURITY.md).
 */
export class WebCredentialStore implements CredentialStore {
  readonly #records: CredentialRecordAccess;
  readonly #session: SessionSecrets;
  readonly #crypto: Crypto;
  readonly #now: () => string;

  constructor(options: WebCredentialStoreOptions) {
    this.#records = options.records;
    this.#session = options.sessionSecrets ?? defaultSessionSecrets;
    this.#crypto = options.crypto ?? globalThis.crypto;
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async save(secret: string, mode: CredentialStorageMode, meta: CredentialMeta): Promise<void> {
    if (secret.length === 0) throw new Error("Cannot store an empty key.");
    // The hint is the only part of the key ever displayed; it must never be the key itself.
    if (meta.maskedHint.includes(secret)) throw new Error("The masked hint must not contain the key.");
    const { providerId } = meta;
    const validatedAt = this.#now();

    if (mode === "session") {
      // Switching to session-only must not leave this provider's remembered key behind. Other
      // providers' keys are not touched (004 FR-004).
      await this.#records.deleteCredentialRecord(providerId);
      this.#session.set(sealSecret(secret), { providerId, maskedHint: meta.maskedHint, validatedAt });
      return;
    }

    const subtle = this.#crypto.subtle;
    const wrappingKey = await subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const iv = this.#crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = new Uint8Array(
      await subtle.encrypt(
        // Binding the provider id as additional data ties the ciphertext to its record.
        { name: "AES-GCM", iv, additionalData: encoder.encode(providerId) },
        wrappingKey,
        encoder.encode(secret),
      ),
    );
    await this.#records.putCredentialRecord({
      id: providerId,
      providerId,
      storageMode: "persistent",
      maskedHint: meta.maskedHint,
      validatedAt,
      iv,
      ciphertext,
      wrappingKey,
    });
    this.#session.delete(providerId);
  }

  async load(providerId: string): Promise<SecretHandle | undefined> {
    const sessionHandle = this.#session.handle(providerId);
    if (sessionHandle) return sessionHandle;
    const record = await this.#records.getCredentialRecord(providerId);
    if (!record) return undefined;
    try {
      const plaintext = await this.#crypto.subtle.decrypt(
        // The id asked for, not the one in the record: a record moved to another provider fails.
        { name: "AES-GCM", iv: record.iv, additionalData: encoder.encode(providerId) },
        record.wrappingKey,
        record.ciphertext,
      );
      return sealSecret(decoder.decode(plaintext));
    } catch {
      // Tampered or unreadable: treat as absent so the user can enter the key again.
      return undefined;
    }
  }

  async describe(providerId: string): Promise<CredentialDescription | undefined> {
    const meta = this.#session.meta(providerId);
    if (this.#session.handle(providerId) && meta) {
      return { providerId, maskedHint: meta.maskedHint, validatedAt: meta.validatedAt, storageMode: "session" };
    }
    const record = await this.#records.getCredentialRecord(providerId);
    if (!record) return undefined;
    return { providerId, maskedHint: record.maskedHint, validatedAt: record.validatedAt, storageMode: "persistent" };
  }

  async list(): Promise<CredentialDescription[]> {
    const ids = new Set([...this.#session.providerIds(), ...(await this.#records.listCredentialRecords()).map((r) => r.providerId)]);
    const out: CredentialDescription[] = [];
    for (const id of ids) {
      const description = await this.describe(id);
      if (description) out.push(description);
    }
    return out;
  }

  async remove(providerId: string): Promise<void> {
    this.#session.delete(providerId);
    await this.#records.deleteCredentialRecord(providerId);
  }

  async removeAll(): Promise<void> {
    this.#session.clear();
    await this.#records.deleteAllCredentialRecords();
  }
}

// Re-exported so adapters can read a loaded handle without a second deep import.
export { unsealSecret };
