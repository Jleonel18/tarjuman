import type { SecretHandle } from "@tarjuman/core";
import { destroySecret } from "@tarjuman/core";

export interface SessionCredentialMeta {
  providerId: string;
  maskedHint: string;
  validatedAt: string;
}

/**
 * Holds the "this session only" key in memory (FR-016). It is deliberately a plain object in this
 * module and not `sessionStorage`: a reload, a closed tab, or a call to `clear()` drops it, and
 * nothing about it is ever written to disk.
 */
export class SessionSecrets {
  #handle: SecretHandle | undefined;
  #meta: SessionCredentialMeta | undefined;

  set(handle: SecretHandle, meta: SessionCredentialMeta): void {
    this.clear();
    this.#handle = handle;
    this.#meta = meta;
  }

  get handle(): SecretHandle | undefined {
    return this.#handle;
  }

  get meta(): SessionCredentialMeta | undefined {
    return this.#meta;
  }

  clear(): void {
    if (this.#handle) destroySecret(this.#handle);
    this.#handle = undefined;
    this.#meta = undefined;
  }
}

/** The instance the app uses. Tests create their own to simulate a reload. */
export const defaultSessionSecrets = new SessionSecrets();
