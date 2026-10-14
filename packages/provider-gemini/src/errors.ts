import type { ProviderErrorCode } from "@tarjuman/core";

/**
 * Gemini failures → the app's error codes (004 research R6). Only the HTTP status and three
 * allow-listed fields of a `google.rpc.Status` body are read: `error.status`, a detail's `reason`,
 * and a `RetryInfo.retryDelay`. The message text is never read, so it cannot reach a code, an
 * event, or the UI, and neither can anything the server echoed back.
 */
export interface MappedError {
  code: ProviderErrorCode;
  retryAfterSeconds?: number;
}

export function mapStatus(status: number): MappedError {
  switch (status) {
    case 400:
    case 404:
      return { code: "bad_request" };
    case 401:
      return { code: "invalid_credential" };
    case 403:
      return { code: "permission_denied" };
    case 429:
      // A rate and a daily quota look the same here, so both are `rate_limited`; neither retries.
      return { code: "rate_limited" };
    case 503:
    case 504:
      return { code: "overloaded" };
    default:
      return { code: "unknown" };
  }
}

/** Maps an error status plus whatever body came with it; an unreadable body falls back to the status. */
export function mapErrorBody(status: number, body: unknown): MappedError {
  const error = isRecord(body) && isRecord(body["error"]) ? body["error"] : undefined;
  const details = error && Array.isArray(error["details"]) ? error["details"].filter(isRecord) : [];
  const reasons = details.map((d) => d["reason"]).filter((r): r is string => typeof r === "string");
  const rpcStatus = typeof error?.["status"] === "string" ? error["status"] : undefined;

  if (status === 400 && reasons.includes("API_KEY_INVALID")) return { code: "invalid_credential" };
  if (status === 400 && rpcStatus === "FAILED_PRECONDITION") return { code: "permission_denied" };

  const mapped = mapStatus(status);
  if (mapped.code === "rate_limited") {
    const seconds = retryDelaySeconds(details);
    if (seconds !== undefined) return { ...mapped, retryAfterSeconds: seconds };
  }
  return mapped;
}

/** `"17s"` or `"2.4s"` from a `RetryInfo` detail, rounded up; anything else is ignored. */
function retryDelaySeconds(details: Record<string, unknown>[]): number | undefined {
  for (const detail of details) {
    const delay = detail["retryDelay"];
    if (typeof delay !== "string") continue;
    const match = /^(\d+(?:\.\d+)?)s$/.exec(delay);
    if (match) return Math.ceil(Number(match[1]));
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
