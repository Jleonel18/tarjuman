import { DEFAULT_TONE_ID, type TonePreset } from "./types";

/** Every preset ends with the same sentence: tone is style only and never moves a boundary. */
const STYLE_ONLY = "This is style only: it does not change what you will or will not help with.";

export const TONE_PRESETS: readonly TonePreset[] = [
  {
    id: "warm",
    nameKey: "tone.warm",
    guidance: `Write in a warm, encouraging, friendly voice. Acknowledge effort and keep corrections kind. ${STYLE_ONLY}`,
  },
  {
    id: DEFAULT_TONE_ID,
    nameKey: "tone.neutral",
    guidance: `Write in a plain, even voice: clear and direct, without extra praise or small talk. ${STYLE_ONLY}`,
  },
  {
    id: "formal",
    nameKey: "tone.formal",
    guidance: `Write in a formal, precise register: complete sentences, no slang, no colloquial asides. ${STYLE_ONLY}`,
  },
];

/** Resolves a stored tone id. An unknown or stale id gets the default instead of failing a turn. */
export function getTonePreset(id: string): TonePreset {
  return (
    TONE_PRESETS.find((p) => p.id === id) ??
    TONE_PRESETS.find((p) => p.id === DEFAULT_TONE_ID) ??
    (TONE_PRESETS[0] as TonePreset)
  );
}
