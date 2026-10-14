import type { Message } from "../conversation/types";
import type { SearchErrorCode } from "../ports/search";
import type { StoragePort } from "../ports/storage";
import type { AbortSignalLike } from "../ports/provider";
import { isExpired, type ExpiredResourceCard, type ResourceCard, type StoredResourceCard } from "./resource-card";
import { sourceDisplayOf } from "./resource-cards";
import { savedId, type SavedResource } from "./saved-resources";
import type { BrokerErrorCode, SearchBroker } from "./search-broker";

/** YouTube data is not kept longer than this (005 FR-021; the API terms allow 30 days). */
export const RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;

export interface RetentionDeps {
  storage: StoragePort;
  search: SearchBroker;
  now: () => string;
}

export type RefreshOutcome =
  | { ok: true; card: ResourceCard }
  | { ok: false; code: "not_found" | BrokerErrorCode | SearchErrorCode };

/**
 * The 30-day rule for everything fetched from a search source: cards in conversations and saved
 * resources alike. Run at app start, it strips a card that is too old down to what is needed to
 * fetch it again. The learner can refresh one card, which makes one request and never retries.
 */
export class ResourceRetention {
  readonly #deps: RetentionDeps;

  constructor(deps: RetentionDeps) {
    this.#deps = deps;
  }

  /** Returns how many messages and saved resources changed. */
  async purgeExpired(): Promise<{ messages: number; saved: number }> {
    const cutoff = Date.parse(this.#deps.now()) - RETENTION_DAYS * DAY_MS;
    const tooOld = (card: StoredResourceCard) => !isExpired(card) && Date.parse(card.fetchedAt) < cutoff;
    const strip = (card: StoredResourceCard): StoredResourceCard =>
      tooOld(card) ? { expired: true, sourceId: card.sourceId, externalId: card.externalId, fetchedAt: card.fetchedAt } : card;

    let messages = 0;
    for (const message of await this.#deps.storage.query<Message>("messages")) {
      if (!message.resources?.some(tooOld)) continue;
      await this.#deps.storage.put("messages", { ...message, resources: message.resources.map(strip) });
      messages += 1;
    }
    let saved = 0;
    for (const item of await this.#deps.storage.query<SavedResource>("saved_resources")) {
      if (!tooOld(item.card)) continue;
      await this.#deps.storage.put("saved_resources", { ...item, card: strip(item.card) });
      saved += 1;
    }
    return { messages, saved };
  }

  /**
   * Fetches one video again and restores it everywhere it is kept as an expired card. The model's
   * judgement on the old card (fit note, difficulty) is gone with the rest, so the restored card
   * carries none. A video that is gone, or any failure, leaves the card expired.
   */
  async refresh(sourceId: string, externalId: string, signal: AbortSignalLike): Promise<RefreshOutcome> {
    const outcome = await this.#deps.search.details(sourceId, [externalId], signal);
    if (!outcome.ok) return { ok: false, code: outcome.code };
    const found = outcome.results.find((r) => r.externalId === externalId);
    if (!found) return { ok: false, code: "not_found" };
    const card: ResourceCard = {
      ref: "",
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
      fitNote: "",
      difficulty: "unknown",
    };

    const matches = (c: StoredResourceCard) => isExpired(c) && c.sourceId === sourceId && c.externalId === externalId;
    const restore = (c: StoredResourceCard): StoredResourceCard => (matches(c) ? card : c);
    for (const message of await this.#deps.storage.query<Message>("messages")) {
      if (message.resources?.some(matches)) {
        await this.#deps.storage.put("messages", { ...message, resources: message.resources.map(restore) });
      }
    }
    const id = savedId({ sourceId, externalId });
    const item = await this.#deps.storage.get<SavedResource>("saved_resources", id);
    if (item && matches(item.card)) await this.#deps.storage.put("saved_resources", { ...item, card });
    return { ok: true, card };
  }
}

export type { ExpiredResourceCard };
