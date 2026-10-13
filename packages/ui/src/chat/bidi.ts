/**
 * Bidirectional text helpers (FR-032). A message can mix scripts: an English explanation quoting an
 * Arabic word, or an Arabic sentence naming a brand. The browser orders each paragraph by its first
 * strong letter (`dir="auto"`); a run of the other direction is wrapped in `<bdi>` so its letters
 * and the punctuation around it cannot reorder each other.
 */

export type TextDirection = "ltr" | "rtl";

export interface DirectionRun {
  text: string;
  /** True for a run that reads against the base direction and needs a `<bdi>`. */
  isolate: boolean;
}

// Hebrew, Arabic and its supplements, Syriac, Thaana, N'Ko, and the Arabic presentation forms.
const RTL_LETTER = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;
const LETTER = /\p{L}/u;

function strongDirection(char: string): TextDirection | undefined {
  if (RTL_LETTER.test(char)) return LETTER.test(char) || /\p{M}/u.test(char) ? "rtl" : undefined;
  return LETTER.test(char) ? "ltr" : undefined;
}

/** The direction `dir="auto"` picks: that of the first strong letter, left to right if none. */
export function baseDirection(text: string): TextDirection {
  for (const char of text) {
    const direction = strongDirection(char);
    if (direction) return direction;
  }
  return "ltr";
}

/**
 * Splits text into runs, marking the ones that read against the base direction. A run starts and
 * ends on a strong letter of the other direction; digits, spaces and punctuation between two such
 * letters stay inside it, and those on either edge stay outside. Joining the runs gives back the
 * input exactly.
 */
export function directionRuns(text: string): DirectionRun[] {
  if (text === "") return [];
  const base = baseDirection(text);
  const chars = [...text];
  const runs: DirectionRun[] = [];
  let plain = "";
  let i = 0;
  while (i < chars.length) {
    const direction = strongDirection(chars[i] as string);
    if (direction === undefined || direction === base) {
      plain += chars[i];
      i += 1;
      continue;
    }
    // Extend over the opposing run: stop before the next strong letter of the base direction.
    let end = i;
    for (let j = i; j < chars.length; j++) {
      const d = strongDirection(chars[j] as string);
      if (d === base) break;
      if (d !== undefined) end = j;
    }
    if (plain !== "") runs.push({ text: plain, isolate: false });
    plain = "";
    runs.push({ text: chars.slice(i, end + 1).join(""), isolate: true });
    i = end + 1;
  }
  if (plain !== "") runs.push({ text: plain, isolate: false });
  return runs;
}
