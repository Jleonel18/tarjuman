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

  it("round-trips a tool call: the call arrives with a continuation, and the result lets the answer stream (005)", async () => {
    const tool = {
      name: "lookup_word",
      description: "Looks up one word and returns its meaning.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: { word: { type: "string", description: "The word to look up." } },
        required: ["word"],
      },
    };
    const base = {
      modelId: MODEL_ID,
      layers: [{ id: "security" as const, text: "Always call lookup_word before answering. Then answer in one short sentence." }],
      maxTokens: 512,
      effort: "low" as const,
      tools: [tool],
    };
    const provider = new GeminiProvider();

    const first: StreamEvent[] = [];
    for await (const event of provider.stream(
      { ...base, messages: [{ role: "user", content: "What does the Spanish word 'ser' mean?" }] },
      sealSecret(KEY),
      new AbortController().signal,
    )) {
      first.push(event);
    }
    const call = first.find((e) => e.type === "tool_call");
    console.info(`[gemini live] tool round trip, step 1: ${JSON.stringify(first.map((e) => (e.type === "tool_call" ? { type: e.type, name: e.name, hasContinuation: e.continuation !== undefined } : e.type)))}`);
    const failure = first.at(-1);
    if (failure?.type === "error" && (failure.code === "rate_limited" || failure.code === "overloaded")) {
      console.info(`[gemini live] the service answered ${failure.code}; nothing was retried.`);
      return;
    }
    // The model is not forced to call the tool (tool_choice is never sent), so report instead of failing.
    if (!call || call.type !== "tool_call") {
      console.info("[gemini live] the model answered without calling the tool; the round trip was not exercised.");
      return;
    }
    expect(call.name).toBe("lookup_word");
    expect(call.continuation, "Gemini returns a thought signature that must be sent back").toBeDefined();
    expect(first.at(-1)).toEqual({ type: "stop", reason: "tool_use" });

    const second: StreamEvent[] = [];
    for await (const event of provider.stream(
      {
        ...base,
        messages: [
          { role: "user", content: "What does the Spanish word 'ser' mean?" },
          { role: "assistant", content: "", toolCalls: [{ id: call.id, name: call.name, input: call.input, ...(call.continuation !== undefined && { continuation: call.continuation }) }] },
          { role: "tool", toolCallId: call.id, name: call.name, content: "ser: to be (identity, origin, characteristics)" },
        ],
      },
      sealSecret(KEY),
      new AbortController().signal,
    )) {
      second.push(event);
    }
    const text = second.map((e) => (e.type === "text" ? e.delta : "")).join("");
    console.info(`[gemini live] tool round trip, step 2: text ${JSON.stringify(text)} last ${JSON.stringify(second.at(-1))}`);
    expect(JSON.stringify([first, second])).not.toContain(KEY);
    const last = second.at(-1);
    if (last?.type === "error" && (last.code === "rate_limited" || last.code === "overloaded")) return;
    // Sending the call back without its signature fails with a 400; with it, the answer streams.
    expect(second.some((e) => e.type === "error")).toBe(false);
    expect(text.length).toBeGreaterThan(0);
    expect(last).toEqual({ type: "stop", reason: "end" });
  });
});
