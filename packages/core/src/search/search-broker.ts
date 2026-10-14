import { guardInput } from "../pipeline/input-guard";
import { destroySecret } from "../ports/secret-handle";
import type { AbortSignalLike } from "../ports/provider";
import { SEARCH_LIMITS } from "../ports/search";
import type { SearchErrorCode, SearchKind, SearchPort, SearchRequest, SearchResult } from "../ports/search";
import type { CredentialStore } from "../ports/storage";
import type { SearchSettingsStore } from "./search-settings";

/** What the broker adds to the port's codes: no request was made. */
export type BrokerErrorCode = SearchErrorCode | "disabled" | "no_consent";

export type BrokerOutcome = { ok: true; results: SearchResult[] } | { ok: false; code: BrokerErrorCode };

/** What a caller may choose. Everything else is fixed by the app (FR-004). */
export interface BrokerSearchRequest {
  query: string;
  /** From the profile, never from the model. */
  targetLanguage: string;
  kind: SearchKind;
  captionsOnly: boolean;
}

export interface SearchBrokerDeps {
  ports: readonly SearchPort[];
  settings: SearchSettingsStore;
  /** Search keys are stored under the source id (005 data-model → Credential id). */
  credentials: CredentialStore;
}

const MAX_DETAILS_IDS = 50;

/**
 * The only holder of `SearchPort` instances (lint:arch checks it). Capabilities never see a port or
 * a key: they get a brokered `ctx.search` that ends here.
 *
 * Every call checks the on/off switch and the learner's consent first, then validates what leaves
 * the device, loads the key, and calls the port exactly once. It never retries and never passes the
 * key anywhere else. Whatever the port returns is validated again: the core does not trust an
 * adapter to have cleaned an untrusted source.
 */
export class SearchBroker {
  readonly #ports: readonly SearchPort[];
  readonly #settings: SearchSettingsStore;
  readonly #credentials: CredentialStore;

  constructor(deps: SearchBrokerDeps) {
    this.#ports = Object.freeze([...deps.ports]);
    this.#settings = deps.settings;
    this.#credentials = deps.credentials;
  }

  /** The current terms version of a source, which consent is recorded against. */
  termsVersionOf(sourceId: string): string | undefined {
    return this.#ports.find((p) => p.id === sourceId)?.termsVersion;
  }

  /**
   * Whether a source can be searched right now, apart from consent (which has its own question,
   * because tools are offered without it and asking happens when the model uses one).
   */
  async availability(sourceId: string): Promise<"ready" | "off" | "no_key"> {
    if (!(await this.#settings.isEnabled())) return "off";
    return (await this.#credentials.describe(sourceId)) === undefined ? "no_key" : "ready";
  }

  async hasConsent(sourceId: string): Promise<boolean> {
    const version = this.termsVersionOf(sourceId);
    return version !== undefined && (await this.#settings.hasConsent(sourceId, version));
  }

  /** The ids of the sources this app can search. */
  get sourceIds(): string[] {
    return this.#ports.map((p) => p.id);
  }

  async run(sourceId: string, req: BrokerSearchRequest, signal: AbortSignalLike): Promise<BrokerOutcome> {
    const port = this.#ports.find((p) => p.id === sourceId);
    if (!port) return { ok: false, code: "bad_request" };
    const gate = await this.#gate(port);
    if (gate) return gate;

    const query = req.query.trim();
    if (query === "" || query.length > SEARCH_LIMITS.queryMax || guardInput({ userText: query }).keyShapeDetected) {
      return { ok: false, code: "bad_request" };
    }
    const request: SearchRequest = {
      query,
      targetLanguage: req.targetLanguage,
      kind: req.kind,
      captionsOnly: req.captionsOnly,
      maxResults: SEARCH_LIMITS.resultsPerSearch,
    };
    return this.#call(port, (secret) => port.search(request, secret, signal));
  }

  /** Card refresh: the current data of known ids (one call, same gates as a search). */
  async details(sourceId: string, externalIds: string[], signal: AbortSignalLike): Promise<BrokerOutcome> {
    const port = this.#ports.find((p) => p.id === sourceId);
    if (!port) return { ok: false, code: "bad_request" };
    const gate = await this.#gate(port);
    if (gate) return gate;
    if (
      externalIds.length === 0 ||
      externalIds.length > MAX_DETAILS_IDS ||
      !externalIds.every((id) => SEARCH_LIMITS.externalIdPattern.test(id))
    ) {
      return { ok: false, code: "bad_request" };
    }
    return this.#call(port, (secret) => port.details([...externalIds], secret, signal));
  }

  async #gate(port: SearchPort): Promise<BrokerOutcome | undefined> {
    if (!(await this.#settings.isEnabled())) return { ok: false, code: "disabled" };
    if (!(await this.#settings.hasConsent(port.id, port.termsVersion))) return { ok: false, code: "no_consent" };
    return undefined;
  }

  async #call(
    port: SearchPort,
    send: (secret: NonNullable<Awaited<ReturnType<CredentialStore["load"]>>>) => ReturnType<SearchPort["search"]>,
  ): Promise<BrokerOutcome> {
    const secret = await this.#credentials.load(port.id);
    if (!secret) return { ok: false, code: "invalid_credential" };
    try {
      const outcome = await send(secret);
      if (!outcome.ok) return { ok: false, code: outcome.code };
      return { ok: true, results: outcome.results.flatMap((r) => sanitize(port.id, r)) };
    } catch {
      // Whatever was thrown is dropped: its message could hold anything, the key included.
      return { ok: false, code: "network" };
    } finally {
      destroySecret(secret);
    }
  }
}

/** Drops a result with an unusable id or link; caps and cleans the text fields of the others. */
function sanitize(sourceId: string, r: SearchResult): SearchResult[] {
  if (!SEARCH_LIMITS.externalIdPattern.test(r.externalId)) return [];
  if (!r.link.startsWith("https://") || !r.link.includes(r.externalId) || /\s/.test(r.link)) return [];
  return [
    {
      ...r,
      sourceId,
      title: cleanText(r.title, SEARCH_LIMITS.titleMax),
      channel: cleanText(r.channel, SEARCH_LIMITS.channelMax),
      descriptionExcerpt: cleanText(r.descriptionExcerpt, SEARCH_LIMITS.descriptionExcerptMax),
    },
  ];
}

/** Caps first (cheap), then withholds key-shaped tokens so they cannot travel into a later request. */
function cleanText(text: string, max: number): string {
  const capped = [...text].slice(0, max).join("");
  return guardInput({ userText: capped }).userText;
}
