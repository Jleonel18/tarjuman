import { sealSecret, type StreamEvent } from "@tarjuman/core";
import { describe, expect, it } from "vitest";
import { GeminiProvider } from "../src/gemini-provider";

/**
 * Opt-in smoke test against the real Gemini API (`pnpm test:live:gemini`, 004 US3). It spends a few
 * tokens on the cheapest listed model, so it is not part of the default run or CI. The key comes
 * from `GEMINI_API_KEY`, loaded by `node --env-file=.env`; this file never reads `.env` and never
 * prints the key, a header, or the environment. Results print as one line: text, usage, stop.
 */

// This package's tsconfig has no Node types on purpose (its src is browser code). This test runs
// only under Node, so it declares the one global it reads instead of widening the config.
declare const process: { env: Record<string, string | undefined> };

const KEY = process.env["GEMINI_API_KEY"] ?? "";
const MODEL_ID = "gemini-3.5-flash-lite";

if (KEY === "") console.warn("Skipping the Gemini live test: GEMINI_API_KEY is not set. Run `pnpm test:live:gemini`.");

/** Counts requests, so the test can show nothing was retried. */
function countingFetch() {
  let calls = 0;
  const doFetch: typeof fetch = (input, init) => {
    calls += 1;
    return fetch(input, init);
  };
  return { doFetch, calls: () => calls };
}

describe.skipIf(KEY === "")(`GeminiProvider against the real API (${MODEL_ID})`, () => {
  it("accepts the key with one validation request", async () => {
    const { doFetch, calls } = countingFetch();
    const result = await new GeminiProvider({ fetch: doFetch }).validateCredential(sealSecret(KEY));
    console.info(`[gemini live] validation: ${JSON.stringify(result)}`);
    expect(result).toEqual({ ok: true });
    expect(calls()).toBe(1);
  });

  it("streams one short answer with text, usage, and a stop, or reports a busy service without retrying", async () => {
    const { doFetch, calls } = countingFetch();
    const events: StreamEvent[] = [];
    for await (const event of new GeminiProvider({ fetch: doFetch }).stream(
      {
        modelId: MODEL_ID,
        layers: [{ id: "security", text: "Answer in one short sentence." }],
        messages: [{ role: "user", content: "Say hola in Spanish." }],
        // Thinking tokens count against this limit, so it leaves room for them.
        maxTokens: 256,
        effort: "low",
      },
      sealSecret(KEY),
      new AbortController().signal,
    )) {
      events.push(event);
    }

    const text = events.map((e) => (e.type === "text" ? e.delta : "")).join("");
    const usage = events.find((e) => e.type === "usage");
    const last = events.at(-1);
    console.info(`[gemini live] text: ${JSON.stringify(text)} usage: ${JSON.stringify(usage)} last: ${JSON.stringify(last)}`);
    expect(calls()).toBe(1);
    expect(JSON.stringify(events)).not.toContain(KEY);

    if (last?.type === "error" && (last.code === "rate_limited" || last.code === "overloaded")) {
      // Free-tier limits and demand spikes happen (seen live on 2026-10-14). Reported, not retried.
      console.info(`[gemini live] the service answered ${last.code}; nothing was retried.`);
      return;
    }
    expect(text.length).toBeGreaterThan(0);
    expect(usage).toMatchObject({ inputTokens: expect.any(Number), outputTokens: expect.any(Number) });
    expect(last).toEqual({ type: "stop", reason: "end" });
  });
});
