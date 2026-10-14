import { sealSecret } from "@tarjuman/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_MOCK_KEY, MockProvider, parseFixture, type MockScript } from "../src/mock-provider";
import { runProviderContractSuite, type ContractScenario } from "../src/provider-contract-suite";
import happy from "../fixtures/stream-happy.json";
import networkDrop from "../fixtures/stream-network-drop.json";
import refusal from "../fixtures/stream-refusal.json";

function scriptFor(scenario: ContractScenario): MockScript {
  switch (scenario.kind) {
    case "answer":
      return {
        steps: [
          ...scenario.chunks.map((delta) => ({ type: "text" as const, delta })),
          { type: "usage", inputTokens: scenario.inputTokens, outputTokens: scenario.outputTokens },
          { type: "stop", reason: "end" },
        ],
      };
    case "fail":
      return { steps: [{ type: "error", code: scenario.code }] };
    case "fail-after-text":
      return {
        steps: [
          ...scenario.chunks.map((delta) => ({ type: "text" as const, delta })),
          { type: "error", code: scenario.code },
        ],
      };
    case "slow-answer":
      return {
        steps: [
          ...scenario.chunks.flatMap((delta) => [
            { type: "text" as const, delta },
            { type: "delay" as const, ms: scenario.chunkDelayMs },
          ]),
          { type: "stop", reason: "end" },
        ],
      };
    case "fail-leaking-secret":
      // The mock has no transport to leak from; the real adapter harness supplies the leak.
      return { steps: [{ type: "error", code: "unknown" }] };
    case "tool-call":
      return {
        steps: [
          {
            type: "tool_call",
            id: scenario.call.id,
            name: scenario.call.name,
            input: scenario.call.input,
            ...(scenario.call.continuation !== undefined && { continuation: scenario.call.continuation }),
          },
          { type: "usage", inputTokens: scenario.inputTokens, outputTokens: scenario.outputTokens },
          { type: "stop", reason: "tool_use" },
        ],
      };
    case "tool-call-bad-input":
      // The mock has no wire format to mangle; an adapter reports unparseable input this way.
      return { steps: [{ type: "error", code: "bad_request" }] };
  }
}

runProviderContractSuite("mock provider", () => {
  const provider = new MockProvider();
  return {
    provider,
    secret: sealSecret(DEFAULT_MOCK_KEY),
    rawSecret: DEFAULT_MOCK_KEY,
    modelId: "mock-model",
    prepare(scenario) {
      provider.enqueue(scriptFor(scenario));
      provider.setValidationFailure(scenario.kind === "fail" ? scenario.code : undefined);
    },
    transportCalls: () => provider.streamCalls + provider.validationCalls,
  };
}, { tools: true });

describe("MockProvider", () => {
  const request = { modelId: "mock-model", layers: [], messages: [], maxTokens: 10 };
  const abort = () => new AbortController().signal;

  async function drain(provider: MockProvider, key = DEFAULT_MOCK_KEY) {
    const events = [];
    for await (const event of provider.stream(request, sealSecret(key), abort())) events.push(event);
    return events;
  }

  it("rejects an unknown key without consuming a script", async () => {
    const provider = new MockProvider().enqueue({ steps: [{ type: "stop", reason: "end" }] });
    expect(await drain(provider, "sk-ant-wrong")).toEqual([{ type: "error", code: "invalid_credential" }]);
    expect(await provider.validateCredential(sealSecret("sk-ant-wrong"))).toEqual({
      ok: false,
      code: "invalid_credential",
    });
    expect(await drain(provider)).toEqual([{ type: "stop", reason: "end" }]);
  });

  it("replays queued scripts in order, then falls back to the default", async () => {
    const provider = new MockProvider()
      .enqueue({ steps: [{ type: "text", delta: "first" }, { type: "stop", reason: "end" }] })
      .enqueue({ steps: [{ type: "text", delta: "second" }, { type: "stop", reason: "end" }] });
    expect((await drain(provider))[0]).toEqual({ type: "text", delta: "first" });
    expect((await drain(provider))[0]).toEqual({ type: "text", delta: "second" });
    expect((await drain(provider))[0]).toMatchObject({ type: "text" });
    expect(provider.calls).toHaveLength(3);
  });

  it("records each request so tests can assert on what was sent", async () => {
    const provider = new MockProvider();
    await drain(provider);
    expect(provider.calls[0]).toEqual(request);
  });

  it("replays a scripted tool call with its continuation, then ends the step with tool_use", async () => {
    const provider = new MockProvider().enqueue({
      steps: [
        { type: "tool_call", id: "c1", name: "search_videos", input: { query: "escalada" }, continuation: "sig" },
        { type: "stop", reason: "tool_use" },
      ],
    });
    expect(await drain(provider)).toEqual([
      { type: "tool_call", id: "c1", name: "search_videos", input: { query: "escalada" }, continuation: "sig" },
      { type: "stop", reason: "tool_use" },
    ]);
  });

  it("records the tool-loop messages of every request it receives", async () => {
    const provider = new MockProvider();
    const call = { id: "c1", name: "search_videos", input: { query: "q" }, continuation: "sig" };
    const followUp = {
      ...request,
      messages: [
        { role: "user" as const, content: "videos" },
        { role: "assistant" as const, content: "", toolCalls: [call] },
        { role: "tool" as const, toolCallId: "c1", name: "search_videos", content: "[results]" },
      ],
    };
    for await (const event of provider.stream(followUp, sealSecret(DEFAULT_MOCK_KEY), abort())) void event;
    expect(provider.calls[0]?.messages).toEqual(followUp.messages);
  });

  it("offers one model that supports tools and one that does not", () => {
    const byId = Object.fromEntries(new MockProvider().listModels().map((m) => [m.id, m.supportsTools]));
    expect(byId).toEqual({ "mock-model": true, "mock-model-no-pricing": false });
  });

  it("loads the shipped JSON fixtures", () => {
    for (const fixture of [happy, networkDrop, refusal]) {
      expect(parseFixture(fixture).steps.length).toBeGreaterThan(0);
    }
    expect(parseFixture(networkDrop).steps.at(-1)).toMatchObject({ type: "error", code: "network" });
    expect(parseFixture(refusal).steps.at(-1)).toMatchObject({ type: "stop", reason: "refusal" });
  });

  it("rejects malformed fixtures with a clear message", () => {
    expect(() => parseFixture({})).toThrow("steps");
    expect(() => parseFixture({ steps: [{ type: "text" }] })).toThrow("delta");
    expect(() => parseFixture({ steps: [{ type: "nope" }] })).toThrow("unknown type");
  });

  it("parses tool_call steps and rejects malformed ones", () => {
    const step = { type: "tool_call", id: "c1", name: "search_videos", input: { query: "q" }, continuation: "sig" };
    expect(parseFixture({ steps: [step] }).steps).toEqual([step]);
    expect(parseFixture({ steps: [{ type: "tool_call", id: "c1", name: "n", input: null }] }).steps).toHaveLength(1);
    expect(() => parseFixture({ steps: [{ type: "tool_call", name: "n", input: {} }] })).toThrow("id");
    expect(() => parseFixture({ steps: [{ type: "tool_call", id: "c1", input: {} }] })).toThrow("name");
    expect(() => parseFixture({ steps: [{ type: "tool_call", id: "c1", name: "n" }] })).toThrow("input");
    expect(() => parseFixture({ steps: [{ type: "tool_call", id: "c1", name: "n", input: {}, continuation: 3 }] })).toThrow(
      "continuation",
    );
  });
});
