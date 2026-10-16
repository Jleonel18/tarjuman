import type { Verdict } from "../conversation/types";

export interface VerdictParse {
  /** `null` while the first line is still incomplete. Once set, it never changes. */
  verdict: Verdict | null;
  /** Answer text released by this call, with the verdict line already removed. */
  text: string;
}

const VERDICTS: readonly Verdict[] = ["accept", "refuse", "clarify"];

/**
 * Reads the structured first line (`ACCEPT` | `REFUSE` | `CLARIFY`) of a streamed answer and
 * strips it (research R8, R9). Case and surrounding whitespace do not matter.
 *
 * Fails closed: a missing or malformed first line is `refuse`, so scope is never silently
 * unverified, and none of that answer's text is released. The decision is made as soon as the
 * line can no longer become a verdict, so a model that ignores the format is not buffered whole.
 * Nothing is released before the verdict is known.
 *
 * `fallback` is a verdict the model already wrote in an earlier tool step of the same turn (005
 * research R15). It is used only when this text does not open with a verdict line of its own; a
 * carried `refuse` still releases nothing.
 */
export class VerdictParser {
  #buffer = "";
  #verdict: Verdict | null = null;
  #failedClosed = false;
  readonly #fallback: Verdict | undefined;

  constructor(options: { fallback?: Verdict | undefined } = {}) {
    this.#fallback = options.fallback;
  }

  push(delta: string): VerdictParse {
    if (this.#verdict !== null) {
      return { verdict: this.#verdict, text: this.#failedClosed ? "" : delta };
    }
    this.#buffer += delta;
    const pending = this.#buffer.trimStart();
    if (pending === "") return { verdict: null, text: "" };

    const lineEnd = pending.indexOf("\n");
    if (lineEnd >= 0) {
      const verdict = asVerdict(pending.slice(0, lineEnd));
      if (verdict === null) return this.#noVerdictLine(pending);
      return this.#resolve(verdict, pending.slice(lineEnd + 1));
    }
    // No line break yet: wait only while what has arrived could still turn into a verdict.
    return couldBecomeVerdict(pending) ? { verdict: null, text: "" } : this.#noVerdictLine(pending);
  }

  /** Call when the stream ends. Resolves a verdict that was never followed by a line break. */
  finish(): { verdict: Verdict; text: string } {
    let text = "";
    if (this.#verdict === null) {
      const verdict = asVerdict(this.#buffer);
      if (verdict === null) text = this.#noVerdictLine(this.#buffer.trimStart()).text;
      else this.#resolve(verdict, "");
    }
    return { verdict: this.#verdict ?? "refuse", text };
  }

  /** The text opens without a verdict line: the fallback if there is one, otherwise fail closed. */
  #noVerdictLine(pending: string): VerdictParse {
    if (this.#fallback === undefined || this.#fallback === "refuse") return this.#failClosed();
    return this.#resolve(this.#fallback, pending);
  }

  #resolve(verdict: Verdict, text: string): VerdictParse {
    this.#verdict = verdict;
    this.#buffer = "";
    return { verdict, text };
  }

  #failClosed(): VerdictParse {
    this.#failedClosed = true;
    return this.#resolve("refuse", "");
  }
}

/**
 * The verdict on the first non-empty line of a finished text, or `undefined` when that line is not
 * exactly a verdict word. Used for the text of a tool step, which is never shown.
 */
export function verdictLineOf(text: string): Verdict | undefined {
  const first = text.trimStart().split("\n", 1)[0] ?? "";
  return asVerdict(first) ?? undefined;
}

/** Lower-casing (not upper-casing) avoids letters such as the dotless i matching a verdict. */
function asVerdict(line: string): Verdict | null {
  const word = line.trim().toLowerCase();
  return VERDICTS.find((verdict) => verdict === word) ?? null;
}

function couldBecomeVerdict(partial: string): boolean {
  const word = partial.trim().toLowerCase();
  return VERDICTS.some((verdict) => verdict.startsWith(word));
}
