import { sealSecret } from "@tarjuman/core";
import { runProviderContractSuite, type ContractScenario } from "@tarjuman/testing";
import { GeminiProvider } from "../src/gemini-provider";
import { answerChunks, errorReply, FakeGemini, modelReply, textOnlyChunks, type ErrorCase, type Reply } from "./helpers/fake-gemini";

// Synthetic, obviously fake auth key (004 research R2): never a real credential.
const RAW_SECRET = "AQ.FAKEgeminiCONTRACTsuiteSECRETfakeFAKE_-fakeFAKE0001";

const ERROR_CASE_BY_CODE: Partial<Record<string, ErrorCase>> = {
  invalid_credential: "api_key_invalid",
  permission_denied: "permission_denied",
  rate_limited: "rate_limited_no_delay",
  overloaded: "unavailable",
  bad_request: "bad_request",
};

function replyFor(scenario: ContractScenario, isValidation: boolean): Reply {
  if (isValidation && scenario.kind === "answer") return modelReply();
  switch (scenario.kind) {
    case "answer":
      return { kind: "sse", chunks: answerChunks(scenario.chunks, scenario.inputTokens, scenario.outputTokens) };
    case "fail": {
      const name = ERROR_CASE_BY_CODE[scenario.code];
      // `network` is a browser `TypeError`: the endpoint is not reachable.
      if (name === undefined) return { kind: "reject", error: new TypeError("Failed to fetch") };
      return errorReply(name);
    }
    case "fail-after-text":
      return { kind: "sse", chunks: textOnlyChunks(scenario.chunks), errorAfterChunks: true };
    case "slow-answer":
      return { kind: "sse", chunks: answerChunks(scenario.chunks, 1, 1), chunkDelayMs: scenario.chunkDelayMs };
    case "fail-leaking-secret":
      return { kind: "reject", error: new Error(`socket hang up (x-goog-api-key: ${RAW_SECRET})`) };
    case "tool-call":
    case "tool-call-bad-input":
      // Wired with the Gemini tool mapping; the suite runs these only when the adapter passes `tools: true`.
      throw new Error("tool scenarios are not wired for this harness yet");
  }
}

function makeHarness() {
  const fake = new FakeGemini();
  const pending: ContractScenario[] = [];
  // Validation is a `GET` of the default model and a stream is a `POST`. The suite prepares one
  // scenario for either, so the reply shape is chosen when the request arrives.
  const fetchForScenario = (input: unknown, init?: RequestInit) => {
    const scenario = pending.shift();
    if (!scenario) throw new Error("no scenario prepared");
    fake.enqueue(replyFor(scenario, (init?.method ?? "GET") === "GET"));
    return fake.fetch(input, init);
  };
  return {
    provider: new GeminiProvider({ fetch: fetchForScenario }),
    secret: sealSecret(RAW_SECRET),
    rawSecret: RAW_SECRET,
    modelId: "gemini-3.5-flash-lite",
    prepare(scenario: ContractScenario) {
      pending.push(scenario);
    },
    transportCalls: () => fake.calls.length,
  };
}

// Gemini's 429 does not say whether a rate or a quota ran out, so it never answers
// `quota_exhausted` (004 research R6).
runProviderContractSuite("Gemini adapter (synthetic fixtures)", () => makeHarness(), {
  errorCodes: ["invalid_credential", "permission_denied", "rate_limited", "overloaded", "network", "bad_request"],
});
