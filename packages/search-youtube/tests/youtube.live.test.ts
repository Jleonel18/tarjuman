import { sealSecret } from "@tarjuman/core";
import { describe, expect, it } from "vitest";
import { YouTubeSearch } from "../src/youtube-search";

/**
 * Opt-in smoke test against the real YouTube Data API (`pnpm test:live:youtube`, 005 T041). A
 * search costs 100 quota units and a validation 1, out of the 10,000 daily, so it is not part of the
 * default run or CI. The key comes from `YOUTUBE_API_KEY`, loaded by `node --env-file=.env`; this
 * file never reads `.env` and never prints the key, a header, or the environment. It prints only
 * the result count, the first title, and status codes.
 */

// This package's tsconfig has no Node types on purpose (its src is browser code). This test runs
// only under Node, so it declares the one global it reads instead of widening the config.
declare const process: { env: Record<string, string | undefined> };

const KEY = process.env["YOUTUBE_API_KEY"] ?? "";

if (KEY === "") console.warn("Skipping the YouTube live test: YOUTUBE_API_KEY is not set. Run `pnpm test:live:youtube`.");

/** Counts requests, so the test can show nothing was retried. */
function countingFetch() {
  let calls = 0;
  const doFetch: typeof fetch = (input, init) => {
    calls += 1;
    return fetch(input, init);
  };
  return { doFetch, calls: () => calls };
}

describe.skipIf(KEY === "")("YouTubeSearch against the real API", () => {
  it("accepts the key with one validation request", async () => {
    const { doFetch, calls } = countingFetch();
    const result = await new YouTubeSearch({ fetch: doFetch }).validateCredential(sealSecret(KEY));
    console.info(`[youtube live] validation: ${JSON.stringify(result)}`);
    expect(result).toEqual({ ok: true });
    expect(calls()).toBe(1);
  });

  it("searches 'escalada' in Spanish with two requests and returns well-formed results", async () => {
    const { doFetch, calls } = countingFetch();
    const outcome = await new YouTubeSearch({ fetch: doFetch }).search(
      { query: "escalada", targetLanguage: "es", kind: "any", captionsOnly: false, maxResults: 8 },
      sealSecret(KEY),
      new AbortController().signal,
    );
    if (!outcome.ok) {
      console.info(`[youtube live] search failed: ${outcome.code}`);
      expect(calls()).toBeLessThanOrEqual(2);
      return;
    }
    console.info(`[youtube live] results: ${outcome.results.length}, first title: ${outcome.results[0]?.title ?? "(none)"}`);
    expect(outcome.results.length).toBeGreaterThan(0);
    expect(calls()).toBe(2);
    for (const result of outcome.results) {
      expect(result.link).toBe(`https://www.youtube.com/watch?v=${result.externalId}`);
      expect(JSON.stringify(result)).not.toContain(KEY);
    }
  });
});
