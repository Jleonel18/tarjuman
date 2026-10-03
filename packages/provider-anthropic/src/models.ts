import type { ModelInfo } from "@tarjuman/core";

/**
 * The static, app-maintained model table. Facts come from research.md → Spike Results (R2, R3),
 * read from the Anthropic documentation on 2026-10-02 and not confirmed with a live call.
 *
 * Constraints the adapter respects (see `anthropic-provider.ts`): Opus 5.5 thinking cannot be
 * disabled, Sonnet 5.5 rejects `thinking: {type: "disabled"}`, forced `tool_choice` returns 400,
 * prefill is removed, and `budget_tokens` and sampling params are rejected, so none of those is
 * ever sent. Haiku 4.5 has no effort support.
 */
const PRICES_AS_OF = "2026-10-02";

// v1 offers low/medium/high only (research R3); the provider accepts more, but they are not
// exposed, so they are not listed.
const EFFORTS: ModelInfo["effortLevels"] = ["low", "medium", "high"];

export const DEFAULT_MODEL_ID = "claude-sonnet-5-5";

export const ANTHROPIC_MODELS: readonly ModelInfo[] = [
  {
    id: "claude-sonnet-5-5",
    displayName: "Claude Sonnet 5.5",
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    supportsEffort: true,
    effortLevels: EFFORTS,
    pricing: { inputPerMTok: 2, outputPerMTok: 10, cacheReadPerMTok: 0.2, asOf: PRICES_AS_OF },
  },
  {
    id: "claude-opus-5-5",
    displayName: "Claude Opus 5.5",
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    supportsEffort: true,
    effortLevels: EFFORTS,
    pricing: { inputPerMTok: 4, outputPerMTok: 20, cacheReadPerMTok: 0.2, asOf: PRICES_AS_OF },
  },
  {
    // The alias; the dated id is `claude-haiku-4-5-20251001`.
    id: "claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    contextWindow: 200_000,
    maxOutput: 64_000,
    supportsEffort: false,
    effortLevels: [],
    pricing: { inputPerMTok: 1, outputPerMTok: 5, cacheReadPerMTok: 0.1, asOf: PRICES_AS_OF },
  },
];

/** The cheapest model with known pricing, used for credential validation (research R5). */
export function cheapestModel(models: readonly ModelInfo[] = ANTHROPIC_MODELS): ModelInfo {
  const priced = models.filter((m) => m.pricing !== null);
  const cost = (m: ModelInfo) => (m.pricing ? m.pricing.inputPerMTok + m.pricing.outputPerMTok : Infinity);
  const best = priced.reduce<ModelInfo | undefined>((a, b) => (a && cost(a) <= cost(b) ? a : b), undefined);
  const fallback = models[0];
  if (!best && !fallback) throw new Error("The model table is empty.");
  return (best ?? fallback) as ModelInfo;
}
