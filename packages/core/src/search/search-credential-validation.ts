import type { RoutableCredentialValidator } from "../pipeline/credential-validation";
import type { AbortSignalLike, ValidationResult } from "../ports/provider";
import type { SearchPort } from "../ports/search";
import type { SecretHandle } from "../ports/secret-handle";

/**
 * Validates a search key with the search port that owns the id. Like the provider validator, the
 * request is the adapter's fixed probe with no user content, and no other source ever sees the key.
 * Holds search ports, so it is on the SearchPort allow-list next to the broker.
 */
export class SearchCredentialValidator implements RoutableCredentialValidator {
  readonly #ports: readonly SearchPort[];

  constructor(ports: readonly SearchPort[]) {
    this.#ports = Object.freeze([...ports]);
  }

  handles(sourceId: string): boolean {
    return this.#ports.some((p) => p.id === sourceId);
  }

  validate(sourceId: string, secret: SecretHandle, signal?: AbortSignalLike): Promise<ValidationResult> {
    const port = this.#ports.find((p) => p.id === sourceId);
    if (!port) return Promise.resolve({ ok: false, code: "bad_request" });
    return port.validateCredential(secret, signal);
  }
}
