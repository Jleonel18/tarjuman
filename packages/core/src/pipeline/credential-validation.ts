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

/** A validator that knows whether it owns a credential id, so several can be combined. */
export interface RoutableCredentialValidator extends CredentialValidator {
  handles(credentialId: string): boolean;
}

/**
 * Sends each credential id to the validator that owns it: providers and search sources have one
 * key space (005 data-model → Credential id). An id nobody owns is rejected without a call.
 */
export class CompositeCredentialValidator implements CredentialValidator {
  readonly #validators: readonly RoutableCredentialValidator[];

  constructor(validators: readonly RoutableCredentialValidator[]) {
    this.#validators = Object.freeze([...validators]);
  }

  validate(credentialId: string, secret: SecretHandle, signal?: AbortSignalLike): Promise<ValidationResult> {
    const owner = this.#validators.find((v) => v.handles(credentialId));
    if (!owner) return Promise.resolve({ ok: false, code: "bad_request" });
    return owner.validate(credentialId, secret, signal);
  }
}

/** Thin wrapper: the request is the adapter's fixed, trusted probe with no user content. */
export class ProviderCredentialValidator implements RoutableCredentialValidator {
  readonly #providers: readonly ProviderPort[];

  constructor(providers: readonly ProviderPort[]) {
    this.#providers = Object.freeze([...providers]);
  }

  handles(providerId: string): boolean {
    return this.#providers.some((p) => p.id === providerId);
  }

  validate(providerId: string, secret: SecretHandle, signal?: AbortSignalLike): Promise<ValidationResult> {
    const provider = this.#providers.find((p) => p.id === providerId);
    // An unknown id is a programming error, reported like any rejected request; nothing falls back.
    if (!provider) return Promise.resolve({ ok: false, code: "bad_request" });
    return provider.validateCredential(secret, signal);
  }
}
