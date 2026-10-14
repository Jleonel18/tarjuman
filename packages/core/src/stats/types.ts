import type { Effort } from "../ports/provider";

/** Per-message usage. Session totals are computed by summing records, not stored. */
export interface UsageRecord {
  id: string;
  conversationId: string;
  messageId: string;
  /** The provider that served the turn (004 FR-019). Absent on records saved before 004. */
  providerId?: string;
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
  /** Model calls in the turn; the token fields above are the sum over them (005). Absent before 005. */
  steps?: number;
  /** Searches made in the turn, per source (005). Searches add no money cost (FR-017). */
  searches?: { sourceId: string; count: number }[];
}
