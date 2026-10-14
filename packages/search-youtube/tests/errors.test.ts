import { sealSecret, type SearchErrorCode } from "@tarjuman/core";
import { describe, expect, it } from "vitest";
import { YouTubeSearch } from "../src/youtube-search";
import { errorReply, FakeYouTube, type ErrorCase } from "./helpers/fake-youtube";

// The error table of contracts/search-port.md. Server text never surfaces. Fake key only.
const KEY = "AIzaFAKEyoutubeERRORkey000000000000000000";
const REQUEST = { query: "escalada", targetLanguage: "es", kind: "any" as const, captionsOnly: false, maxResults: 8 };

const TABLE: [ErrorCase, SearchErrorCode][] = [
  ["key_invalid", "invalid_credential"],
  ["key_invalid_legacy", "invalid_credential"],
  ["bad_request", "bad_request"],
  ["not_enabled", "not_enabled"],
  ["service_disabled", "not_enabled"],
  ["quota", "quota_exhausted"],
  ["daily_limit", "quota_exhausted"],
  ["forbidden_other", "invalid_credential"],
  ["unauthorized", "invalid_credential"],
  ["rate", "rate_limited"],
  ["server", "unknown"],
  ["html", "unknown"],
];

describe("YouTubeSearch: search errors", () => {
  it.each(TABLE)("maps the %s case to %s, with no server text", async (name, code) => {
    const fake = new FakeYouTube().enqueue(errorReply(name));
    const outcome = await new YouTubeSearch({ fetch: fake.fetch }).search(REQUEST, sealSecret(KEY), new AbortController().signal);
    expect(outcome).toEqual({ ok: false, code });
    expect(JSON.stringify(outcome)).not.toContain("SECRET-SERVER-TEXT");
    // A failed search.list is the end: videos.list is never called, and nothing is retried.
    expect(fake.calls).toHaveLength(1);
  });

  it("maps an error from videos.list the same way", async () => {
    const fake = new FakeYouTube().enqueue(
      { kind: "json", status: 200, body: { items: [{ id: { videoId: "aaaaaaaaaaa" } }] } },
      errorReply("quota"),
    );
    const outcome = await new YouTubeSearch({ fetch: fake.fetch }).search(REQUEST, sealSecret(KEY), new AbortController().signal);
    expect(outcome).toEqual({ ok: false, code: "quota_exhausted" });
    expect(fake.calls).toHaveLength(2);
  });

  it("maps a failed fetch to network, without its message, and calls once", async () => {
    const fake = new FakeYouTube().enqueue({ kind: "reject", error: new TypeError(`Failed to fetch x-goog-api-key: ${KEY}`) });
    const outcome = await new YouTubeSearch({ fetch: fake.fetch }).search(REQUEST, sealSecret(KEY), new AbortController().signal);
    expect(outcome).toEqual({ ok: false, code: "network" });
    expect(JSON.stringify(outcome)).not.toContain(KEY);
    expect(fake.calls).toHaveLength(1);
  });

  it("makes no request when already cancelled", async () => {
    const fake = new FakeYouTube();
    const controller = new AbortController();
    controller.abort();
    const outcome = await new YouTubeSearch({ fetch: fake.fetch }).search(REQUEST, sealSecret(KEY), controller.signal);
    expect(outcome).toEqual({ ok: false, code: "network" });
    expect(fake.calls).toHaveLength(0);
  });
});

describe("YouTubeSearch: key validation errors", () => {
  it.each([
    ["key_invalid", "invalid_credential"],
    ["not_enabled", "permission_denied"],
    ["quota", "quota_exhausted"],
    ["rate", "rate_limited"],
    ["bad_request", "bad_request"],
    ["server", "unknown"],
  ] as const)("maps %s to %s", async (name, code) => {
    const fake = new FakeYouTube().enqueue(errorReply(name));
    const result = await new YouTubeSearch({ fetch: fake.fetch }).validateCredential(sealSecret(KEY));
    expect(result).toEqual({ ok: false, code });
    expect(fake.calls).toHaveLength(1);
  });

  it("maps a failed fetch to network", async () => {
    const fake = new FakeYouTube().enqueue({ kind: "reject", error: new TypeError("Failed to fetch") });
    expect(await new YouTubeSearch({ fetch: fake.fetch }).validateCredential(sealSecret(KEY))).toEqual({ ok: false, code: "network" });
  });
});
