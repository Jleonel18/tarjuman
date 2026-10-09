import type { Capability, DomainRule } from "@tarjuman/core";
import { CapabilityRegistry, sealSecret } from "@tarjuman/core";
import { describe, expect, it } from "vitest";
import { guardrailCases } from "../src/guardrail-cases";
import { DEFAULT_MOCK_KEY, MockProvider, type MockScript } from "../src/mock-provider";
import { recordFixtures, type RecordDeps } from "../src/record-fixtures";
import { parseProvenance } from "../src/provenance";

// The recorder logic (001 T079): runs every rule case through the real pipeline against a
// provider it is given, and returns what to write. It does no file I/O and builds no provider.

const rule = (overrides: Partial<DomainRule> = {}): DomainRule => ({
  id: "scope.test",
  version: "1.0.0",
  description: "A rule used only by this test.",
  refusalTemplateKey: "refusal.out_of_scope",
  acceptCases: [{ input: "What does ser mean?", locale: "en" }],
  refuseCases: [{ input: "Write me an HTML app", locale: "en" }],
  clarifyCases: [{ input: "Help me with my email", locale: "es" }],
  ...overrides,
});

function capabilityWith(rules: DomainRule[]): CapabilityRegistry {
  const capability: Capability = {
    id: "test-capability",
    version: "1.0.0",
    contractVersion: "1.0.0",
    tools: [],
    permissions: [],
    domainRules: rules,
    promptFragments: {},
    i18n: {},
  };
  const registry = new CapabilityRegistry();
  registry.register(capability);
  return registry;
}

const script = (verdict: string, body: string, inputTokens = 100_000): MockScript => ({
  steps: [
    { type: "text", delta: `${verdict}\n` },
    { type: "text", delta: body },
    { type: "usage", inputTokens, outputTokens: 7 },
    { type: "stop", reason: "end" },
  ],
});

function deps(scripts: MockScript[], rules: DomainRule[] = [rule()], overrides: Partial<RecordDeps> = {}) {
  const provider = new MockProvider({ scripts });
  const all: RecordDeps = {
    provider,
    secret: sealSecret(DEFAULT_MOCK_KEY),
    provenance: {
      providerId: "synthetic",
      modelId: "mock-model",
      runtimeVersion: null,
      isClaude: false,
      label: "Synthetic test run.",
    },
    capabilities: capabilityWith(rules),
    capabilityId: "test-capability",
    rules,
    refusalTemplate: () => "TEMPLATE",
    now: () => new Date("2026-10-09T12:00:00.000Z"),
    ...overrides,
  };
  return { provider, deps: all };
}

const ONE_OF_EACH = [script("ACCEPT", "Ser describes identity."), script("REFUSE", ""), script("CLARIFY", "Which email?")];

describe("guardrailCases", () => {
  it("lists accept, refuse, clarify cases per rule with stable fixture paths", () => {
    const cases = guardrailCases([rule(), rule({ id: "scope.other", clarifyCases: [] })]);
    expect(cases.map((c) => c.fixturePath)).toEqual([
      "scope.test/accept-0.json",
      "scope.test/refuse-0.json",
      "scope.test/clarify-0.json",
      "scope.other/accept-0.json",
      "scope.other/refuse-0.json",
    ]);
  });

  it("takes the mediation language from the case profile, else from the input locale", () => {
    const cases = guardrailCases([
      rule({ refuseCases: [{ input: "x", locale: "en", profile: { mediation: "ar", target: "ja" } }] }),
    ]);
    expect(cases.find((c) => c.kind === "refuse")).toMatchObject({ mediation: "ar", target: "ja" });
    expect(cases.find((c) => c.kind === "clarify")).toMatchObject({ mediation: "es" });
  });
});

describe("recordFixtures", () => {
  it("returns one recording per case with the streamed events kept verbatim", async () => {
    const { deps: d } = deps(ONE_OF_EACH);
    const result = await recordFixtures(d);
    expect(result.recordings.map((r) => r.path)).toEqual([
      "scope.test/accept-0.json",
      "scope.test/refuse-0.json",
      "scope.test/clarify-0.json",
    ]);
    expect(result.recordings[0]?.script).toEqual(ONE_OF_EACH[0]);
    expect(result.recordings[2]?.script).toEqual(ONE_OF_EACH[2]);
  });

  it("makes exactly one provider call per case and never retries", async () => {
    const { deps: d, provider } = deps(ONE_OF_EACH);
    await recordFixtures(d);
    expect(provider.streamCalls).toBe(3);
  });

  it("gives every case a fresh conversation, so no case sees another's history", async () => {
    const { deps: d, provider } = deps(ONE_OF_EACH);
    await recordFixtures(d);
    for (const call of provider.calls) expect(call.messages).toHaveLength(1);
  });

  it("sends the real domain-scope layer, in the case's mediation language", async () => {
    const { deps: d, provider } = deps(ONE_OF_EACH);
    await recordFixtures(d);
    for (const call of provider.calls) expect(call.layers.map((l) => l.id).slice(0, 2)).toEqual(["security", "domain_scope"]);
    expect(provider.calls[2]?.layers.find((l) => l.id === "user_preferences")?.text).toContain("mediation: es");
  });

  it("builds provenance from the draft plus the recording date", async () => {
    const { deps: d } = deps(ONE_OF_EACH);
    const { provenance } = await recordFixtures(d);
    expect(provenance).toEqual({ ...d.provenance, recordedAt: "2026-10-09" });
    expect(() => parseProvenance(JSON.parse(JSON.stringify(provenance)))).not.toThrow();
  });

  it("never puts the key in what it returns", async () => {
    const { deps: d } = deps(ONE_OF_EACH);
    expect(JSON.stringify(await recordFixtures(d))).not.toContain(DEFAULT_MOCK_KEY);
  });

  it("fails without returning anything when the provider errors, naming the case and the code only", async () => {
    const { deps: d } = deps([script("ACCEPT", "ok"), { steps: [{ type: "error", code: "network" }] }, script("CLARIFY", "?")]);
    const failure = await recordFixtures(d).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(message).toContain("scope.test/refuse-0");
    expect(message).toContain("network");
  });
});

describe("recordFixtures: prompt truncation check (Ollama drops the start of an oversized prompt)", () => {
  it("warns when the reported prompt tokens are far below a local estimate", async () => {
    const { deps: d } = deps([script("ACCEPT", "ok", 5), script("REFUSE", "", 100_000), script("CLARIFY", "?", 100_000)]);
    const { warnings } = await recordFixtures(d);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("scope.test/accept-0");
    expect(warnings[0]).toContain("prompt_tokens");
  });

  it("does not warn when the reported tokens are in line with the estimate", async () => {
    const { deps: d } = deps(ONE_OF_EACH);
    expect((await recordFixtures(d)).warnings).toEqual([]);
  });

  it("warns when a response reports no usage, because truncation then cannot be detected", async () => {
    const noUsage: MockScript = { steps: [{ type: "text", delta: "ACCEPT\nok" }, { type: "stop", reason: "end" }] };
    const { deps: d } = deps([noUsage, script("REFUSE", ""), script("CLARIFY", "?")]);
    const { warnings } = await recordFixtures(d);
    expect(warnings.some((w) => w.includes("scope.test/accept-0") && w.includes("usage"))).toBe(true);
  });
});

describe("recordFixtures: hash of the rules and prompt layers", () => {
  it("is stable for the same rules and layers", async () => {
    const a = await recordFixtures(deps(ONE_OF_EACH).deps);
    const b = await recordFixtures(deps(ONE_OF_EACH).deps);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).toBe(b.hash);
  });

  it("changes when a rule changes", async () => {
    const before = await recordFixtures(deps(ONE_OF_EACH).deps);
    const changed = [rule({ description: "A different description of the rule." })];
    const after = await recordFixtures(deps(ONE_OF_EACH, changed).deps);
    expect(after.hash).not.toBe(before.hash);
  });

  it("does not depend on what the model answered", async () => {
    const a = await recordFixtures(deps(ONE_OF_EACH).deps);
    const b = await recordFixtures(
      deps([script("ACCEPT", "something else"), script("REFUSE", "x"), script("CLARIFY", "y")]).deps,
    );
    expect(b.hash).toBe(a.hash);
  });
});
