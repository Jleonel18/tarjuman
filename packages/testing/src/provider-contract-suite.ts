import type { ProviderErrorCode, ProviderPort, SecretHandle, StreamEvent, ToolCallRecord } from "@tarjuman/core";
import { describe, expect, it } from "vitest";

/**
 * What a provider implementation must do (contracts/provider-port.md), expressed once and run
 * against every adapter: the mock provider and, with recorded fixtures, the Anthropic adapter.
 *
 * Each adapter supplies a harness that can put its transport into a named scenario. The suite
 * itself never knows how (queued script, stubbed `fetch`, recorded response).
 */

export type ContractScenario =
  /** A normal answer: text chunks, then usage, then a clean stop. */
  | { kind: "answer"; chunks: string[]; inputTokens: number; outputTokens: number }
  /** The provider rejects the request before streaming. */
  | { kind: "fail"; code: ProviderErrorCode }
  /** Some text streams, then the connection fails. */
  | { kind: "fail-after-text"; code: ProviderErrorCode; chunks: string[] }
  /** Streams slowly so the caller can abort; resolves `started` after the first chunk. */
  | { kind: "slow-answer"; chunks: string[]; chunkDelayMs: number }
  /** Fails with a transport error whose raw message contains the secret. */
  | { kind: "fail-leaking-secret" }
  /** The model answers with one complete tool call and ends the step to wait for its result (005). */
  | { kind: "tool-call"; call: ToolCallRecord; inputTokens: number; outputTokens: number }
  /** The model starts a tool call whose input never parses as JSON (005). */
  | { kind: "tool-call-bad-input" };

export interface ProviderHarness {
  provider: ProviderPort;
  secret: SecretHandle;
  /** The raw secret, used only to assert it never escapes. */
  rawSecret: string;
  /** Puts the next `stream()` / `validateCredential()` call into this scenario. */
  prepare(scenario: ContractScenario): void;
  /** How many requests reached the transport since the harness was created. */
  transportCalls(): number;
  /** A valid model id the provider accepts. */
  modelId: string;
}

export interface ContractSuiteOptions {
  /** Error codes this adapter can produce for `fail` scenarios. Defaults to the full set. */
  errorCodes?: ProviderErrorCode[];
  /**
   * The adapter maps tool calls (some model reports `supportsTools: true`): also run the tool-call
   * cases of contracts/provider-tool-calls.md. Adapters without tools leave it off.
   */
  tools?: boolean;
}

const ALL_CODES: ProviderErrorCode[] = [
  "invalid_credential",
  "permission_denied",
  "quota_exhausted",
  "rate_limited",
  "overloaded",
  "network",
  "bad_request",
];

async function collect(iterable: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

const SEARCH_TOOL = {
  name: "search_videos",
  description: "Search for videos.",
  inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
};

const SEARCH_CALL: ToolCallRecord = {
  id: "call_1",
  name: "search_videos",
  input: { query: "escalada" },
  continuation: "opaque-continuation",
};

function request(modelId: string) {
  return {
    modelId,
    layers: [{ id: "security" as const, text: "You are a language mediator." }],
    messages: [{ role: "user" as const, content: "What is the difference between ser and estar?" }],
    maxTokens: 256,
  };
}

export function runProviderContractSuite(
  name: string,
  makeHarness: () => ProviderHarness | Promise<ProviderHarness>,
  options: ContractSuiteOptions = {},
): void {
  const codes = options.errorCodes ?? ALL_CODES;

  describe(`ProviderPort contract: ${name}`, () => {
    it("streams text, then usage, then exactly one stop, in that order", async () => {
      const h = await makeHarness();
      h.prepare({ kind: "answer", chunks: ["Hola ", "mundo"], inputTokens: 12, outputTokens: 7 });
      const events = await collect(h.provider.stream(request(h.modelId), h.secret, new AbortController().signal));

      const types = events.map((e) => e.type);
      expect(types.at(-1)).toBe("stop");
      expect(types.filter((t) => t === "stop")).toHaveLength(1);
      expect(types.filter((t) => t === "usage")).toHaveLength(1);
      expect(types.indexOf("usage")).toBeGreaterThan(types.lastIndexOf("text"));

      const text = events.flatMap((e) => (e.type === "text" ? [e.delta] : [])).join("");
      expect(text).toBe("Hola mundo");
      expect(events.find((e) => e.type === "stop")).toMatchObject({ reason: "end" });
    });

    it("reports provider usage exactly as given, without adjusting it", async () => {
      const h = await makeHarness();
      h.prepare({ kind: "answer", chunks: ["x"], inputTokens: 1234, outputTokens: 56 });
      const events = await collect(h.provider.stream(request(h.modelId), h.secret, new AbortController().signal));
      expect(events.find((e) => e.type === "usage")).toMatchObject({ inputTokens: 1234, outputTokens: 56 });
    });

    it("stops promptly on abort, keeping the text streamed so far", async () => {
      const h = await makeHarness();
      h.prepare({ kind: "slow-answer", chunks: ["one ", "two ", "three ", "four "], chunkDelayMs: 40 });
      const controller = new AbortController();
      const events: StreamEvent[] = [];
      for await (const event of h.provider.stream(request(h.modelId), h.secret, controller.signal)) {
        events.push(event);
        if (event.type === "text" && events.filter((e) => e.type === "text").length === 1) controller.abort();
      }
      const text = events.flatMap((e) => (e.type === "text" ? [e.delta] : [])).join("");
      expect(text.startsWith("one ")).toBe(true);
      expect(text).not.toContain("four ");
      expect(events.at(-1)).toMatchObject({ type: "stop", reason: "aborted" });
    });

    for (const code of codes) {
      it(`maps a provider failure to the "${code}" error code`, async () => {
        const h = await makeHarness();
        h.prepare({ kind: "fail", code });
        const events = await collect(h.provider.stream(request(h.modelId), h.secret, new AbortController().signal));
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ type: "error", code });
      });
    }

    it("surfaces an error after partial text instead of throwing", async () => {
      const h = await makeHarness();
      h.prepare({ kind: "fail-after-text", code: "network", chunks: ["Ser describes "] });
      const events = await collect(h.provider.stream(request(h.modelId), h.secret, new AbortController().signal));
      expect(events[0]).toMatchObject({ type: "text", delta: "Ser describes " });
      expect(events.at(-1)).toMatchObject({ type: "error", code: "network" });
    });

    it("never retries on its own: one failing call reaches the transport once", async () => {
      const h = await makeHarness();
      const before = h.transportCalls();
      h.prepare({ kind: "fail", code: "overloaded" });
      await collect(h.provider.stream(request(h.modelId), h.secret, new AbortController().signal));
      expect(h.transportCalls() - before).toBe(1);
    });

    it("never lets the secret escape through events or errors", async () => {
      const h = await makeHarness();
      h.prepare({ kind: "fail-leaking-secret" });
      let thrown = "";
      let events: StreamEvent[] = [];
      try {
        events = await collect(h.provider.stream(request(h.modelId), h.secret, new AbortController().signal));
      } catch (error) {
        thrown = error instanceof Error ? `${error.name} ${error.message} ${error.stack ?? ""}` : String(error);
      }
      expect(JSON.stringify(events)).not.toContain(h.rawSecret);
      expect(thrown).not.toContain(h.rawSecret);
    });

    it("lists models with the fields the stats panel needs", async () => {
      const h = await makeHarness();
      const models = h.provider.listModels();
      expect(models.length).toBeGreaterThan(0);
      for (const model of models) {
        expect(model.contextWindow).toBeGreaterThan(0);
        expect(model.id.length).toBeGreaterThan(0);
        if (!model.supportsEffort) expect(model.effortLevels).toEqual([]);
      }
    });

    it("declares supportsTools on every model", async () => {
      const h = await makeHarness();
      for (const model of h.provider.listModels()) expect(typeof model.supportsTools).toBe("boolean");
      if (options.tools) expect(h.provider.listModels().some((model) => model.supportsTools)).toBe(true);
    });

    if (options.tools) {
      it("emits one complete tool_call before usage, then stops with tool_use", async () => {
        const h = await makeHarness();
        h.prepare({ kind: "tool-call", call: SEARCH_CALL, inputTokens: 40, outputTokens: 9 });
        const events = await collect(
          h.provider.stream({ ...request(h.modelId), tools: [SEARCH_TOOL] }, h.secret, new AbortController().signal),
        );
        const calls = events.filter((e) => e.type === "tool_call");
        expect(calls).toEqual([{ type: "tool_call", ...SEARCH_CALL }]);
        const types = events.map((e) => e.type);
        expect(types.indexOf("tool_call")).toBeLessThan(types.indexOf("stop"));
        expect(events.at(-1)).toEqual({ type: "stop", reason: "tool_use" });
        expect(events.find((e) => e.type === "usage")).toMatchObject({ inputTokens: 40, outputTokens: 9 });
      });

      it("accepts the follow-up step that carries the call and its result", async () => {
        const h = await makeHarness();
        h.prepare({ kind: "answer", chunks: ["ACCEPT\nHere you go."], inputTokens: 80, outputTokens: 5 });
        const events = await collect(
          h.provider.stream(
            {
              ...request(h.modelId),
              messages: [
                { role: "user", content: "videos about climbing" },
                { role: "assistant", content: "", toolCalls: [SEARCH_CALL] },
                { role: "tool", toolCallId: SEARCH_CALL.id, name: SEARCH_CALL.name, content: "[results]" },
              ],
              tools: [SEARCH_TOOL],
            },
            h.secret,
            new AbortController().signal,
          ),
        );
        expect(events.some((e) => e.type === "error")).toBe(false);
        expect(events.at(-1)).toEqual({ type: "stop", reason: "end" });
      });

      it("reports tool input that is not valid JSON as bad_request, with no tool_call", async () => {
        const h = await makeHarness();
        h.prepare({ kind: "tool-call-bad-input" });
        const events = await collect(
          h.provider.stream({ ...request(h.modelId), tools: [SEARCH_TOOL] }, h.secret, new AbortController().signal),
        );
        expect(events.some((e) => e.type === "tool_call")).toBe(false);
        expect(events.at(-1)).toMatchObject({ type: "error", code: "bad_request" });
      });
    }

    it("validates a good key as ok", async () => {
      const h = await makeHarness();
      h.prepare({ kind: "answer", chunks: ["ok"], inputTokens: 1, outputTokens: 1 });
      expect(await h.provider.validateCredential(h.secret)).toEqual({ ok: true });
    });

    // A keyless runtime (Ollama) can never answer `invalid_credential`, so it does not list it.
    if (codes.includes("invalid_credential")) {
      it("validates a bad key with a typed code", async () => {
        const h = await makeHarness();
        h.prepare({ kind: "fail", code: "invalid_credential" });
        expect(await h.provider.validateCredential(h.secret)).toEqual({ ok: false, code: "invalid_credential" });
      });
    }
  });
}
