import type { AbortSignalLike, ProviderPort, ValidationResult } from "../ports/provider";
import type { SecretHandle } from "../ports/secret-handle";

/**
 * The only way for key handling to reach a provider (contracts/pipeline.md). `KeyManager`
 * depends on this interface, never on `ProviderPort`, so no other module holds a provider.
 */
export interface CredentialValidator {
  validate(secret: SecretHandle, signal?: AbortSignalLike): Promise<ValidationResult>;
}

/** Thin wrapper: the request is the adapter's fixed, trusted prompt with no user content. */
export class ProviderCredentialValidator implements CredentialValidator {
  readonly #provider: ProviderPort;

  constructor(provider: ProviderPort) {
    this.#provider = provider;
  }

  validate(secret: SecretHandle, signal?: AbortSignalLike): Promise<ValidationResult> {
    return this.#provider.validateCredential(secret, signal);
  }
}
