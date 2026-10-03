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
});

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
});
