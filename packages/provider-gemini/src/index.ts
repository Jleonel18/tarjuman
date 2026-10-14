/**
 * Google Gemini, the second product provider (specs/004-gemini-provider). Only the composition root
 * and `tests/` construct it; everything else sees the `ProviderPort` type.
 */
export { GEMINI_API_ORIGIN } from "./origin";
export { GeminiProvider, type GeminiProviderOptions } from "./gemini-provider";
export { DEFAULT_GEMINI_MODEL_ID, GEMINI_MODELS } from "./models";
