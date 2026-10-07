import { sealSecret } from "@tarjuman/core";
import { runProviderContractSuite, type ContractScenario } from "@tarjuman/testing";
import { OllamaProvider } from "../src/ollama-provider";
import { answerChunks, FakeOllama, modelsReply, textOnlyChunks, type Reply } from "./helpers/fake-ollama";

// Ollama takes no key. The handle still carries a recognizable value so the suite can prove it
// never reaches an event, an error, or the wire (FR-016, SC-004).
const RAW_SECRET = "ollama-SYNTHETIC-SECRET-FOR-CONTRACT-TESTS-0001";

const STATUS_BY_CODE: Partial<Record<string, number>> = {
  bad_request: 400,
  rate_limited: 429,
  overloaded: 503,
};

function replyFor(scenario: ContractScenario, isValidation: boolean): Reply {
  if (isValidation && scenario.kind === "answer") return modelsReply();
  switch (scenario.kind) {
    case "answer":
      return { kind: "sse", chunks: answerChunks(scenario.chunks, scenario.inputTokens, scenario.outputTokens) };
    case "fail": {
      const status = STATUS_BY_CODE[scenario.code];
      // `network` is a browser `TypeError`: the runtime is not reachable.
      if (status === undefined) return { kind: "reject", error: new TypeError("Failed to fetch") };
      return { kind: "json", status, body: { error: { message: "synthetic failure" } } };
    }
    case "fail-after-text":
      return { kind: "sse", chunks: textOnlyChunks(scenario.chunks), errorAfterChunks: true };
    case "slow-answer":
      return { kind: "sse", chunks: answerChunks(scenario.chunks, 1, 1), chunkDelayMs: scenario.chunkDelayMs };
    case "fail-leaking-secret":
      return { kind: "reject", error: new Error(`socket hang up (authorization: Bearer ${RAW_SECRET})`) };
  }
}

function makeHarness() {
  const fake = new FakeOllama();
  const pending: ContractScenario[] = [];
  // Validation is `GET /v1/models` and a stream is `POST /v1/chat/completions`. The suite prepares
  // one scenario for either, so the reply shape is chosen when the request arrives.
  const fetchForScenario = (input: unknown, init?: RequestInit) => {
    const scenario = pending.shift();
    if (!scenario) throw new Error("no scenario prepared");
    fake.enqueue(replyFor(scenario, (init?.method ?? "GET") === "GET"));
    return fake.fetch(input, init);
  };
  return {
    provider: new OllamaProvider({ fetch: fetchForScenario }),
    secret: sealSecret(RAW_SECRET),
    rawSecret: RAW_SECRET,
    modelId: "gemma3:4b",
    prepare(scenario: ContractScenario) {
      pending.push(scenario);
    },
    transportCalls: () => fake.calls.length,
  };
}

// Ollama has no credential, so it can never answer `invalid_credential`, `permission_denied`, or
// `quota_exhausted`; the suite skips the bad-key check when `invalid_credential` is not listed.
runProviderContractSuite("Ollama adapter (synthetic fixtures)", () => makeHarness(), {
  errorCodes: ["network", "bad_request", "rate_limited", "overloaded"],
});
