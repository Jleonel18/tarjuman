import { sealSecret, type ModelRequest, type StreamEvent } from "@tarjuman/core";
import { describe, expect, it } from "vitest";
import { GeminiProvider } from "../src/gemini-provider";
import streamAnswer from "./fixtures/stream-answer.json";
import streamErrorMidway from "./fixtures/stream-error-midway.json";
import streamMaxTokens from "./fixtures/stream-max-tokens.json";
import streamPromptBlocked from "./fixtures/stream-prompt-blocked.json";
import streamSafety from "./fixtures/stream-safety-after-text.json";
import streamThought from "./fixtures/stream-thought-part.json";
import streamTruncated from "./fixtures/stream-truncated.json";
import { FakeGemini, sseText, type Reply } from "./helpers/fake-gemini";

// How the adapter reads Gemini's stream (contracts/gemini-provider.md, research R3–R5). Fake key.
const RAW_SECRET = "AQ.FAKEgeminiSTREAMtestSECRETfakeFAKE_-fakeFAKE000001";

const REQUEST: ModelRequest = {
  modelId: "gemini-3.5-flash-lite",
  layers: [{ id: "security", text: "SECURITY" }],
  messages: [{ role: "user", content: "What does ser mean?" }],
  maxTokens: 256,
};

async function run(reply: Reply, signal: AbortSignal = new AbortController().signal): Promise<StreamEvent[]> {
  const fake = new FakeGemini().enqueue(reply);
  const events: StreamEvent[] = [];
  for await (const event of new GeminiProvider({ fetch: fake.fetch }).stream(REQUEST, sealSecret(RAW_SECRET), signal)) events.push(event);
  return events;
}

const textOf = (events: StreamEvent[]) => events.map((e) => (e.type === "text" ? e.delta : "")).join("");
const nonText = (events: StreamEvent[]) => events.filter((e) => e.type !== "text");

describe("GeminiProvider: a normal answer", () => {
  it("streams the text in order, then usage, then stop: end", async () => {
    const events = await run({ kind: "sse", chunks: streamAnswer });
    expect(textOf(events)).toBe("ACCEPT\nSer describes identity; estar describes state.");
    expect(events.at(-1)).toEqual({ type: "stop", reason: "end" });
    expect(events.at(-2)?.type).toBe("usage");
  });

  it("maps usage as research R4 says: input without cache, cache read, output with thoughts, latest chunk wins", async () => {
    // Last chunk: prompt 120 (20 cached), candidates 15, thoughts 57.
    const events = await run({ kind: "sse", chunks: streamAnswer });
    expect(events.filter((e) => e.type === "usage")).toEqual([
      { type: "usage", inputTokens: 100, outputTokens: 72, cacheReadTokens: 20, cacheWriteTokens: 0 },
    ]);
  });

  it("never shows a part marked as thought", async () => {
    const events = await run({ kind: "sse", chunks: streamThought });
    expect(textOf(events)).toBe("ACCEPT\nSer is permanent.");
    expect(JSON.stringify(events)).not.toContain("The learner asks about ser");
  });

  it("parses the same whatever the byte boundaries of the stream", async () => {
    const text = sseText(streamAnswer);
    const whole = await run({ kind: "sse-raw", text });
    const bytes = new TextEncoder().encode(text);
    for (let cut = 1; cut < bytes.length; cut += 1) {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.slice(0, cut));
          controller.enqueue(bytes.slice(cut));
          controller.close();
        },
      });
      const doFetch = async () => new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
      const events: StreamEvent[] = [];
      for await (const e of new GeminiProvider({ fetch: doFetch }).stream(REQUEST, sealSecret(RAW_SECRET), new AbortController().signal)) events.push(e);
      expect(events, `cut at ${cut}`).toEqual(whole);
    }
  });
});

describe("GeminiProvider: how an answer ends (research R5)", () => {
  it("MAX_TOKENS → stop: max_tokens", async () => {
    const events = await run({ kind: "sse", chunks: streamMaxTokens });
    expect(events.at(-1)).toEqual({ type: "stop", reason: "max_tokens" });
  });

  it("a safety block after text → the text so far, usage, then stop: refusal", async () => {
    const events = await run({ kind: "sse", chunks: streamSafety });
    expect(textOf(events)).toBe("ACCEPT\nHere is ");
    expect(nonText(events)).toEqual([
      { type: "usage", inputTokens: 50, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 0 },
      { type: "stop", reason: "refusal" },
    ]);
  });

  it("a blocked prompt with no candidate → stop: refusal and no text", async () => {
    const events = await run({ kind: "sse", chunks: streamPromptBlocked });
    expect(textOf(events)).toBe("");
    expect(events.at(-1)).toEqual({ type: "stop", reason: "refusal" });
  });

  it.each(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY", "LANGUAGE", "OTHER", "SOMETHING_NEW"])(
    "finishReason %s → stop: refusal (fail closed)",
    async (finishReason) => {
      const chunks = [{ candidates: [{ content: { parts: [{ text: "x" }], role: "model" }, finishReason, index: 0 }] }];
      const events = await run({ kind: "sse", chunks });
      expect(events.at(-1)).toEqual({ type: "stop", reason: "refusal" });
    },
  );

  it("a stream that ends with no finish reason is incomplete: error network, after the text", async () => {
    const events = await run({ kind: "sse", chunks: streamTruncated });
    expect(textOf(events)).toBe("ACCEPT\nSer describes");
    expect(events.at(-1)).toEqual({ type: "error", code: "network" });
    expect(events.some((e) => e.type === "stop")).toBe(false);
  });

  it("an error object inside the stream → the text so far, then the mapped error", async () => {
    const events = await run({ kind: "sse", chunks: streamErrorMidway });
    expect(textOf(events)).toBe("ACCEPT\nSer ");
    expect(events.at(-1)).toEqual({ type: "error", code: "overloaded" });
    expect(JSON.stringify(events)).not.toContain("SYNTHETIC");
  });

  it("a malformed data line → error unknown", async () => {
    const events = await run({ kind: "sse-raw", text: 'data: {"candidates": [\r\n\r\n' });
    expect(events.at(-1)).toEqual({ type: "error", code: "unknown" });
  });

  it("an error status with an event-stream content type (seen live) is still an error", async () => {
    const events = await run({
      kind: "json",
      status: 503,
      contentType: "text/event-stream",
      body: { error: { code: 503, message: "high demand", status: "UNAVAILABLE" } },
    });
    expect(events).toEqual([{ type: "error", code: "overloaded" }]);
  });
});

describe("GeminiProvider: abort", () => {
  it("before the start → stop: aborted and no request", async () => {
    const fake = new FakeGemini();
    const controller = new AbortController();
    controller.abort();
    const events: StreamEvent[] = [];
    for await (const e of new GeminiProvider({ fetch: fake.fetch }).stream(REQUEST, sealSecret(RAW_SECRET), controller.signal)) events.push(e);
    expect(events).toEqual([{ type: "stop", reason: "aborted" }]);
    expect(fake.calls).toHaveLength(0);
  });

  it("mid-stream → the text so far, then stop: aborted", async () => {
    const controller = new AbortController();
    const fake = new FakeGemini().enqueue({ kind: "sse", chunks: streamAnswer, chunkDelayMs: 30 });
    const events: StreamEvent[] = [];
    for await (const e of new GeminiProvider({ fetch: fake.fetch }).stream(REQUEST, sealSecret(RAW_SECRET), controller.signal)) {
      events.push(e);
      if (e.type === "text") controller.abort();
    }
    expect(textOf(events)).toBe("ACCEPT\n");
    expect(events.at(-1)).toEqual({ type: "stop", reason: "aborted" });
  });
});

describe("GeminiProvider: the key never comes back", () => {
  it("redacts the key if the model echoes it, even split across chunks", async () => {
    const half = Math.floor(RAW_SECRET.length / 2);
    const chunks = [
      { candidates: [{ content: { parts: [{ text: `ACCEPT\nyour key is ${RAW_SECRET.slice(0, half)}` }], role: "model" }, index: 0 }] },
      { candidates: [{ content: { parts: [{ text: `${RAW_SECRET.slice(half)} ok` }], role: "model" }, finishReason: "STOP", index: 0 }] },
    ];
    const events = await run({ kind: "sse", chunks });
    expect(textOf(events)).toBe("ACCEPT\nyour key is [redacted] ok");
    expect(JSON.stringify(events)).not.toContain(RAW_SECRET);
  });
});
