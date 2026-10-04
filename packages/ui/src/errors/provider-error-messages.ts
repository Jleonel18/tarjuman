import type { ProviderErrorCode } from "@tarjuman/core";

/** What the UI should offer next. Nothing here retries: any retry is the user's own click. */
export type ProviderErrorAction = "open_key_settings" | "none";

export interface ProviderErrorDescription {
  /** Catalog key; translate it with `params`. */
  messageKey: string;
  params: { seconds?: number };
  action: ProviderErrorAction;
}

const KEY_PROBLEMS: ReadonlySet<ProviderErrorCode> = new Set([
  "invalid_credential",
  "permission_denied",
  "quota_exhausted",
]);

/**
 * Maps a provider error to a plain-language catalog key (FR-004a). Credential and quota errors
 * send the user to key settings; `rate_limited` shows the wait only when the provider reported
 * one. The same function serves chat errors and key-entry errors, so wording stays consistent.
 */
export function describeProviderError(code: ProviderErrorCode, retryAfterSeconds?: number): ProviderErrorDescription {
  const action: ProviderErrorAction = KEY_PROBLEMS.has(code) ? "open_key_settings" : "none";
  if (code === "rate_limited" && retryAfterSeconds !== undefined) {
    return { messageKey: "error.provider.rate_limited_wait", params: { seconds: retryAfterSeconds }, action };
  }
  return { messageKey: `error.provider.${code}`, params: {}, action };
}
