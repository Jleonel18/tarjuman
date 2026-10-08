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
 */
export class VerdictParser {
  #buffer = "";
  #verdict: Verdict | null = null;
  #failedClosed = false;

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
      if (verdict === null) return this.#failClosed();
      return this.#resolve(verdict, pending.slice(lineEnd + 1));
    }
    // No line break yet: wait only while what has arrived could still turn into a verdict.
    return couldBecomeVerdict(pending) ? { verdict: null, text: "" } : this.#failClosed();
  }

  /** Call when the stream ends. Resolves a verdict that was never followed by a line break. */
  finish(): { verdict: Verdict; text: string } {
    if (this.#verdict === null) {
      const verdict = asVerdict(this.#buffer);
      if (verdict === null) this.#failClosed();
      else this.#resolve(verdict, "");
    }
    return { verdict: this.#verdict ?? "refuse", text: "" };
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

/** Lower-casing (not upper-casing) avoids letters such as the dotless i matching a verdict. */
function asVerdict(line: string): Verdict | null {
  const word = line.trim().toLowerCase();
  return VERDICTS.find((verdict) => verdict === word) ?? null;
}

function couldBecomeVerdict(partial: string): boolean {
  const word = partial.trim().toLowerCase();
  return VERDICTS.some((verdict) => verdict.startsWith(word));
}
