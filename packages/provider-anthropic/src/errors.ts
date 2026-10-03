import Anthropic from "@anthropic-ai/sdk";
import type { ProviderErrorCode } from "@tarjuman/core";

export interface ProviderFailure {
  code: ProviderErrorCode;
  retryAfterSeconds?: number;
}

/**
 * Maps anything the SDK or the transport throws to a code (research R5). Only the code leaves the
 * adapter: the raw message can contain request details, so it is never forwarded, which is also
 * how the key is kept out of errors, logs, and UI.
 */
export function mapProviderError(error: unknown): ProviderFailure {
  if (!(error instanceof Anthropic.APIError)) return { code: "network" };

  if (error.status !== undefined) return fromStatus(error.status, error.headers);
  // No status: an SSE `error` event after a 200, or a transport failure (no type either).
  return { code: fromType(error.type) };
}

function fromStatus(status: number, headers: Headers | undefined): ProviderFailure {
  switch (status) {
    case 400:
    case 404:
    case 413:
    case 422:
      return { code: "bad_request" };
    case 401:
      return { code: "invalid_credential" };
    case 402:
      return { code: "quota_exhausted" };
    case 403:
      return { code: "permission_denied" };
    case 429: {
      // A spend-cap 429 has no retry-after and persists, so the field is optional.
      const retry = Number(headers?.get("retry-after"));
      return Number.isFinite(retry) && retry >= 0 && headers?.get("retry-after")
        ? { code: "rate_limited", retryAfterSeconds: retry }
        : { code: "rate_limited" };
    }
    case 504:
      return { code: "network" };
    case 529:
      return { code: "overloaded" };
    default:
      return { code: "unknown" };
  }
}

function fromType(type: string | null): ProviderErrorCode {
  switch (type) {
    case "authentication_error":
      return "invalid_credential";
    case "billing_error":
      return "quota_exhausted";
    case "permission_error":
      return "permission_denied";
    case "rate_limit_error":
      return "rate_limited";
    case "overloaded_error":
      return "overloaded";
    case "invalid_request_error":
    case "not_found_error":
      return "bad_request";
    case "timeout_error":
      return "network";
    case "api_error":
      return "unknown";
    default:
      return "network";
  }
}
