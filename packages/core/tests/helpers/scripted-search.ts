import type { ValidationResult } from "../../src/ports/provider";
import type { SearchOutcome, SearchPort, SearchRequest, SearchResult } from "../../src/ports/search";
import type { SecretHandle } from "../../src/ports/secret-handle";
import { unsealSecret } from "../../src/ports/secret-unseal";

let counter = 0;

/** A plausible result with a unique 11-character id; any field can be overridden. */
export function result(overrides: Partial<SearchResult> = {}): SearchResult {
  counter += 1;
  const externalId = overrides.externalId ?? `vid${String(counter).padStart(8, "0")}`;
  return {
    sourceId: "youtube",
    externalId,
    title: `Video ${counter}`,
    channel: "Channel",
    descriptionExcerpt: "About something.",
    durationSeconds: 300,
    hasCaptions: true,
    audioLanguage: "es",
    type: "video",
    priceLabel: "free",
    accessNote: null,
    sponsored: false,
    affiliate: false,
    link: `https://www.youtube.com/watch?v=${externalId}`,
    fetchedAt: "2026-10-14T12:00:00.000Z",
    ...overrides,
  };
}

export function results(n: number, overrides: Partial<SearchResult> = {}): SearchResult[] {
  return Array.from({ length: n }, () => result(overrides));
}

/**
 * Minimal scripted SearchPort for core tests (core cannot import `@tarjuman/testing`). Records
 * every request and the raw key each call was made with, so tests can check what left the app.
 */
export class ScriptedSearchPort implements SearchPort {
  readonly searches: SearchRequest[] = [];
  readonly detailsCalls: string[][] = [];
  /** The raw key of each call, to prove which key was used. Test-only. */
  readonly keysUsed: string[] = [];
  readonly queue: SearchOutcome[] = [];
  validationResult: ValidationResult = { ok: true };
  /** Resolves when set; lets a test pause a search to cancel it. */
  gate: Promise<void> | undefined;

  constructor(
    readonly id: string = "youtube",
    readonly termsVersion: string = "terms-1",
  ) {}

  enqueue(outcome: SearchOutcome): this {
    this.queue.push(outcome);
    return this;
  }

  async validateCredential(): Promise<ValidationResult> {
    return this.validationResult;
  }

  async search(req: SearchRequest, secret: SecretHandle): Promise<SearchOutcome> {
    this.searches.push(req);
    this.keysUsed.push(unsealSecret(secret));
    if (this.gate) await this.gate;
    return this.queue.shift() ?? { ok: true, results: results(3) };
  }

  async details(ids: string[], secret: SecretHandle): Promise<SearchOutcome> {
    this.detailsCalls.push([...ids]);
    this.keysUsed.push(unsealSecret(secret));
    return this.queue.shift() ?? { ok: true, results: ids.map((externalId) => result({ externalId })) };
  }
}
