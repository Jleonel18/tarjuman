import type { ToolSearchResult } from "../capabilities/types";
import type { SearchResult } from "../ports/search";

/** Two searches of eight results each (provider-tool-calls.md). */
const MAX_REFS = 16;

/**
 * The results of one turn, numbered for the model. Created by the pipeline for each turn and handed
 * to the broker services: it assigns turn-wide refs `r1…r16` in order, keeps a video returned twice
 * under its first ref, and is the only set `show_resources` ids are checked against. Nothing in it
 * outlives the turn except what becomes a card.
 */
export class TurnSearchSession {
  readonly #byRef = new Map<string, SearchResult>();
  readonly #refOfId = new Map<string, string>();

  /** Numbers the results that are new to the turn and returns them as the model sees them. */
  add(found: readonly SearchResult[]): ToolSearchResult[] {
    const shown: ToolSearchResult[] = [];
    for (const r of found) {
      if (this.#refOfId.has(`${r.sourceId}:${r.externalId}`)) continue;
      if (this.#byRef.size >= MAX_REFS) break;
      const ref = `r${this.#byRef.size + 1}`;
      this.#byRef.set(ref, r);
      this.#refOfId.set(`${r.sourceId}:${r.externalId}`, ref);
      shown.push({
        ref,
        title: r.title,
        channel: r.channel,
        descriptionExcerpt: r.descriptionExcerpt,
        durationSeconds: r.durationSeconds,
        hasCaptions: r.hasCaptions,
        audioLanguage: r.audioLanguage,
        type: r.type,
      });
    }
    return shown;
  }

  resultFor(ref: string): SearchResult | undefined {
    return this.#byRef.get(ref);
  }

  /** Every numbered result, in search order. */
  entries(): [string, SearchResult][] {
    return [...this.#byRef.entries()];
  }
}
