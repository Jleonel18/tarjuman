import { sealSecret, type ModelRequest, type ModelTool, type StreamEvent } from "@tarjuman/core";
import { describe, expect, it } from "vitest";
import { AnthropicProvider } from "../src/anthropic-provider";
import badJson from "./fixtures/stream-tool-use-bad-json.json";
import noInput from "./fixtures/stream-tool-use-no-input.json";
import toolUse from "./fixtures/stream-tool-use.json";
import { answerEvents, FakeAnthropic, type SseEvent } from "./helpers/fake-anthropic";

// How the adapter maps tool calls (contracts/provider-tool-calls.md, research R8). The fixtures are
// synthetic, written from the documented wire shape; none is a live capture. Fake key only.
const RAW_SECRET = "sk-ant-api03-SYNTHETIC-KEY-FOR-TOOLS-TESTS-0001";

const SEARCH_TOOL: ModelTool = {
  name: "search_videos",
  description: "Search YouTube for videos.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: { query: { type: "string" }, kind: { type: "string", enum: ["video", "song"] } },
    required: ["query", "kind"],
  },
};

const REQUEST: ModelRequest = {
  modelId: "claude-sonnet-5-5",
  layers: [{ id: "security", text: "SECURITY" }],
  messages: [{ role: "user", content: "videos about climbing" }],
  maxTokens: 256,
  tools: [SEARCH_TOOL],
};

async function run(events: SseEvent[], req: ModelRequest = REQUEST) {
  const fake = new FakeAnthropic().enqueue({ kind: "sse", events });
  const out: StreamEvent[] = [];
  for await (const event of new AnthropicProvider({ fetch: fake.fetch }).stream(req, sealSecret(RAW_SECRET), new AbortController().signal)) {
    out.push(event);
  }
  const call = fake.calls[0];
  if (!call) throw new Error("no request was sent");
  return { events: out, call };
}

const answer = () => answerEvents(["ACCEPT\nok"], 1, 1);

describe("AnthropicProvider: tools in the request", () => {
  it("sends each ModelTool as { name, description, input_schema }", async () => {
    const { call } = await run(answer());
    expect(call.body["tools"]).toEqual([
      {
        name: "search_videos",
        description: "Search YouTube for videos.",
        input_schema: SEARCH_TOOL.inputSchema,
      },
    ]);
  });

  it("sends no tools field without tools, and never sends tool_choice or thinking", async () => {
    const { tools, ...withoutTools } = REQUEST;
    void tools;
    const plain = await run(answer(), withoutTools);
    expect(plain.call.body).not.toHaveProperty("tools");
    const withTools = await run(answer());
    expect(withTools.call.body).not.toHaveProperty("tool_choice");
    expect(withTools.call.body).not.toHaveProperty("thinking");
  });

  it("replays an assistant tool call as text + tool_use blocks", async () => {
    const { call } = await run(answer(), {
      ...REQUEST,
      messages: [
        { role: "user", content: "videos about climbing" },
        {
          role: "assistant",
          content: "Let me look that up.",
          toolCalls: [{ id: "toolu_1", name: "search_videos", input: { query: "escalada", kind: "video" }, continuation: "ignored" }],
        },
      ],
    });
    expect((call.body["messages"] as unknown[])[1]).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "Let me look that up." },
        { type: "tool_use", id: "toolu_1", name: "search_videos", input: { query: "escalada", kind: "video" } },
      ],
    });
  });

  it("omits an empty text block", async () => {
    const { call } = await run(answer(), {
      ...REQUEST,
      messages: [
        { role: "user", content: "q" },
        { role: "assistant", content: "", toolCalls: [{ id: "toolu_1", name: "search_videos", input: {} }] },
      ],
    });
    expect((call.body["messages"] as { content: unknown[] }[])[1]?.content).toEqual([
      { type: "tool_use", id: "toolu_1", name: "search_videos", input: {} },
    ]);
  });

  it("answers calls with tool_result blocks in one user message", async () => {
    const { call } = await run(answer(), {
      ...REQUEST,
      messages: [
        { role: "user", content: "q" },
        {
          role: "assistant",
          content: "",
          toolCalls: [
            { id: "toolu_a", name: "search_videos", input: {} },
            { id: "toolu_b", name: "search_videos", input: {} },
          ],
        },
        { role: "tool", toolCallId: "toolu_a", name: "search_videos", content: "<untrusted_data>A</untrusted_data>" },
        { role: "tool", toolCallId: "toolu_b", name: "search_videos", content: "<untrusted_data>B</untrusted_data>" },
      ],
    });
    const messages = call.body["messages"] as { role: string; content: unknown }[];
    expect(messages).toHaveLength(3);
    expect(messages[2]).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "toolu_a", content: "<untrusted_data>A</untrusted_data>" },
        { type: "tool_result", tool_use_id: "toolu_b", content: "<untrusted_data>B</untrusted_data>" },
      ],
    });
  });

  it("never puts the key in the body", async () => {
    const { call } = await run(answer());
    expect(JSON.stringify(call.body)).not.toContain(RAW_SECRET);
  });
});

describe("AnthropicProvider: tool calls in the stream", () => {
  it("assembles input_json_delta chunks into one tool_call after the block stops, then stops with tool_use", async () => {
    const { events } = await run(toolUse as SseEvent[]);
    expect(events.filter((e) => e.type === "tool_call")).toEqual([
      { type: "tool_call", id: "toolu_synthetic_1", name: "search_videos", input: { query: "escalada deportiva", kind: "video" } },
    ]);
    expect(events.map((e) => (e.type === "text" ? e.delta : "")).join("")).toBe("Let me look that up.");
    expect(events.at(-1)).toEqual({ type: "stop", reason: "tool_use" });
    expect(events.at(-2)).toMatchObject({ type: "usage", inputTokens: 210, outputTokens: 31 });
    // The call comes after the text that preceded it.
    expect(events.findIndex((e) => e.type === "tool_call")).toBeGreaterThan(events.findIndex((e) => e.type === "text"));
  });

  it("reads a tool_use block with no input chunks as an empty object", async () => {
    const { events } = await run(noInput as SseEvent[]);
    expect(events.filter((e) => e.type === "tool_call")).toEqual([
      { type: "tool_call", id: "toolu_synthetic_1", name: "search_videos", input: {} },
    ]);
  });

  it("reports input that is not valid JSON as bad_request, with no tool_call and no stop", async () => {
    const { events } = await run(badJson as SseEvent[]);
    expect(events.some((e) => e.type === "tool_call")).toBe(false);
    expect(events.at(-1)).toEqual({ type: "error", code: "bad_request" });
    expect(events.some((e) => e.type === "stop")).toBe(false);
  });

  it("reports input that is valid JSON but not an object as bad_request", async () => {
    const stream = (toolUse as SseEvent[]).map((e) =>
      e.event === "content_block_delta" && JSON.stringify(e.data).includes("input_json_delta")
        ? { event: e.event, data: { ...(e.data as object), delta: { type: "input_json_delta", partial_json: "" } } }
        : e,
    );
    // Replace the chunks with a single array literal.
    const firstDelta = stream.findIndex((e) => JSON.stringify(e.data).includes("input_json_delta"));
    stream[firstDelta] = {
      event: "content_block_delta",
      data: { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "[1,2]" } },
    };
    const { events } = await run(stream);
    expect(events.at(-1)).toEqual({ type: "error", code: "bad_request" });
  });

  it("leaves a normal answer's stop reason as end", async () => {
    const { events } = await run(answer());
    expect(events.at(-1)).toEqual({ type: "stop", reason: "end" });
  });
});
