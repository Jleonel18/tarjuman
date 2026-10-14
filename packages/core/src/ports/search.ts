import type { AbortSignalLike, ValidationResult } from "./provider";
import type { SecretHandle } from "./secret-handle";

/**
 * SearchPort: the only way the core reaches a search source such as YouTube (005 research R6, R9).
 * Only `SearchBroker` holds an instance. See specs/005-resource-curation/contracts/search-port.md.
 *
 * Everything a source returns is untrusted data. The adapter validates and caps it before it
 * leaves the adapter; the core still treats every field as hostile text.
 */

export const SEARCH_LIMITS = {
  queryMax: 120,
  titleMax: 200,
  channelMax: 100,
  descriptionExcerptMax: 200,
  /** Results asked of a source in one search (an app constant, not a model choice). */
  resultsPerSearch: 8,
  /** `^[A-Za-z0-9_-]{11}$`: a YouTube video id. */
  externalIdPattern: /^[A-Za-z0-9_-]{11}$/,
} as const;

export type SearchErrorCode =
  | "invalid_credential"
  | "not_enabled"
  | "quota_exhausted"
  | "rate_limited"
  | "network"
  | "bad_request"
  | "unknown";

export type SearchKind = "any" | "music";

/** What leaves the device in a search (FR-004): never the key, the history, or other profile data. */
export interface SearchRequest {
  /** 1–120 characters after trimming. */
  query: string;
  /** BCP 47, taken from the profile, never from the model. */
  targetLanguage: string;
  kind: SearchKind;
  captionsOnly: boolean;
  /** 1–10; the broker sets the app constant. */
  maxResults: number;
}

export type ResourceType = "video" | "song";
export type PriceLabel = "free" | "paid" | "free_with_limits" | "unknown";
export type AccessNote = "region_restricted" | "age_restricted";

/** A result as an adapter returns it, before the turn assigns a `ref`. Untrusted. */
export interface SearchResult {
  sourceId: string;
  /** Matches `SEARCH_LIMITS.externalIdPattern`. */
  externalId: string;
  title: string;
  channel: string;
  /** Sent to the model, never shown on a card. */
  descriptionExcerpt: string;
  durationSeconds: number | null;
  hasCaptions: boolean | null;
  /** BCP 47; `null` means the language is not confirmed. */
  audioLanguage: string | null;
  type: ResourceType;
  priceLabel: PriceLabel;
  accessNote: AccessNote | null;
  sponsored: boolean;
  affiliate: boolean;
  /** Built by the adapter from `externalId` alone (FR-014). Never shown to the model. */
  link: string;
  /** ISO date. */
  fetchedAt: string;
}

export type SearchOutcome = { ok: true; results: SearchResult[] } | { ok: false; code: SearchErrorCode };

export interface SearchPort {
  /** The source id and the credential id of its key, e.g. `"youtube"`. */
  readonly id: string;
  /** Bumping it asks the learner for consent again. */
  readonly termsVersion: string;
  validateCredential(secret: SecretHandle, signal?: AbortSignalLike): Promise<ValidationResult>;
  search(req: SearchRequest, secret: SecretHandle, signal: AbortSignalLike): Promise<SearchOutcome>;
  /** Fetches the current data of known ids (card refresh); order follows `externalIds`. */
  details(externalIds: string[], secret: SecretHandle, signal: AbortSignalLike): Promise<SearchOutcome>;
}
