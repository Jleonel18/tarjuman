import type { AccessNote, PriceLabel, ResourceType } from "../ports/search";

/** The model's estimate of how hard a resource is for the learner. Always shown as an estimate. */
export type Difficulty = "easier" | "about_right" | "harder" | "unknown";
export const DIFFICULTIES: readonly Difficulty[] = ["easier", "about_right", "harder", "unknown"];

/**
 * What the learner sees for one resource (005 data-model → ResourceCard). Built by the pipeline from
 * a search result plus the model's `show_resources` choice: the model supplies only `fitNote`,
 * `difficulty`, and `interest`; every other field comes from the source.
 */
export interface ResourceCard {
  expired?: false;
  /** The turn-wide id the model used, kept so a later turn can talk about "the second one". */
  ref: string;
  sourceId: string;
  /** App constant per source, shown next to the title (FR-005). */
  sourceDisplay: string;
  externalId: string;
  title: string;
  channel: string;
  durationSeconds: number | null;
  hasCaptions: boolean | null;
  audioLanguage: string | null;
  type: ResourceType;
  priceLabel: PriceLabel;
  accessNote: AccessNote | null;
  sponsored: boolean;
  affiliate: boolean;
  /** Built by the adapter from the id alone; the only link a card carries. */
  link: string;
  /** ISO date the source data was fetched; the 30-day retention rule runs from it (FR-021). */
  fetchedAt: string;
  /** Model text, max 300 characters, shown as plain text. */
  fitNote: string;
  difficulty: Difficulty;
  /** Kept only when it is one of the learner's interests or part of the request. */
  interest?: string;
}

/** A card past the retention window: only what is needed to fetch it again (FR-021). */
export interface ExpiredResourceCard {
  expired: true;
  sourceId: string;
  externalId: string;
  fetchedAt: string;
}

export type StoredResourceCard = ResourceCard | ExpiredResourceCard;

export function isExpired(card: StoredResourceCard): card is ExpiredResourceCard {
  return card.expired === true;
}
