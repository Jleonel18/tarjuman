import { sealSecret } from "@tarjuman/core";
import type { ProviderErrorCode, StreamEvent } from "@tarjuman/core";
import { runProviderContractSuite, type ContractScenario } from "@tarjuman/testing";
import { describe, expect, it } from "vitest";
import { AnthropicProvider } from "../src/anthropic-provider";
import cacheStream from "./fixtures/stream-answer.json";
import overloadedMidway from "./fixtures/stream-overloaded-midway.json";
import { answerEvents, errorReply, FakeAnthropic, messageJson, replyForCode, type SseEvent } from "./helpers/fake-anthropic";

const RAW_SECRET = "sk-ant-api03-SYNTHETIC-KEY-FOR-CONTRACT-TESTS-0001";

function replyFor(scenario: ContractScenario, forValidation: boolean) {
  switch (scenario.kind) {
    case "answer":
      return forValidation
        ? ({ kind: "json", status: 200, body: messageJson() } as const)
        : ({ kind: "sse", events: answerEvents(scenario.chunks, scenario.inputTokens, scenario.outputTokens) } as const);
    case "fail":
      return replyForCode(scenario.code);
    case "fail-after-text":
      return {
        kind: "sse",
        events: answerEvents(scenario.chunks, 1, 1).slice(0, 2 + scenario.chunks.length),
        errorAfterEvents: true,
      } as const;
    case "slow-answer":
      return { kind: "sse", events: answerEvents(scenario.chunks, 1, 1), chunkDelayMs: scenario.chunkDelayMs } as const;
    case "fail-leaking-secret":
      return { kind: "reject", error: new Error(`socket hang up (x-api-key: ${RAW_SECRET})`) } as const;
  }
}

function makeHarness() {
  const fake = new FakeAnthropic();
  const pending: ContractScenario[] = [];
  // A validation call is non-streaming JSON and a stream call is SSE. The suite prepares one
  // scenario for either, so the reply shape is chosen when the request arrives.
  const fetchForScenario = (input: unknown, init?: RequestInit) => {
    const scenario = pending.shift();
    if (!scenario) throw new Error("no scenario prepared");
    const wantsStream = typeof init?.body === "string" && (JSON.parse(init.body) as { stream?: boolean }).stream === true;
    fake.enqueue(replyFor(scenario, !wantsStream));
    return fake.fetch(input, init);
  };
  const provider = new AnthropicProvider({ fetch: fetchForScenario });
  return {
    provider,
    secret: sealSecret(RAW_SECRET),
    rawSecret: RAW_SECRET,
    modelId: "claude-sonnet-5-5",
    prepare(scenario: ContractScenario) {
      pending.push(scenario);
    },
    transportCalls: () => fake.calls.length,
  };
}

runProviderContractSuite("Anthropic adapter (synthetic fixtures)", () => makeHarness());

async function collect(iterable: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

const REQUEST = {
  modelId: "claude-sonnet-5-5",
  layers: [
    { id: "security" as const, text: "SECURITY" },
    { id: "user_preferences" as const, text: "PREFS" },
  ],
  messages: [
    { role: "user" as const, content: "first" },
    { role: "assistant" as const, content: "answer" },
    { role: "user" as const, content: "second" },
  ],
  maxTokens: 300,
  effort: "high" as const,
};

describe("AnthropicProvider: request mapping", () => {
  async function send(request = REQUEST, apiKey = RAW_SECRET) {
    const fake = new FakeAnthropic().enqueue({ kind: "sse", events: answerEvents(["ok"], 1, 1) });
    const provider = new AnthropicProvider({ fetch: fake.fetch });
    await collect(provider.stream(request, sealSecret(apiKey), new AbortController().signal));
    const call = fake.calls[0];
    if (!call) throw new Error("no request reached the transport");
    return call;
  }

  it("sends one streaming request to the Anthropic origin with the key in x-api-key", async () => {
    const call = await send();
    expect(call.url.startsWith("https://api.anthropic.com/")).toBe(true);
    expect(call.headers["x-api-key"]).toBe(RAW_SECRET);
    expect(call.body["stream"]).toBe(true);
    expect(call.body["model"]).toBe("claude-sonnet-5-5");
    expect(call.body["max_tokens"]).toBe(300);
  });

  it("sends the browser opt-in header the CORS spike found necessary", async () => {
    const call = await send();
    expect(call.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
  });

  it("maps layers to system blocks in order and conversation turns to messages", async () => {
    const call = await send();
    expect(JSON.stringify(call.body["system"])).toMatch(/SECURITY[\s\S]*PREFS/);
    expect(call.body["messages"]).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "answer" },
      { role: "user", content: "second" },
    ]);
  });

  it("sends the configured effort inside output_config when the model supports it", async () => {
    const call = await send();
    expect(call.body["output_config"]).toEqual({ effort: "high" });
  });

  it("sends no effort for a model without effort support", async () => {
    const call = await send({ ...REQUEST, modelId: "claude-haiku-4-5" });
    expect(call.body).not.toHaveProperty("output_config");
  });

  it("never sends thinking, budget_tokens, sampling params, prefill, or forced tool_choice", async () => {
    for (const modelId of ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-4-5"]) {
      const call = await send({ ...REQUEST, modelId });
      const wire = JSON.stringify(call.body);
      for (const forbidden of ["thinking", "budget_tokens", "temperature", "top_p", "top_k", "tool_choice"]) {
        expect(wire, `${modelId} ${forbidden}`).not.toContain(forbidden);
      }
      const messages = call.body["messages"] as { role: string }[];
      expect(messages.at(-1)?.role, `${modelId} prefill`).toBe("user");
    }
  });

  it("sends no tools when none are declared", async () => {
    expect((await send()).body).not.toHaveProperty("tools");
  });

  it("does not put the key anywhere in the body", async () => {
    expect(JSON.stringify((await send()).body)).not.toContain(RAW_SECRET);
  });
});

describe("AnthropicProvider: stream mapping (synthetic wire fixtures)", () => {
  it("takes the latest usage values and sums nothing, including cache fields", async () => {
    const fake = new FakeAnthropic().enqueue({ kind: "sse", events: cacheStream as SseEvent[] });
    const provider = new AnthropicProvider({ fetch: fake.fetch });
    const events = await collect(provider.stream(REQUEST, sealSecret(RAW_SECRET), new AbortController().signal));

    expect(events.filter((e) => e.type === "usage")).toEqual([
      { type: "usage", inputTokens: 100, outputTokens: 25, cacheReadTokens: 40, cacheWriteTokens: 5 },
    ]);
    expect(events.flatMap((e) => (e.type === "text" ? [e.delta] : [])).join("")).toBe("Hola, mundo.");
    expect(events.at(-1)).toEqual({ type: "stop", reason: "end" });
  });

  it("maps an SSE error event after a 200 to an error event, not an exception", async () => {
    const fake = new FakeAnthropic().enqueue({ kind: "sse", events: overloadedMidway as SseEvent[] });
    const provider = new AnthropicProvider({ fetch: fake.fetch });
    const events = await collect(provider.stream(REQUEST, sealSecret(RAW_SECRET), new AbortController().signal));
    expect(events[0]).toEqual({ type: "text", delta: "Ser describes " });
    expect(events.at(-1)).toEqual({ type: "error", code: "overloaded" });
  });

  it("maps stop reasons", async () => {
    const cases: [string, string][] = [
      ["end_turn", "end"],
      ["stop_sequence", "end"],
      ["max_tokens", "max_tokens"],
      ["tool_use", "tool_use"],
      ["refusal", "refusal"],
    ];
    for (const [wire, mapped] of cases) {
      const events = answerEvents(["x"], 1, 1).map((e) =>
        e.event === "message_delta"
          ? { ...e, data: { type: "message_delta", delta: { stop_reason: wire }, usage: { output_tokens: 1 } } }
          : e,
      );
      const fake = new FakeAnthropic().enqueue({ kind: "sse", events });
      const provider = new AnthropicProvider({ fetch: fake.fetch });
      const out = await collect(provider.stream(REQUEST, sealSecret(RAW_SECRET), new AbortController().signal));
      expect(out.at(-1), wire).toEqual({ type: "stop", reason: mapped });
    }
  });

  it("reports a stream that ends without a stop as a network error", async () => {
    const truncated = answerEvents(["Hola"], 1, 1).slice(0, 3);
    const fake = new FakeAnthropic().enqueue({ kind: "sse", events: truncated });
    const provider = new AnthropicProvider({ fetch: fake.fetch });
    const out = await collect(provider.stream(REQUEST, sealSecret(RAW_SECRET), new AbortController().signal));
    expect(out.at(-1)).toEqual({ type: "error", code: "network" });
  });

  it("passes retry-after through on a rate limit", async () => {
    const fake = new FakeAnthropic().enqueue(errorReply("rate_limit"));
    const provider = new AnthropicProvider({ fetch: fake.fetch });
    const out = await collect(provider.stream(REQUEST, sealSecret(RAW_SECRET), new AbortController().signal));
    expect(out).toEqual([{ type: "error", code: "rate_limited", retryAfterSeconds: 30 }]);
  });

  it("omits retryAfterSeconds on a spend-cap 429, which has no retry-after", async () => {
    const fake = new FakeAnthropic().enqueue(errorReply("rate_limit_spend_cap"));
    const provider = new AnthropicProvider({ fetch: fake.fetch });
    const out = await collect(provider.stream(REQUEST, sealSecret(RAW_SECRET), new AbortController().signal));
    expect(out).toEqual([{ type: "error", code: "rate_limited" }]);
  });

  it("maps 413 and 500 to the documented codes", async () => {
    const expectations: [Parameters<typeof errorReply>[0], ProviderErrorCode][] = [
      ["too_large", "bad_request"],
      ["api_error", "unknown"],
    ];
    for (const [fixture, code] of expectations) {
      const fake = new FakeAnthropic().enqueue(errorReply(fixture));
      const provider = new AnthropicProvider({ fetch: fake.fetch });
      const out = await collect(provider.stream(REQUEST, sealSecret(RAW_SECRET), new AbortController().signal));
      expect(out, fixture).toEqual([{ type: "error", code }]);
    }
  });
});

describe("AnthropicProvider: model table", () => {
  it("is the only model list, with Sonnet 5.5 first as the default", () => {
    const models = new AnthropicProvider({ fetch: new FakeAnthropic().fetch }).listModels();
    expect(models.map((m) => m.id)).toEqual(["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-4-5"]);
  });
});
