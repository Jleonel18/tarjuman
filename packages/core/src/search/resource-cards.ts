import { DIFFICULTIES, type Difficulty, type ResourceCard } from "./resource-card";
import type { TurnSearchSession } from "./turn-search-session";

const MAX_CARDS = 10;
const MAX_FIT_NOTE = 300;

/** App constant per source: the name and domain shown beside every title (FR-005). */
const SOURCE_DISPLAY: Readonly<Record<string, string>> = {
  youtube: "YouTube (youtube.com)",
};

export function sourceDisplayOf(sourceId: string): string {
  return SOURCE_DISPLAY[sourceId] ?? sourceId;
}

/** One resource the model chose, with its judgement. Nothing else from the model is read. */
export interface ShowResourcesItem {
  id: string;
  fitNote: string;
  difficulty: Difficulty;
  interest?: string;
}

// eslint-disable-next-line no-control-regex -- stripping control characters is the point
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

function cleanNote(text: string): string {
  return [...text.replace(CONTROL, " ").replace(/\s+/g, " ").trim()].slice(0, MAX_FIT_NOTE).join("");
}

/**
 * Reads the input of a `resources` presentation tool: `{ items: [{ id, fitNote, difficulty, interest? }] }`.
 * `undefined` when the input is not that shape at all; an unusable item is skipped, not fatal.
 */
export function parseShowResources(input: unknown): ShowResourcesItem[] | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const items = (input as { items?: unknown }).items;
  if (!Array.isArray(items) || items.length === 0) return undefined;
  const out: ShowResourcesItem[] = [];
  for (const raw of items.slice(0, MAX_CARDS)) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as Record<string, unknown>;
    if (typeof item["id"] !== "string" || typeof item["fitNote"] !== "string") continue;
    const difficulty = DIFFICULTIES.find((d) => d === item["difficulty"]) ?? "unknown";
    const interest = typeof item["interest"] === "string" ? cleanNote(item["interest"]) : "";
    out.push({
      id: item["id"],
      fitNote: cleanNote(item["fitNote"]),
      difficulty,
      ...(interest !== "" && { interest }),
    });
  }
  return out;
}

export interface BuildCardsInput {
  session: TurnSearchSession;
  items: readonly ShowResourcesItem[];
  /** The learner's interests, for validating the model's `interest` field. */
  interests: readonly string[];
  /** The learner's message, the other thing an `interest` may come from. */
  requestText: string;
}

/**
 * Builds the cards for a turn. A card exists only for a ref the turn's searches produced; an unknown
 * or repeated id is dropped. The order is the search order, whatever order the model listed them in.
 */
export function buildResourceCards({ session, items, interests, requestText }: BuildCardsInput): {
  cards: ResourceCard[];
  dropped: number;
} {
  const chosen = new Map<string, ShowResourcesItem>();
  let dropped = 0;
  for (const item of items) {
    if (session.resultFor(item.id) === undefined || chosen.has(item.id)) dropped += 1;
    else chosen.set(item.id, item);
  }

  const cards: ResourceCard[] = [];
  for (const [ref, found] of session.entries()) {
    const item = chosen.get(ref);
    if (!item || cards.length >= MAX_CARDS) continue;
    const interest = item.interest !== undefined && isKnownInterest(item.interest, interests, requestText) ? item.interest : undefined;
    cards.push({
      ref,
      sourceId: found.sourceId,
      sourceDisplay: sourceDisplayOf(found.sourceId),
      externalId: found.externalId,
      title: found.title,
      channel: found.channel,
      durationSeconds: found.durationSeconds,
      hasCaptions: found.hasCaptions,
      audioLanguage: found.audioLanguage,
      type: found.type,
      priceLabel: found.priceLabel,
      accessNote: found.accessNote,
      sponsored: found.sponsored,
      affiliate: found.affiliate,
      link: found.link,
      fetchedAt: found.fetchedAt,
      fitNote: item.fitNote,
      difficulty: item.difficulty,
      ...(interest !== undefined && { interest }),
    });
  }
  return { cards, dropped };
}

function isKnownInterest(interest: string, interests: readonly string[], requestText: string): boolean {
  const wanted = interest.toLowerCase();
  return interests.some((i) => i.trim().toLowerCase() === wanted) || requestText.toLowerCase().includes(wanted);
}
