import type { Effort, ModelInfo } from "../ports/provider";
import type { UsageRecord } from "./types";

/** The learner is warned once a conversation has used this share of the model's window (FR-019). */
export const CONTEXT_WARNING_RATIO = 0.8;

const TOKENS_PER_MTOK = 1_000_000;

/** Token counts exactly as the provider reported them (SC-005). */
export interface ReportedUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number | undefined;
  cacheWriteTokens?: number | undefined;
}

export interface BuildUsageInput {
  id: string;
  conversationId: string;
  messageId: string;
  /** The provider that served the turn (004 FR-019). */
  providerId?: string;
  model: ModelInfo;
  usage: ReportedUsage;
  configuredEffort: Effort;
  recommendedEffort: Effort;
  createdAt: string;
}

export function isContextWarning(ratio: number): boolean {
  return ratio >= CONTEXT_WARNING_RATIO;
}

/**
 * Turns one provider usage report into a `UsageRecord`. Token fields are copied, never estimated;
 * only the context figures and the cost are derived. The cost is `null` when the model has no
 * price row, because an invented price would read as a fact (FR-021).
 */
export function buildUsageRecord(input: BuildUsageInput): UsageRecord {
  const { model, usage } = input;
  const cacheReadTokens = usage.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage.cacheWriteTokens ?? 0;
  const contextUsedTokens = usage.inputTokens + cacheReadTokens;
  const ratio = model.contextWindow > 0 ? contextUsedTokens / model.contextWindow : 0;
  const pricing = model.pricing;
  const estimatedCostUsd =
    pricing === null
      ? null
      : (usage.inputTokens * pricing.inputPerMTok +
          usage.outputTokens * pricing.outputPerMTok +
          cacheReadTokens * (pricing.cacheReadPerMTok ?? pricing.inputPerMTok)) /
        TOKENS_PER_MTOK;

  return {
    id: input.id,
    conversationId: input.conversationId,
    messageId: input.messageId,
    ...(input.providerId !== undefined && { providerId: input.providerId }),
    modelId: model.id,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    contextUsedTokens,
    contextWindow: model.contextWindow,
    contextRatio: Math.min(1, Math.max(0, ratio)),
    estimatedCostUsd,
    pricingAsOf: pricing?.asOf ?? null,
    configuredEffort: input.configuredEffort,
    recommendedEffort: input.recommendedEffort,
    createdAt: input.createdAt,
  };
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** `null` as soon as one record has no price, so a partial sum is never shown as exact. */
  estimatedCostUsd: number | null;
}

/** Session totals are computed by summing records; they are never stored. */
export function sumUsage(records: readonly UsageRecord[]): UsageTotals {
  const totals: UsageTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    estimatedCostUsd: 0,
  };
  for (const record of records) {
    totals.inputTokens += record.inputTokens;
    totals.outputTokens += record.outputTokens;
    totals.cacheReadTokens += record.cacheReadTokens;
    totals.cacheWriteTokens += record.cacheWriteTokens;
    totals.estimatedCostUsd =
      totals.estimatedCostUsd === null || record.estimatedCostUsd === null
        ? null
        : totals.estimatedCostUsd + record.estimatedCostUsd;
  }
  return totals;
}
