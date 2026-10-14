import type { SecretHandle } from "@tarjuman/core";
import { destroySecret } from "@tarjuman/core";

export interface SessionCredentialMeta {
  providerId: string;
  maskedHint: string;
  validatedAt: string;
}

interface Entry {
  handle: SecretHandle;
  meta: SessionCredentialMeta;
}

/**
 * Holds the "this session only" keys in memory (FR-016), one per provider (004 FR-004). It is
 * deliberately a plain object in this module and not `sessionStorage`: a reload, a closed tab, or
 * a call to `clear()` drops them, and nothing about them is ever written to disk.
 */
export class SessionSecrets {
  readonly #entries = new Map<string, Entry>();

  /** Replaces this provider's session key only. */
  set(handle: SecretHandle, meta: SessionCredentialMeta): void {
    this.delete(meta.providerId);
    this.#entries.set(meta.providerId, { handle, meta });
  }

  handle(providerId: string): SecretHandle | undefined {
    return this.#entries.get(providerId)?.handle;
  }

  meta(providerId: string): SessionCredentialMeta | undefined {
    return this.#entries.get(providerId)?.meta;
  }

  /** Every provider that has a session key. */
  providerIds(): string[] {
    return [...this.#entries.keys()];
  }

  /** Drops and invalidates this provider's session key, if any. */
  delete(providerId: string): void {
    const entry = this.#entries.get(providerId);
    if (entry) destroySecret(entry.handle);
    this.#entries.delete(providerId);
  }

  /** Drops and invalidates every session key. */
  clear(): void {
    for (const providerId of this.providerIds()) this.delete(providerId);
  }
}

/** The instance the app uses. Tests create their own to simulate a reload. */
export const defaultSessionSecrets = new SessionSecrets();
