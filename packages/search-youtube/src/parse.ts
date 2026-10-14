import { SEARCH_LIMITS, type SearchResult } from "@tarjuman/core";
import { z } from "zod";
import { parseDuration } from "./duration";
import { decodeEntities } from "./entities";

const searchResponse = z.object({ items: z.array(z.unknown()) });
const videosResponse = z.object({ items: z.array(z.unknown()) });
const searchItem = z.object({ id: z.object({ videoId: z.string() }) });
const videoItem = z.object({
  id: z.string(),
  snippet: z.object({
    title: z.string(),
    channelTitle: z.string(),
    description: z.string().optional(),
    categoryId: z.string().optional(),
    defaultAudioLanguage: z.string().optional(),
    defaultLanguage: z.string().optional(),
  }),
  contentDetails: z
    .object({
      duration: z.string().optional(),
      caption: z.string().optional(),
      regionRestriction: z.unknown().optional(),
      contentRating: z.object({ ytRating: z.string().optional() }).optional(),
    })
    .optional(),
});

const LANGUAGE_TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const MUSIC_CATEGORY = "10";

/** The ids `search.list` returned, valid and unique, in search order. `undefined` if the body is not a list. */
export function parseSearchIds(body: unknown): string[] | undefined {
  const parsed = searchResponse.safeParse(body);
  if (!parsed.success) return undefined;
  const ids: string[] = [];
  for (const raw of parsed.data.items) {
    const item = searchItem.safeParse(raw);
    const id = item.success ? item.data.id.videoId : undefined;
    if (id !== undefined && SEARCH_LIMITS.externalIdPattern.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Results from a `videos.list` body, in the order of `order` (the order of the search, or of a
 * refresh request). An id the response lacks is skipped, and so is an item that does not have the
 * documented shape or that holds the key. `undefined` if the body is not a list.
 */
export function parseVideos(body: unknown, order: readonly string[], rawKey: string, fetchedAt: string): SearchResult[] | undefined {
  const parsed = videosResponse.safeParse(body);
  if (!parsed.success) return undefined;
  const byId = new Map<string, z.infer<typeof videoItem>>();
  for (const raw of parsed.data.items) {
    const item = videoItem.safeParse(raw);
    if (item.success && SEARCH_LIMITS.externalIdPattern.test(item.data.id)) byId.set(item.data.id, item.data);
  }

  const results: SearchResult[] = [];
  for (const id of order) {
    const video = byId.get(id);
    if (!video || holdsKey(video, rawKey)) continue;
    const { snippet, contentDetails } = video;
    const language = snippet.defaultAudioLanguage ?? snippet.defaultLanguage;
    results.push({
      sourceId: "youtube",
      externalId: id,
      title: text(snippet.title, SEARCH_LIMITS.titleMax),
      channel: text(snippet.channelTitle, SEARCH_LIMITS.channelMax),
      descriptionExcerpt: text(snippet.description ?? "", SEARCH_LIMITS.descriptionExcerptMax),
      durationSeconds: parseDuration(contentDetails?.duration),
      hasCaptions: contentDetails?.caption === "true" ? true : contentDetails?.caption === "false" ? false : null,
      audioLanguage: language !== undefined && LANGUAGE_TAG.test(language) ? language : null,
      type: snippet.categoryId === MUSIC_CATEGORY ? "song" : "video",
      priceLabel: "free",
      accessNote:
        contentDetails?.regionRestriction !== undefined
          ? "region_restricted"
          : contentDetails?.contentRating?.ytRating === "ytAgeRestricted"
            ? "age_restricted"
            : null,
      sponsored: false,
      affiliate: false,
      // The only link a result has: the id alone, no other parameter (FR-014).
      link: `https://www.youtube.com/watch?v=${id}`,
      fetchedAt,
    });
  }
  return results;
}

/** Decoded, whitespace collapsed, and capped by characters. */
function text(value: string, max: number): string {
  return [...decodeEntities(value).replace(/\s+/g, " ").trim()].slice(0, max).join("");
}

function holdsKey(video: z.infer<typeof videoItem>, rawKey: string): boolean {
  if (rawKey === "") return false;
  const { snippet } = video;
  return [snippet.title, snippet.channelTitle, snippet.description ?? ""].some((field) => field.includes(rawKey));
}
