import type { ProviderErrorCode } from "@tarjuman/core";

/**
 * A fixed, non-secret description of why a call failed, for a developer reading the console. It has
 * no request body, headers, or response text, so it cannot carry a secret or user content.
 * `kind` maps 1:1 to a heading in docs/local-model.md.
 */
export type OllamaDiagnostic = {
  kind: "unreachable" | "model_not_installed" | "rejected" | "busy" | "failed";
  baseUrl: string;
  modelId?: string;
  httpStatus?: number;
};

export interface ErrorContext {
  baseUrl: string;
  modelId?: string;
}

export interface MappedFailure {
  code: ProviderErrorCode;
  diagnostic: OllamaDiagnostic;
}

/**
 * Maps an HTTP status (research R4). It takes no response text on purpose: only the status leaves
 * the adapter, so no body can leak into a code, a diagnostic, or the UI.
 */
export function mapStatus(status: number, ctx: ErrorContext): MappedFailure {
  const base = { baseUrl: ctx.baseUrl, httpStatus: status };
  switch (status) {
    case 404:
      // Documented for a missing model.
      return {
        code: "bad_request",
        diagnostic: { kind: "model_not_installed", baseUrl: ctx.baseUrl, ...(ctx.modelId ? { modelId: ctx.modelId } : {}), httpStatus: status },
      };
    case 400:
    case 413:
    case 422:
      return { code: "bad_request", diagnostic: { kind: "rejected", ...base } };
    case 429:
      return { code: "rate_limited", diagnostic: { kind: "busy", ...base } };
    case 503:
      return { code: "overloaded", diagnostic: { kind: "busy", ...base } };
    default:
      return { code: "unknown", diagnostic: { kind: "failed", ...base } };
  }
}

/**
 * Maps anything `fetch` throws. A browser reports "not running", "wrong address", and "origin not
 * allowed" as the same `TypeError`, so they are one diagnostic. The message is never copied.
 */
export function mapThrown(_error: unknown, ctx: ErrorContext): MappedFailure {
  return { code: "network", diagnostic: { kind: "unreachable", baseUrl: ctx.baseUrl } };
}
