import type { CredentialValidator } from "../pipeline/credential-validation";
import { destroySecret, sealSecret } from "../ports/secret-handle";
import type { CredentialStorageMode, CredentialStore } from "../ports/storage";
import { hasKeyShape, maskKey, providerOfKey } from "./key-shapes";

/** Derived from the validator so this module never imports the provider port. */
type ValidationFailure = Extract<Awaited<ReturnType<CredentialValidator["validate"]>>, { ok: false }>;

export type KeyState = "absent" | "validating" | "stored" | "rejected";

/**
 * `wrong_provider`: the key's shape belongs to another known provider (004 FR-007). It is decided
 * locally and the key is sent nowhere. `expectedProviderId` names the provider the shape belongs to.
 */
export type WrongProvider = { ok: false; code: "wrong_provider"; expectedProviderId: string };

export type EnterKeyOutcome = { ok: true; maskedHint: string } | ValidationFailure | WrongProvider;

export interface KeyManagerDeps {
  /** Never a `ProviderPort`: key handling reaches the provider only through the pipeline module. */
  validator: CredentialValidator;
  store: CredentialStore;
}


/**
 * Takes a key from the user, checks it, and stores it only if it is valid (storage-port
 * invariant 1). A rejected key is dropped and never reaches the store. Every operation names the
 * provider it is for, and never touches another provider's key (004 FR-004).
 */
export class KeyManager {
  readonly #deps: KeyManagerDeps;
  readonly #states = new Map<string, KeyState>();

  constructor(deps: KeyManagerDeps) {
    this.#deps = deps;
  }

  stateOf(providerId: string): KeyState {
    return this.#states.get(providerId) ?? "absent";
  }

  /** `mode` is required and has no default: the user chooses where the key lives (FR-016). */
  async enter(providerId: string, rawKey: string, mode: CredentialStorageMode): Promise<EnterKeyOutcome> {
    return this.#validateAndStore(providerId, rawKey, mode, { replacing: false });
  }

  /**
   * Replaces the stored key (US7-1): `stored → validating → stored`. The old key is removed only
   * once the new one validates, then the new one is stored. A rejected replacement keeps the old
   * key, so the learner is never left without a working key by a typo.
   */
  async replace(providerId: string, rawKey: string, mode: CredentialStorageMode): Promise<EnterKeyOutcome> {
    return this.#validateAndStore(providerId, rawKey, mode, { replacing: true });
  }

  /** Deletes that provider's key irrecoverably: `stored → absent`. The app then asks for a key again. */
  async remove(providerId: string): Promise<void> {
    await this.#deps.store.remove(providerId);
    this.#states.set(providerId, "absent");
  }

  async #validateAndStore(
    providerId: string,
    rawKey: string,
    mode: CredentialStorageMode,
    { replacing }: { replacing: boolean },
  ): Promise<EnterKeyOutcome> {
    // A failed replacement leaves the old key in place, so the state goes back to `stored`.
    const failedState: KeyState = replacing ? "stored" : "rejected";
    const key = rawKey.trim();
    if (key === "") {
      this.#states.set(providerId, failedState);
      return { ok: false, code: "invalid_credential" };
    }
    // A key that is recognizably another provider's never leaves the device (004 FR-007). Only
    // judged for a provider whose own keys have a known shape: dev and test providers take any key.
    const shapeProvider = providerOfKey(key);
    if (shapeProvider !== undefined && shapeProvider !== providerId && hasKeyShape(providerId)) {
      this.#states.set(providerId, failedState);
      return { ok: false, code: "wrong_provider", expectedProviderId: shapeProvider };
    }

    this.#states.set(providerId, "validating");
    const handle = sealSecret(key);
    let oldKeyRemoved = false;
    try {
      const result = await this.#deps.validator.validate(providerId, handle);
      if (!result.ok) {
        this.#states.set(providerId, failedState);
        return { ok: false, code: result.code };
      }
      const maskedHint = maskKey(key);
      // Explicit removal, so no adapter can keep the old key next to the new one (for example
      // when the storage mode changes).
      if (replacing) {
        oldKeyRemoved = true;
        await this.#deps.store.remove(providerId);
      }
      await this.#deps.store.save(key, mode, { providerId, maskedHint });
      this.#states.set(providerId, "stored");
      return { ok: true, maskedHint };
    } catch (error) {
      // Once the old key is gone, a failed save leaves no key at all.
      this.#states.set(providerId, oldKeyRemoved ? "absent" : failedState);
      throw error;
    } finally {
      destroySecret(handle);
    }
  }
}
