import type { Effort } from "../ports/provider";

/** Per-message usage. Session totals are computed by summing records, not stored. */
export interface UsageRecord {
  id: string;
  conversationId: string;
  messageId: string;
  modelId: string;
  /** Provider-reported only (SC-005). */
  inputTokens: number;
  outputTokens: number;
  /** 0 when the provider did not report them. */
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Derived: input tokens including cache reads and writes. */
  contextUsedTokens: number;
  contextWindow: number;
  /** 0..1; the UI warns at >= 0.8 (FR-019). */
  contextRatio: number;
  /** `null` means pricing is unavailable for the model (FR-021). */
  estimatedCostUsd: number | null;
  /** ISO date of the price row used, or `null`. */
  pricingAsOf: string | null;
  configuredEffort: Effort;
  recommendedEffort: Effort;
  createdAt: string;
}
