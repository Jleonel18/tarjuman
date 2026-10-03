import type { AbortSignalLike, SecretHandle, ValidationResult } from "@tarjuman/core";
import { createClient, type AnthropicProviderOptions } from "./client";
import { mapProviderError } from "./errors";
import { cheapestModel } from "./models";

/** Fixed, trusted, and tiny: no user content, no tools, no thinking, no effort. */
const PROBE_PROMPT = "Reply with OK.";
const PROBE_MAX_TOKENS = 4;

/**
 * Validates a key with one minimal generation on the cheapest listed model (research R5).
 * The optional `GET /v1/models` pre-check is not implemented: it is unverified without a key.
 * It is reached only through `CredentialValidator`.
 */
export async function validateCredential(
  secret: SecretHandle,
  options: AnthropicProviderOptions,
  signal?: AbortSignalLike,
): Promise<ValidationResult> {
  if (signal?.aborted) return { ok: false, code: "network" };

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    await createClient(secret, options).messages.create(
      {
        model: cheapestModel().id,
        max_tokens: PROBE_MAX_TOKENS,
        messages: [{ role: "user", content: PROBE_PROMPT }],
      },
      { signal: controller.signal },
    );
    return { ok: true };
  } catch (error) {
    return { ok: false, code: mapProviderError(error).code };
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}
