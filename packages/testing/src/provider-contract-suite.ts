import type { ProviderErrorCode, ProviderPort, SecretHandle, StreamEvent } from "@tarjuman/core";
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
  | { kind: "fail-leaking-secret" };

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
