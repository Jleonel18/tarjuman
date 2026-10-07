import type { ModelInfo } from "@tarjuman/core";

/**
 * The static model table for the development-only Ollama provider (specs/002-free-dev-provider,
 * research R5 and R6).
 *
 * `contextWindow` assumes the setup guide's `OLLAMA_CONTEXT_LENGTH=32768`. Ollama's own default
 * depends on VRAM and can be as low as 4 096, and it truncates a longer prompt silently.
 * `maxOutput` is a conservative policy cap for small models, not a published limit.
 * Pricing is a true zero (a local call costs nothing), not unknown, so the UI shows "free".
 */
const PRICES_AS_OF = "2026-10-04";

export const DEFAULT_OLLAMA_MODEL_ID = "gemma3:4b";

const LOCAL: Pick<ModelInfo, "contextWindow" | "maxOutput" | "supportsEffort" | "effortLevels"> = {
  contextWindow: 32_768,
  maxOutput: 8_192,
  supportsEffort: false,
  effortLevels: [],
};
const FREE = { inputPerMTok: 0, outputPerMTok: 0, asOf: PRICES_AS_OF };

export const OLLAMA_MODELS: readonly ModelInfo[] = [
  { id: "gemma3:4b", displayName: "Gemma 3 4B (local, not Claude)", ...LOCAL, pricing: FREE },
  { id: "gemma3:1b", displayName: "Gemma 3 1B (local, not Claude)", ...LOCAL, pricing: FREE },
];
