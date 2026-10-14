import type { AbortSignalLike, ProviderPort, ValidationResult } from "../ports/provider";
import type { SecretHandle } from "../ports/secret-handle";

/**
 * The only way for key handling to reach a provider (contracts/pipeline.md). `KeyManager`
 * depends on this interface, never on `ProviderPort`, so no other module holds a provider.
 */
export interface CredentialValidator {
  /** Checks the key with the named provider only; no other provider ever sees it (004 FR-007). */
  validate(providerId: string, secret: SecretHandle, signal?: AbortSignalLike): Promise<ValidationResult>;
}

/** Thin wrapper: the request is the adapter's fixed, trusted probe with no user content. */
export class ProviderCredentialValidator implements CredentialValidator {
  readonly #providers: readonly ProviderPort[];

  constructor(providers: readonly ProviderPort[]) {
    this.#providers = Object.freeze([...providers]);
  }

  validate(providerId: string, secret: SecretHandle, signal?: AbortSignalLike): Promise<ValidationResult> {
    const provider = this.#providers.find((p) => p.id === providerId);
    // An unknown id is a programming error, reported like any rejected request; nothing falls back.
    if (!provider) return Promise.resolve({ ok: false, code: "bad_request" });
    return provider.validateCredential(secret, signal);
  }
}
