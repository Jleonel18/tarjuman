import { describe, expect, it } from "vitest";
import type {
  ModelInfo,
  ModelRequest,
  ModelRequestCannotCarrySecret,
  ProviderMessage,
  StreamEvent,
  ToolCallRecord,
} from "../../src/ports/provider";
import { sealSecret } from "../../src/ports/secret-handle";

/**
 * Most of this file is checked by `tsc -b` (pnpm typecheck), not by Vitest: the shapes below must
 * compile. Contract: specs/005-resource-curation/contracts/provider-tool-calls.md.
 */

// The type-level proof for invariant 1 must still hold with the new message shapes.
export type StillCannotCarrySecret = ModelRequestCannotCarrySecret;

const call: ToolCallRecord = {
  id: "call_1",
  name: "search_videos",
  input: { query: "escalada", kind: "video" },
  continuation: "opaque-signature",
};

const callWithoutContinuation: ToolCallRecord = { id: "call_2", name: "show_resources", input: { items: [] } };

describe("tool calls in the provider port types", () => {
  it("lets a stream carry a tool_call, with or without a continuation", () => {
    const events: StreamEvent[] = [
      { type: "tool_call", id: call.id, name: call.name, input: call.input, continuation: "opaque-signature" },
      { type: "tool_call", id: callWithoutContinuation.id, name: callWithoutContinuation.name, input: {} },
      { type: "stop", reason: "tool_use" },
    ];
    const kinds = events.map((event) => event.type);
    expect(kinds).toEqual(["tool_call", "tool_call", "stop"]);
  });

  it("narrows a tool_call event to its fields", () => {
    const event: StreamEvent = { type: "tool_call", id: "c", name: "n", input: { a: 1 }, continuation: "k" };
    if (event.type === "tool_call") {
      const id: string = event.id;
      const name: string = event.name;
      const continuation: string | undefined = event.continuation;
      expect([id, name, continuation]).toEqual(["c", "n", "k"]);
    } else {
      expect.unreachable("expected a tool_call event");
    }
  });

  it("accepts plain, assistant-with-toolCalls, and tool messages in a request", () => {
    const messages: ProviderMessage[] = [
      { role: "user", content: "videos about climbing" },
      { role: "assistant", content: "", toolCalls: [call] },
      { role: "tool", toolCallId: call.id, name: call.name, content: "<untrusted_data>…</untrusted_data>" },
      { role: "assistant", content: "ACCEPT\nHere you go." },
    ];
    const request: ModelRequest = {
      modelId: "mock-model",
      layers: [],
      messages,
      maxTokens: 1000,
      tools: [{ name: "search_videos", description: "Search", inputSchema: { type: "object" } }],
    };
    expect(request.messages.map((message) => message.role)).toEqual(["user", "assistant", "tool", "assistant"]);
  });

  it("tells a message with toolCalls apart from a plain one", () => {
    const message: ProviderMessage = { role: "assistant", content: "", toolCalls: [call] };
    expect("toolCalls" in message ? message.toolCalls.length : 0).toBe(1);
  });

  it("requires supportsTools on every ModelInfo", () => {
    const model: ModelInfo = {
      id: "m",
      displayName: "M",
      contextWindow: 1000,
      maxOutput: 100,
      supportsEffort: false,
      effortLevels: [],
      supportsTools: true,
      pricing: null,
    };
    expect(model.supportsTools).toBe(true);

    // @ts-expect-error supportsTools is required: a table that forgets it must not compile
    const missing: ModelInfo = {
      id: "m",
      displayName: "M",
      contextWindow: 1000,
      maxOutput: 100,
      supportsEffort: false,
      effortLevels: [],
      pricing: null,
    };
    expect(missing.id).toBe("m");
  });

  it("keeps a SecretHandle out of every tool call field", () => {
    const secret = sealSecret("AIzaFAKE-not-a-real-key-000000000000000");
    // @ts-expect-error a SecretHandle is not a JsonValue, so it cannot be a tool input
    const record: ToolCallRecord = { id: "x", name: "y", input: secret };
    // @ts-expect-error a SecretHandle is not a string, so it cannot be a continuation
    const withContinuation: ToolCallRecord = { id: "x", name: "y", input: {}, continuation: secret };
    // @ts-expect-error a tool message carries text only
    const message: ProviderMessage = { role: "tool", toolCallId: "x", name: "y", content: secret };
    expect([record, withContinuation, message]).toHaveLength(3);
  });
});
