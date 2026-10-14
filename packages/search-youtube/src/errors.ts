import type { SearchErrorCode } from "@tarjuman/core";

/**
 * YouTube failures → the app's search error codes (contracts/search-port.md). Only the HTTP status
 * and allow-listed `reason` strings are read. The message text is never read, so neither it nor
 * anything the server echoed back can reach a result, an error, or the UI.
 */
export function mapSearchError(status: number, body: unknown): SearchErrorCode {
  const reasons = reasonsOf(body);
  const has = (...names: string[]) => names.some((name) => reasons.includes(name));

  if (status === 400) return has("API_KEY_INVALID", "keyInvalid") ? "invalid_credential" : "bad_request";
  if (status === 401) return "invalid_credential";
  if (status === 403) {
    if (has("accessNotConfigured", "SERVICE_DISABLED")) return "not_enabled";
    if (has("quotaExceeded", "dailyLimitExceeded")) return "quota_exhausted";
    if (has("rateLimitExceeded", "userRateLimitExceeded")) return "rate_limited";
    return "invalid_credential";
  }
  if (status === 429) return "rate_limited";
  return "unknown";
}

/** `error.errors[].reason` (classic) and `error.details[].reason` (Google Cloud) — strings only. */
function reasonsOf(body: unknown): string[] {
  const error = isRecord(body) ? body["error"] : undefined;
  if (!isRecord(error)) return [];
  const lists = [error["errors"], error["details"]].filter(Array.isArray) as unknown[][];
  return lists.flat().flatMap((entry) => (isRecord(entry) && typeof entry["reason"] === "string" ? [entry["reason"]] : []));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
