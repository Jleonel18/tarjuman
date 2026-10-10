import type { Segment, Trust } from "../conversation/types";
import type { UntrustedMaterial } from "./types";

/**
 * Stands in for withheld key-shaped text, both in what the model sees and in what is stored. It is
 * model-facing and app-authored, so it is a `trusted` segment; the UI maps it to catalog text.
 */
export const WITHHELD_MARKER = "[withheld: key-shaped text]";

/** Zero-width and bidi control characters (FR-011, research R8): invisible, so stripped for matching. */
const INVISIBLE = /[\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;

/** The Anthropic key family, searched anywhere in a token so `NAME=sk-ant-…` is caught too. */
const ANTHROPIC_KEY = /sk-ant-[A-Za-z0-9_-]{8,}/;
/** Candidate for the generic check: a long run of the base64url alphabet (hex is a subset). */
const KEY_ALPHABET = /^[A-Za-z0-9_-]{32,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Quotes, brackets, and sentence punctuation around a token. Not `=`: base64 padding is not a key. */
const WRAPPING = /^["'`([{<]+|["'`)\]}>.,;:!?]+$/g;
/** Bits per character. Random hex is about 3.8, random base64url about 4.5; words and ids sit lower. */
const MIN_ENTROPY = 3.5;

export interface GuardInput {
  userText: string;
  untrustedMaterial?: readonly UntrustedMaterial[] | undefined;
}

export interface GuardedInput {
  /** What the model may see: each key-shaped token replaced by `WITHHELD_MARKER`. */
  userText: string;
  untrustedMaterial: UntrustedMaterial[];
  /** What is persisted: each withheld token becomes its own placeholder segment. */
  segments: Segment[];
  keyShapeDetected: boolean;
}

/**
 * Unicode normalization for rule matching only (NFKC, then invisible characters removed). The text
 * that is stored and sent keeps its original form; this view only decides what to withhold.
 */
export function normalizeForMatching(text: string): string {
  return text.normalize("NFKC").replace(INVISIBLE, "");
}

/**
 * Stage 1 of the pipeline (FR-011). Finds API-key-shaped strings in the user's text and in pasted
 * or external material, and withholds them from the model and from storage. Detection is a
 * heuristic, so it errs towards withholding: an unpadded base64 run of 32+ characters is withheld.
 */
export function guardInput(input: GuardInput): GuardedInput {
  const user = withhold(input.userText, "user");
  const material = (input.untrustedMaterial ?? []).map((m) => ({ source: m.source, ...withhold(m.text, "untrusted") }));
  return {
    userText: user.text,
    untrustedMaterial: material.map((m) => ({ source: m.source, text: m.text })),
    segments: [...user.segments, ...material.flatMap((m) => m.segments)],
    keyShapeDetected: user.found || material.some((m) => m.found),
  };
}

function withhold(text: string, trust: Trust): { text: string; segments: Segment[]; found: boolean } {
  const segments: Segment[] = [];
  let modelText = "";
  let pending = "";
  let found = false;
  // Keys never contain whitespace, so whole whitespace-separated tokens are withheld. NFKC can
  // turn an ideographic space into a plain one, which is why the split runs on the original.
  for (const part of text.split(/(\s+)/)) {
    if (part !== "" && !/^\s+$/.test(part) && isKeyShaped(part)) {
      found = true;
      if (pending !== "") segments.push({ trust, text: pending });
      segments.push({ trust: "trusted", text: WITHHELD_MARKER });
      pending = "";
      modelText += WITHHELD_MARKER;
    } else {
      pending += part;
      modelText += part;
    }
  }
  if (pending !== "" || segments.length === 0) segments.push({ trust, text: pending });
  return { text: modelText, segments, found };
}

function isKeyShaped(token: string): boolean {
  const normalized = normalizeForMatching(token);
  if (ANTHROPIC_KEY.test(normalized)) return true;
  const core = normalized.replace(WRAPPING, "");
  return (
    KEY_ALPHABET.test(core) &&
    /\d/.test(core) &&
    /[A-Za-z]/.test(core) &&
    !UUID.test(core) &&
    entropy(core) >= MIN_ENTROPY
  );
}

/** Shannon entropy in bits per character. */
function entropy(text: string): number {
  const counts = new Map<string, number>();
  for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / text.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}
