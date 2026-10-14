import type { ModelInfo } from "@tarjuman/core";

/**
 * The static, app-maintained model table (004 research R8). Limits come from a live `models.list`
 * and prices from Google's pricing page, both read on 2026-10-14. Paid-tier prices: the app cannot
 * tell a free key from a paid one, so costs are estimates at paid rates (001 FR-021).
 *
 * Scheduled changes (pricing page): `gemini-4-argon` doubles on 2026-12-01 and `gemini-3.8-flash`
 * on 2027-01-01. Update research.md, the model test, and this table before those dates.
 */
const PRICES_AS_OF = "2026-10-14";

// The app offers low/medium/high only (001 research R3). Every listed model accepts them as a
// `thinkingLevel`; `minimal` is not offered (gemini-3.8-flash rejects it).
const EFFORTS: ModelInfo["effortLevels"] = ["low", "medium", "high"];

/** The current general model with a free tier, so a learner with a free key can start at once. */
export const DEFAULT_GEMINI_MODEL_ID = "gemini-3.8-flash";

export const GEMINI_MODELS: readonly ModelInfo[] = [
  {
    id: "gemini-3.8-flash",
    displayName: "Gemini 3.8 Flash",
    contextWindow: 1_048_576,
    maxOutput: 65_536,
    supportsEffort: true,
    effortLevels: EFFORTS,
    pricing: { inputPerMTok: 0.75, outputPerMTok: 3.75, cacheReadPerMTok: 0.075, asOf: PRICES_AS_OF },
  },
  {
    id: "gemini-3.5-flash-lite",
    displayName: "Gemini 3.5 Flash-Lite",
    contextWindow: 1_048_576,
    maxOutput: 65_536,
    supportsEffort: true,
    effortLevels: EFFORTS,
    pricing: { inputPerMTok: 0.3, outputPerMTok: 2.5, cacheReadPerMTok: 0.03, asOf: PRICES_AS_OF },
  },
  {
    // `models.list` says 32,768 and the model page 65,536; the lower, live value is used.
    id: "gemini-4-argon",
    displayName: "Gemini 4 Argon",
    contextWindow: 1_048_576,
    maxOutput: 32_768,
    supportsEffort: true,
    effortLevels: EFFORTS,
    pricing: { inputPerMTok: 2, outputPerMTok: 10, cacheReadPerMTok: 0.1, asOf: PRICES_AS_OF },
  },
];
