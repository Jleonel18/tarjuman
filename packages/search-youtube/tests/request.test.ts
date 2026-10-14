import { sealSecret, type SearchRequest } from "@tarjuman/core";
import { describe, expect, it } from "vitest";
import { YOUTUBE_API_ORIGIN } from "../src/origin";
import { YouTubeSearch } from "../src/youtube-search";
import { categoriesReply, FakeYouTube, ok, searchReply, videosReply } from "./helpers/fake-youtube";

// What the adapter puts on the wire (contracts/search-port.md → YouTube adapter). Fake key only.
const RAW_SECRET = "AIzaFAKEyoutubeREQUESTkey000000000000000";
const REQUEST: SearchRequest = { query: "escalada deportiva", targetLanguage: "es-AR", kind: "any", captionsOnly: false, maxResults: 8 };
const signal = () => new AbortController().signal;

async function search(req: Partial<SearchRequest> = {}) {
  const fake = new FakeYouTube().enqueue(searchReply(), videosReply());
  const outcome = await new YouTubeSearch({ fetch: fake.fetch }).search({ ...REQUEST, ...req }, sealSecret(RAW_SECRET), signal());
  return { fake, outcome };
}

describe("YouTubeSearch: the search request", () => {
  it("calls search.list and then videos.list once each, on the Google APIs origin only", async () => {
    const { fake } = await search();
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls.every((c) => c.url.startsWith(`${YOUTUBE_API_ORIGIN}/youtube/v3/`))).toBe(true);
    expect(fake.calls.map((c) => c.path)).toEqual(["/youtube/v3/search", "/youtube/v3/videos"]);
    expect(fake.calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("sends the documented search parameters", async () => {
    const { fake } = await search();
    expect(fake.calls[0]?.query).toEqual({
      part: "snippet",
      type: "video",
      maxResults: "8",
      safeSearch: "strict",
      q: "escalada deportiva",
      relevanceLanguage: "es",
    });
  });

  it("adds the music category and the caption filter only when asked", async () => {
    const { fake } = await search({ kind: "music", captionsOnly: true });
    const params = fake.calls[0]?.params;
    expect(params?.get("videoCategoryId")).toBe("10");
    expect(params?.get("videoCaption")).toBe("closedCaption");
    const plain = (await search()).fake.calls[0]?.params;
    expect(plain?.has("videoCategoryId")).toBe(false);
    expect(plain?.has("videoCaption")).toBe(false);
  });

  it("asks videos.list for the details of the valid ids the search returned, in one call", async () => {
    const { fake } = await search();
    const params = fake.calls[1]?.params;
    expect(params?.get("part")).toBe("snippet,contentDetails");
    // The id that is not a video id is never sent; the removed one still is.
    expect(params?.get("id")).toBe("aaaaaaaaaaa,bbbbbbbbbbb,ccccccccccc");
  });

  it("carries the key only in the x-goog-api-key header, never in a URL (FR-004)", async () => {
    const { fake } = await search();
    for (const call of fake.calls) {
      expect(call.headers["x-goog-api-key"]).toBe(RAW_SECRET);
      expect(call.url).not.toContain("key=");
      expect(call.url).not.toContain(RAW_SECRET);
      expect(Object.keys(call.headers)).toEqual(["x-goog-api-key"]);
    }
  });

  it("encodes the query as a parameter, whatever it holds", async () => {
    const { fake } = await search({ query: "a&b=c#d key=1" });
    expect(fake.calls[0]?.params.get("q")).toBe("a&b=c#d key=1");
    expect(fake.calls[0]?.params.get("b")).toBeNull();
  });

  it("omits relevanceLanguage when the language tag is not a plain code", async () => {
    const { fake } = await search({ targetLanguage: "x" });
    expect(fake.calls[0]?.params.has("relevanceLanguage")).toBe(false);
  });

  it("makes no second call when the search finds nothing", async () => {
    const fake = new FakeYouTube().enqueue(ok({ items: [] }));
    const outcome = await new YouTubeSearch({ fetch: fake.fetch }).search(REQUEST, sealSecret(RAW_SECRET), signal());
    expect(outcome).toEqual({ ok: true, results: [] });
    expect(fake.calls).toHaveLength(1);
  });
});

describe("YouTubeSearch: details (card refresh)", () => {
  it("is one videos.list call for the ids, with the key in the header", async () => {
    const fake = new FakeYouTube().enqueue(videosReply());
    const outcome = await new YouTubeSearch({ fetch: fake.fetch }).details(["bbbbbbbbbbb", "aaaaaaaaaaa"], sealSecret(RAW_SECRET), signal());
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.path).toBe("/youtube/v3/videos");
    expect(fake.calls[0]?.params.get("id")).toBe("bbbbbbbbbbb,aaaaaaaaaaa");
    expect(fake.calls[0]?.headers["x-goog-api-key"]).toBe(RAW_SECRET);
    // Results follow the order asked for.
    expect(outcome.ok && outcome.results.map((r) => r.externalId)).toEqual(["bbbbbbbbbbb", "aaaaaaaaaaa"]);
  });

  it("sends no request for an id that is not a video id", async () => {
    const fake = new FakeYouTube();
    const outcome = await new YouTubeSearch({ fetch: fake.fetch }).details(["../x"], sealSecret(RAW_SECRET), signal());
    expect(outcome).toEqual({ ok: false, code: "bad_request" });
    expect(fake.calls).toHaveLength(0);
  });
});

describe("YouTubeSearch: key validation", () => {
  it("is one cheap videoCategories call with the key in the header only", async () => {
    const fake = new FakeYouTube().enqueue(categoriesReply());
    const result = await new YouTubeSearch({ fetch: fake.fetch }).validateCredential(sealSecret(RAW_SECRET));
    expect(result).toEqual({ ok: true });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.path).toBe("/youtube/v3/videoCategories");
    expect(fake.calls[0]?.query).toEqual({ part: "id", regionCode: "US" });
    expect(fake.calls[0]?.headers["x-goog-api-key"]).toBe(RAW_SECRET);
    expect(fake.calls[0]?.url).not.toContain("key=");
  });

  it("makes no request when already cancelled", async () => {
    const fake = new FakeYouTube();
    const controller = new AbortController();
    controller.abort();
    const result = await new YouTubeSearch({ fetch: fake.fetch }).validateCredential(sealSecret(RAW_SECRET), controller.signal);
    expect(result).toEqual({ ok: false, code: "network" });
    expect(fake.calls).toHaveLength(0);
  });
});

describe("YouTubeSearch identity", () => {
  it("is the youtube source with a terms version", () => {
    const youtube = new YouTubeSearch();
    expect(youtube.id).toBe("youtube");
    expect(youtube.termsVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
