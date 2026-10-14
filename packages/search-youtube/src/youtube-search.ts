import type {
  AbortSignalLike,
  SearchErrorCode,
  SearchOutcome,
  SearchPort,
  SearchRequest,
  SecretHandle,
  ValidationResult,
} from "@tarjuman/core";
import { SEARCH_LIMITS } from "@tarjuman/core";
import { unsealSecret } from "@tarjuman/core/adapter";
import { mapSearchError } from "./errors";
import { YOUTUBE_API_ORIGIN } from "./origin";
import { parseSearchIds, parseVideos } from "./parse";

/**
 * Version of the YouTube API Services Terms of Service and Google Privacy Policy the in-app consent
 * refers to. Bump it when those terms change, and every learner is asked again (FR-019).
 */
export const YOUTUBE_TERMS_VERSION = "2026-10-14";

const API = `${YOUTUBE_API_ORIGIN}/youtube/v3`;
const MUSIC_CATEGORY = "10";
/** `videos.list` takes at most 50 ids per call. */
const MAX_DETAIL_IDS = 50;

export interface YouTubeSearchOptions {
  /** Replaces the global `fetch`. Tests use it to run the adapter without a network. */
  fetch?: typeof fetch;
  /** ISO date stamped on results as `fetchedAt`. */
  now?: () => string;
}

type Fetched = { ok: true; body: unknown } | { ok: false; code: SearchErrorCode };

/**
 * YouTube Data API v3, the first search source (specs/005-resource-curation, contracts/search-port.md).
 * Native `fetch` from the browser; the key is unsealed only here, only to set the `x-goog-api-key`
 * header, and never goes into a URL, a result, or an error. One request per call, never retried.
 * Everything it returns is validated and capped: the source is untrusted.
 */
export class YouTubeSearch implements SearchPort {
  readonly id = "youtube";
  readonly termsVersion = YOUTUBE_TERMS_VERSION;
  readonly #fetch: typeof fetch;
  readonly #now: () => string;

  constructor(options: YouTubeSearchOptions = {}) {
    // Not bound to a receiver: calling the global `fetch` as a method of another object throws.
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  /** One `videoCategories` call: it needs the key and the enabled API, costs one quota unit, and sends no user data. */
  async validateCredential(secret: SecretHandle, signal?: AbortSignalLike): Promise<ValidationResult> {
    const fetched = await this.#get("videoCategories", { part: "id", regionCode: "US" }, unsealSecret(secret), signal);
    if (fetched.ok) return { ok: true };
    // The adapter's own codes, as the provider-side vocabulary KeyManager shows to the learner.
    const code = fetched.code === "not_enabled" ? "permission_denied" : fetched.code;
    return { ok: false, code };
  }

  async search(req: SearchRequest, secret: SecretHandle, signal: AbortSignalLike): Promise<SearchOutcome> {
    const key = unsealSecret(secret);
    const params: Record<string, string> = {
      part: "snippet",
      type: "video",
      maxResults: String(Math.min(Math.max(Math.trunc(req.maxResults), 1), SEARCH_LIMITS.resultsPerSearch)),
      safeSearch: "strict",
      q: req.query,
    };
    const language = /^([A-Za-z]{2,3})(?:-|$)/.exec(req.targetLanguage)?.[1];
    if (language) params["relevanceLanguage"] = language.toLowerCase();
    if (req.kind === "music") params["videoCategoryId"] = MUSIC_CATEGORY;
    if (req.captionsOnly) params["videoCaption"] = "closedCaption";

    const found = await this.#get("search", params, key, signal);
    if (!found.ok) return found;
    const ids = parseSearchIds(found.body);
    if (ids === undefined) return { ok: false, code: "unknown" };
    if (ids.length === 0) return { ok: true, results: [] };
    return this.#videos(ids, key, signal);
  }

  async details(externalIds: string[], secret: SecretHandle, signal: AbortSignalLike): Promise<SearchOutcome> {
    const ids = [...new Set(externalIds)];
    if (ids.length === 0 || ids.length > MAX_DETAIL_IDS || !ids.every((id) => SEARCH_LIMITS.externalIdPattern.test(id))) {
      return { ok: false, code: "bad_request" };
    }
    return this.#videos(ids, unsealSecret(secret), signal);
  }

  async #videos(ids: string[], key: string, signal: AbortSignalLike): Promise<SearchOutcome> {
    const fetched = await this.#get("videos", { part: "snippet,contentDetails", id: ids.join(",") }, key, signal);
    if (!fetched.ok) return fetched;
    const results = parseVideos(fetched.body, ids, key, this.#now());
    return results === undefined ? { ok: false, code: "unknown" } : { ok: true, results };
  }

  async #get(path: string, params: Record<string, string>, key: string, signal?: AbortSignalLike): Promise<Fetched> {
    if (signal?.aborted) return { ok: false, code: "network" };
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await this.#fetch(`${API}/${path}?${new URLSearchParams(params).toString()}`, {
        method: "GET",
        headers: { "x-goog-api-key": key },
        signal: controller.signal,
      });
      const body = await readJson(response);
      if (!response.ok) return { ok: false, code: mapSearchError(response.status, body) };
      return { ok: true, body };
    } catch {
      // Whatever `fetch` threw is dropped: its message could hold anything.
      return { ok: false, code: "network" };
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
