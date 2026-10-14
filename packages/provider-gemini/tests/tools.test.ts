import { sealSecret, type ModelRequest, type ModelTool, type StreamEvent } from "@tarjuman/core";
import { describe, expect, it } from "vitest";
import { GeminiProvider } from "../src/gemini-provider";
import streamAnswer from "./fixtures/stream-answer.json";
import streamBadArgs from "./fixtures/stream-tool-call-bad-args.json";
import streamToolCall from "./fixtures/stream-tool-call.json";
import streamTwoToolCalls from "./fixtures/stream-two-tool-calls.json";
import { FakeGemini, type Reply } from "./helpers/fake-gemini";

// How the adapter maps tool calls (contracts/provider-tool-calls.md, research R8). The fixtures are
// synthetic, shaped after the live capture of 2026-10-14. Fake key only.
const RAW_SECRET = "AQ.FAKEgeminiTOOLStestSECRETfakeFAKE_-fakeFAKE000001";

const SEARCH_TOOL: ModelTool = {
  name: "search_videos",
  description: "Search YouTube for videos.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      query: { type: "string", minLength: 1, maxLength: 120 },
      kind: { type: "string", enum: ["video", "song"] },
      filters: {
        type: "array",
        items: { type: "object", additionalProperties: false, properties: { captionsOnly: { type: "boolean" } } },
      },
    },
    required: ["query", "kind"],
  },
};

const REQUEST: ModelRequest = {
  modelId: "gemini-3.5-flash-lite",
  layers: [{ id: "security", text: "SECURITY" }],
  messages: [{ role: "user", content: "videos about climbing" }],
  maxTokens: 256,
  tools: [SEARCH_TOOL],
};

async function run(reply: Reply, req: ModelRequest = REQUEST) {
  const fake = new FakeGemini().enqueue(reply);
  const events: StreamEvent[] = [];
  for await (const event of new GeminiProvider({ fetch: fake.fetch }).stream(req, sealSecret(RAW_SECRET), new AbortController().signal)) {
    events.push(event);
  }
  const call = fake.calls[0];
  if (!call) throw new Error("no request was sent");
  return { events, call };
}

describe("GeminiProvider: tools in the request", () => {
  it("declares each ModelTool as a functionDeclaration, without additionalProperties", async () => {
    const { call } = await run({ kind: "sse", chunks: streamAnswer });
    expect(call.body?.["tools"]).toEqual([
      {
        functionDeclarations: [
          {
            name: "search_videos",
            description: "Search YouTube for videos.",
            parameters: {
              type: "object",
              properties: {
                query: { type: "string", minLength: 1, maxLength: 120 },
                kind: { type: "string", enum: ["video", "song"] },
                filters: { type: "array", items: { type: "object", properties: { captionsOnly: { type: "boolean" } } } },
              },
              required: ["query", "kind"],
            },
          },
        ],
      },
    ]);
    expect(call.rawBody).not.toContain("additionalProperties");
  });

  it("sends no tools field when the request has none", async () => {
    const { tools, ...withoutTools } = REQUEST;
    void tools;
    const { call } = await run({ kind: "sse", chunks: streamAnswer }, withoutTools);
    expect(call.body).not.toHaveProperty("tools");
    const empty = await run({ kind: "sse", chunks: streamAnswer }, { ...REQUEST, tools: [] });
    expect(empty.call.body).not.toHaveProperty("tools");
  });

  it("replays an assistant tool call as a model functionCall part with the same thoughtSignature", async () => {
    const { call } = await run(
      { kind: "sse", chunks: streamAnswer },
      {
        ...REQUEST,
        messages: [
          { role: "user", content: "videos about climbing" },
          {
            role: "assistant",
            content: "",
            toolCalls: [
              { id: "fc_1", name: "search_videos", input: { query: "escalada", kind: "video" }, continuation: "SIG-1" },
            ],
          },
        ],
      },
    );
    expect(call.body?.["contents"]).toEqual([
      { role: "user", parts: [{ text: "videos about climbing" }] },
      {
        role: "model",
        parts: [
          {
            functionCall: { id: "fc_1", name: "search_videos", args: { query: "escalada", kind: "video" } },
            thoughtSignature: "SIG-1",
          },
        ],
      },
    ]);
  });

  it("keeps the text of an assistant step before its calls and omits a signature it never had", async () => {
    const { call } = await run(
      { kind: "sse", chunks: streamAnswer },
      {
        ...REQUEST,
        messages: [
          { role: "user", content: "q" },
          {
            role: "assistant",
            content: "Looking that up.",
            toolCalls: [{ id: "fc_2", name: "search_videos", input: { query: "x", kind: "song" } }],
          },
        ],
      },
    );
    const model = (call.body?.["contents"] as { role: string; parts: unknown[] }[])[1];
    expect(model?.parts).toEqual([
      { text: "Looking that up." },
      { functionCall: { id: "fc_2", name: "search_videos", args: { query: "x", kind: "song" } } },
    ]);
  });

  it("answers calls with functionResponse parts carrying the call id and { content }, in one user turn", async () => {
    const { call } = await run(
      { kind: "sse", chunks: streamAnswer },
      {
        ...REQUEST,
        messages: [
          { role: "user", content: "q" },
          {
            role: "assistant",
            content: "",
            toolCalls: [
              { id: "fc_a", name: "search_videos", input: { query: "a", kind: "video" } },
              { id: "fc_b", name: "search_videos", input: { query: "b", kind: "video" } },
            ],
          },
          { role: "tool", toolCallId: "fc_a", name: "search_videos", content: "<untrusted_data>A</untrusted_data>" },
          { role: "tool", toolCallId: "fc_b", name: "search_videos", content: "<untrusted_data>B</untrusted_data>" },
        ],
      },
    );
    const contents = call.body?.["contents"] as { role: string; parts: unknown[] }[];
    expect(contents).toHaveLength(3);
    expect(contents[2]).toEqual({
      role: "user",
      parts: [
        { functionResponse: { id: "fc_a", name: "search_videos", response: { content: "<untrusted_data>A</untrusted_data>" } } },
        { functionResponse: { id: "fc_b", name: "search_videos", response: { content: "<untrusted_data>B</untrusted_data>" } } },
      ],
    });
  });

  it("never puts the key in a tools request", async () => {
    const { call } = await run({ kind: "sse", chunks: streamAnswer });
    expect(call.rawBody).not.toContain(RAW_SECRET);
    expect(call.url).not.toContain("key=");
  });
});

describe("GeminiProvider: tool calls in the stream", () => {
  it("turns a functionCall part into one tool_call with the signature as continuation, and stops with tool_use", async () => {
    const { events } = await run({ kind: "sse", chunks: streamToolCall });
    expect(events.filter((e) => e.type === "tool_call")).toEqual([
      {
        type: "tool_call",
        id: "fc_synthetic_1",
        name: "search_videos",
        input: { query: "escalada deportiva", kind: "video" },
        continuation: "SYNTHETIC-SIGNATURE-1",
      },
    ]);
    expect(events.at(-1)).toEqual({ type: "stop", reason: "tool_use" });
    expect(events.at(-2)).toMatchObject({ type: "usage", inputTokens: 200, outputTokens: 42 });
  });

  it("emits several calls in order, with a continuation only where the part had a signature", async () => {
    const { events } = await run({ kind: "sse", chunks: streamTwoToolCalls });
    const calls = events.filter((e) => e.type === "tool_call");
    expect(calls).toEqual([
      {
        type: "tool_call",
        id: "fc_synthetic_a",
        name: "search_videos",
        input: { query: "escalada", kind: "video" },
        continuation: "SYNTHETIC-SIGNATURE-A",
      },
      { type: "tool_call", id: "fc_synthetic_b", name: "search_videos", input: { query: "bouldering", kind: "song" } },
    ]);
    expect(events.map((e) => (e.type === "text" ? e.delta : "")).join("")).toBe("Looking that up. ");
    expect(events.at(-1)).toEqual({ type: "stop", reason: "tool_use" });
  });

  it("reports args that are not an object as bad_request and emits no tool_call", async () => {
    const { events } = await run({ kind: "sse", chunks: streamBadArgs });
    expect(events.some((e) => e.type === "tool_call")).toBe(false);
    expect(events.at(-1)).toEqual({ type: "error", code: "bad_request" });
  });

  it("leaves a normal answer's stop reason as end", async () => {
    const { events } = await run({ kind: "sse", chunks: streamAnswer });
    expect(events.at(-1)).toEqual({ type: "stop", reason: "end" });
  });
});
