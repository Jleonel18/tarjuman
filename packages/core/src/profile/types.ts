import type { Effort } from "../ports/provider";

export type { Effort };

/** BCP 47 language tag, e.g. "en", "es", "ar", "ja". */
export type LanguageCode = string;

/** Self-reported CEFR level (FR-035). `unknown` is the "I don't know" option. */
export type Level = "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | "unknown";

export const LEVELS: readonly Level[] = ["A1", "A2", "B1", "B2", "C1", "C2", "unknown"];

/** Effort levels the user can configure in v1 (`xhigh`/`max` are not offered). */
export const CONFIGURABLE_EFFORTS: readonly Effort[] = ["low", "medium", "high"];

export const DEFAULT_TONE_ID = "neutral";
export const DEFAULT_EFFORT: Effort = "medium";

/**
 * The three language settings are always separate (Principle VIII, FR-033):
 * the interface language, the language explanations are written in (mediation), and the
 * language being learned (target).
 */
export interface LearnerProfile {
  id: "profile";
  uiLanguage: LanguageCode;
  mediationLanguage: LanguageCode;
  targetLanguage: LanguageCode;
  level: Level;
  /** Treated as untrusted data whenever rendered into a prompt. */
  interests: string[];
  toneId: string;
  configuredEffort: Effort;
  modelId: string;
  createdAt: string;
  updatedAt: string;
}

/** Presentation guidance only; assembled in the tone layer, below scope and capability. */
export interface TonePreset {
  id: string;
  /** i18n catalog key for the localized display name. */
  nameKey: string;
  /** Prompt fragment describing the style. Never allowed to relax scope or security. */
  guidance: string;
}
