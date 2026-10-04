import type { CredentialValidator } from "../pipeline/credential-validation";
import { destroySecret, sealSecret } from "../ports/secret-handle";
import type { CredentialStorageMode, CredentialStore } from "../ports/storage";

/** Derived from the validator so this module never imports the provider port. */
type ValidationFailure = Extract<Awaited<ReturnType<CredentialValidator["validate"]>>, { ok: false }>;

export type KeyState = "absent" | "validating" | "stored" | "rejected";

export type EnterKeyOutcome = { ok: true; maskedHint: string } | ValidationFailure;

export interface KeyManagerDeps {
  /** Never a `ProviderPort`: key handling reaches the provider only through the pipeline module. */
  validator: CredentialValidator;
  store: CredentialStore;
  providerId: string;
}

/** `sk-ant-api03-…-a1b2` becomes `sk-ant-…a1b2` (FR-015): a prefix and the last four characters. */
function maskKey(key: string): string {
  const prefix = key.startsWith("sk-ant-") ? "sk-ant-" : "";
  return `${prefix}…${key.slice(-4)}`;
}

/**
 * Takes a key from the user, checks it, and stores it only if it is valid (storage-port
 * invariant 1). A rejected key is dropped and never reaches the store.
 */
export class KeyManager {
  readonly #deps: KeyManagerDeps;
  #state: KeyState = "absent";

  constructor(deps: KeyManagerDeps) {
    this.#deps = deps;
  }

  get state(): KeyState {
    return this.#state;
  }

  /** `mode` is required and has no default: the user chooses where the key lives (FR-016). */
  async enter(rawKey: string, mode: CredentialStorageMode): Promise<EnterKeyOutcome> {
    const key = rawKey.trim();
    if (key === "") {
      this.#state = "rejected";
      return { ok: false, code: "invalid_credential" };
    }

    this.#state = "validating";
    const handle = sealSecret(key);
    try {
      const result = await this.#deps.validator.validate(handle);
      if (!result.ok) {
        this.#state = "rejected";
        return { ok: false, code: result.code };
      }
      const maskedHint = maskKey(key);
      await this.#deps.store.save(key, mode, { providerId: this.#deps.providerId, maskedHint });
      this.#state = "stored";
      return { ok: true, maskedHint };
    } catch (error) {
      this.#state = "rejected";
      throw error;
    } finally {
      destroySecret(handle);
    }
  }
}
