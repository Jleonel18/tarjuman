import type {
  AbortSignalLike,
  SearchOutcome,
  SearchPort,
  SearchRequest,
  SearchResult,
  SecretHandle,
  ValidationResult,
} from "@tarjuman/core";
import type { ProviderErrorCode } from "@tarjuman/core";
import { unsealSecret } from "@tarjuman/core/adapter";

/** A fake key with the real `AIza` + 35 shape, so it passes the key-shape check. Safe to commit. */
export const DEFAULT_MOCK_SEARCH_KEY = "AIzaMOCKsearchKEY0000000000000000000000";

let counter = 0;

/** A plausible result; every field can be overridden. Ids are 11 characters from the video-id alphabet. */
export function makeSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  counter += 1;
  const externalId = `mock${String(counter).padStart(7, "0")}`;
  return {
    sourceId: "youtube",
    externalId,
    title: `Mock video ${counter}`,
    channel: "Mock Channel",
    descriptionExcerpt: "A mock description.",
    durationSeconds: 420,
    hasCaptions: true,
    audioLanguage: "es",
    type: "video",
    priceLabel: "free",
    accessNote: null,
    sponsored: false,
    affiliate: false,
    link: `https://www.youtube.com/watch?v=${overrides.externalId ?? externalId}`,
    fetchedAt: "2026-10-14T12:00:00.000Z",
    ...overrides,
  };
}

/** `n` distinct results in a fixed order, about one topic. */
export function makeSearchResults(n: number, overrides: Partial<SearchResult> = {}): SearchResult[] {
  return Array.from({ length: n }, () => makeSearchResult(overrides));
}

export interface MockSearchPortOptions {
  /** Source id and credential id. Default `"youtube"`. */
  id?: string;
  termsVersion?: string;
  /** Raw keys `validateCredential` accepts. */
  validKeys?: string[];
  /** Outcome returned when no scripted outcome is queued. Default: eight fresh results. */
  defaultOutcome?: SearchOutcome;
  /** Pause before answering a search, in ms, so abort can be tested. */
  latencyMs?: number;
  /** Chooses an outcome from the request. Consulted first; `undefined` falls through to the queue. */
  respond?: (req: SearchRequest) => SearchOutcome | undefined;
}

/**
 * The e2e build's search source: eight fresh results for any query, except a query containing
 * "nothing" (no results) or "fail" (a network failure). It lets the e2e suite cover the empty and
 * the partial-failure paths by what it types.
 */
export function e2eSearchResponder(req: SearchRequest): SearchOutcome | undefined {
  if (/nothing/i.test(req.query)) return { ok: true, results: [] };
  if (/fail/i.test(req.query)) return { ok: false, code: "network" };
  return undefined;
}

/**
 * Scripted stand-in for a search source: no network, no retries, and every request recorded so
 * tests can assert on exactly what left the app (FR-004, SC-005).
 */
export class MockSearchPort implements SearchPort {
  readonly id: string;
  readonly termsVersion: string;

  /** Every search request received, in order. A request cannot contain a secret by construction. */
  readonly searches: SearchRequest[] = [];
  /** Every `details` call's ids. */
  readonly detailsCalls: string[][] = [];
  validationCalls = 0;

  readonly #validKeys: Set<string>;
  readonly #queue: SearchOutcome[] = [];
  readonly #detailsQueue: SearchOutcome[] = [];
  readonly #latencyMs: number;
  readonly #respond: ((req: SearchRequest) => SearchOutcome | undefined) | undefined;
  #default: SearchOutcome | undefined;
  #validationFailure: ProviderErrorCode | undefined;

  constructor(options: MockSearchPortOptions = {}) {
    this.id = options.id ?? "youtube";
    this.termsVersion = options.termsVersion ?? "mock-terms-1";
    this.#validKeys = new Set(options.validKeys ?? [DEFAULT_MOCK_SEARCH_KEY]);
    this.#default = options.defaultOutcome;
    this.#latencyMs = options.latencyMs ?? 0;
    this.#respond = options.respond;
  }

  /** Queues the outcome of the next `search()` call. */
  enqueue(outcome: SearchOutcome): this {
    this.#queue.push(outcome);
    return this;
  }

  /** Queues the outcome of the next `details()` call. */
  enqueueDetails(outcome: SearchOutcome): this {
    this.#detailsQueue.push(outcome);
    return this;
  }

  setValidationFailure(code: ProviderErrorCode | undefined): this {
    this.#validationFailure = code;
    return this;
  }

  get searchCalls(): number {
    return this.searches.length;
  }

  async validateCredential(secret: SecretHandle, signal?: AbortSignalLike): Promise<ValidationResult> {
    this.validationCalls += 1;
    if (signal?.aborted) return { ok: false, code: "network" };
    if (this.#validationFailure) return { ok: false, code: this.#validationFailure };
    return this.#validKeys.has(unsealSecret(secret)) ? { ok: true } : { ok: false, code: "invalid_credential" };
  }

  async search(req: SearchRequest, secret: SecretHandle, signal: AbortSignalLike): Promise<SearchOutcome> {
    this.searches.push(req);
    if (!this.#validKeys.has(unsealSecret(secret))) return { ok: false, code: "invalid_credential" };
    if (this.#latencyMs > 0 && (await sleep(this.#latencyMs, signal))) return { ok: false, code: "network" };
    if (signal.aborted) return { ok: false, code: "network" };
    return this.#respond?.(req) ?? this.#queue.shift() ?? this.#default ?? { ok: true, results: makeSearchResults(8) };
  }

  async details(externalIds: string[], secret: SecretHandle, signal: AbortSignalLike): Promise<SearchOutcome> {
    this.detailsCalls.push([...externalIds]);
    if (!this.#validKeys.has(unsealSecret(secret))) return { ok: false, code: "invalid_credential" };
    if (signal.aborted) return { ok: false, code: "network" };
    return (
      this.#detailsQueue.shift() ?? {
        ok: true,
        results: externalIds.map((externalId) => makeSearchResult({ externalId })),
      }
    );
  }
}

/** Resolves true if aborted before the timer fired. */
function sleep(ms: number, signal: AbortSignalLike): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(true);
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(false);
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
