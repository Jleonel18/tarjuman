import { sealSecret, SEARCH_LIMITS, type SearchResult } from "@tarjuman/core";
import { describe, expect, it } from "vitest";
import { decodeEntities } from "../src/entities";
import { parseDuration } from "../src/duration";
import { YouTubeSearch } from "../src/youtube-search";
import odd from "./fixtures/videos-list-odd.json";
import { FakeYouTube, ok, searchReply, videosReply } from "./helpers/fake-youtube";

// How the adapter reads YouTube's responses (contracts/search-port.md → parsing). Synthetic fixtures.
const KEY = "AIzaFAKEyoutubePARSEkey00000000000000000";
const REQUEST = { query: "escalada", targetLanguage: "es", kind: "any" as const, captionsOnly: false, maxResults: 8 };
const NOW = "2026-10-14T12:00:00.000Z";

async function results(...replies: ReturnType<typeof searchReply>[]): Promise<SearchResult[]> {
  const fake = new FakeYouTube().enqueue(...replies);
  const outcome = await new YouTubeSearch({ fetch: fake.fetch, now: () => NOW }).search(REQUEST, sealSecret(KEY), new AbortController().signal);
  if (!outcome.ok) throw new Error(`search failed: ${outcome.code}`);
  return outcome.results;
}

describe("decodeEntities (fixed table)", () => {
  it.each([
    ["&#39;", "'"],
    ["&amp;", "&"],
    ["&quot;", '"'],
    ["&lt;", "<"],
    ["&gt;", ">"],
    ["Tom &amp; Jerry&#39;s", "Tom & Jerry's"],
  ])("decodes %s", (input, output) => expect(decodeEntities(input)).toBe(output));

  it("decodes once, so a double-escaped entity stays an entity", () => {
    expect(decodeEntities("&amp;lt;")).toBe("&lt;");
  });

  it("leaves unknown and numeric entities as text", () => {
    expect(decodeEntities("&unknown; &#x3C; &#60; &nbsp;")).toBe("&unknown; &#x3C; &#60; &nbsp;");
  });
});

describe("parseDuration (ISO 8601)", () => {
  it.each([
    ["PT4M5S", 245],
    ["PT1H2M3S", 3723],
    ["PT30S", 30],
    ["PT2H", 7200],
    ["P1DT1H", 90_000],
    ["PT0S", null],
    ["P0D", null],
    ["nonsense", null],
    ["", null],
    ["PT-5S", null],
  ])("%s -> %s", (input, seconds) => expect(parseDuration(input)).toBe(seconds));

  it("returns null for a missing duration", () => {
    expect(parseDuration(undefined)).toBeNull();
  });
});

describe("YouTubeSearch: results", () => {
  it("keeps the search order, drops invalid ids and videos videos.list no longer returns", async () => {
    const found = await results(searchReply(), videosReply());
    expect(found.map((r) => r.externalId)).toEqual(["aaaaaaaaaaa", "bbbbbbbbbbb"]);
  });

  it("builds every field from the response and sets the fixed ones", async () => {
    const [first, second] = await results(searchReply(), videosReply());
    expect(first).toEqual({
      sourceId: "youtube",
      externalId: "aaaaaaaaaaa",
      title: "Escalada para principiantes",
      channel: "Club Vertical",
      descriptionExcerpt: "Primeros pasos.",
      durationSeconds: 245,
      hasCaptions: false,
      audioLanguage: "es",
      type: "song",
      priceLabel: "free",
      accessNote: "age_restricted",
      sponsored: false,
      affiliate: false,
      link: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
      fetchedAt: NOW,
    });
    expect(second).toMatchObject({
      type: "video",
      durationSeconds: 3723,
      hasCaptions: true,
      audioLanguage: "es-419",
      accessNote: "region_restricted",
    });
  });

  it("decodes entities in titles, channels, and descriptions by the fixed table", async () => {
    const [, second] = await results(searchReply(), videosReply());
    expect(second?.title).toBe("Boulder & cuerda 'en vivo' <b> &unknown; &lt;");
    expect(second?.channel).toBe('Roca "Viva"');
  });

  it("builds the link from the validated id alone", async () => {
    for (const r of await results(searchReply(), videosReply())) {
      expect(r.link).toBe(`https://www.youtube.com/watch?v=${r.externalId}`);
      expect(SEARCH_LIMITS.externalIdPattern.test(r.externalId)).toBe(true);
    }
  });

  it("caps long fields and treats a bad language code and an odd duration as unknown", async () => {
    const found = await results(
      ok({ items: ["ddddddddddd", "fffffffffff", "ggggggggggg"].map((videoId) => ({ id: { videoId } })) }),
      ok(odd),
    );
    const [long, live, days] = found;
    expect(long?.title).toHaveLength(SEARCH_LIMITS.titleMax);
    expect(long?.channel).toHaveLength(SEARCH_LIMITS.channelMax);
    expect(long?.descriptionExcerpt).toHaveLength(SEARCH_LIMITS.descriptionExcerptMax);
    expect(long?.audioLanguage).toBeNull();
    expect(long?.durationSeconds).toBeNull();
    expect(long?.hasCaptions).toBeNull();
    expect(live?.durationSeconds).toBeNull();
    expect(days?.durationSeconds).toBe(90_000);
  });

  it("drops a result with a field that contains the key, and never returns the key", async () => {
    const found = await results(ok({ items: [{ id: { videoId: "eeeeeeeeeee" } }, { id: { videoId: "fffffffffff" } }] }), ok({
      items: [
        { id: "eeeeeeeeeee", snippet: { title: `leak ${KEY}`, channelTitle: "X", description: "Y" }, contentDetails: { duration: "PT30S" } },
        { id: "fffffffffff", snippet: { title: "fine", channelTitle: "X", description: `see ${KEY}` }, contentDetails: { duration: "PT30S" } },
      ],
    }));
    expect(found).toEqual([]);
    expect(JSON.stringify(found)).not.toContain(KEY);
  });

  it("drops an item whose snippet is missing instead of failing the whole search", async () => {
    const found = await results(
      ok({ items: [{ id: { videoId: "aaaaaaaaaaa" } }, { id: { videoId: "bbbbbbbbbbb" } }] }),
      ok({ items: [{ id: "aaaaaaaaaaa" }, { id: "bbbbbbbbbbb", snippet: { title: "ok", channelTitle: "c", description: "" }, contentDetails: {} }] }),
    );
    expect(found.map((r) => r.externalId)).toEqual(["bbbbbbbbbbb"]);
  });

  it("answers unknown when the body is not the documented shape at all", async () => {
    const fake = new FakeYouTube().enqueue(ok({ items: "nope" }));
    const outcome = await new YouTubeSearch({ fetch: fake.fetch }).search(REQUEST, sealSecret(KEY), new AbortController().signal);
    expect(outcome).toEqual({ ok: false, code: "unknown" });
  });
});
