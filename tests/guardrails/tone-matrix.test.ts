import { existsSync } from "node:fs";
import { join } from "node:path";
import { TONE_PRESETS, sealSecret } from "@tarjuman/core";
import {
  ADVERSARIAL_TONES,
  guardrailCases,
  runGuardrailCase,
  runStructural,
  structuralCases,
  type GuardrailRun,
  type StructuralReport,
} from "@tarjuman/testing";
import { DEFAULT_MOCK_KEY, MockProvider, parseFixture } from "@tarjuman/testing/mock-provider";
import { beforeAll, describe, expect, it } from "vitest";
import { loadAdversarialCases } from "../support/adversarial-cases";
import {
  CAPABILITY_ID,
  GUARDRAIL_FIXTURES,
  capabilityRegistry,
  loadRuleFiles,
  readJson,
  refusalTemplate,
} from "../support/guardrail-setup";

// Tone changes presentation only (FR-030, SC-004). The guardrail suite (recorded responses) and the
// structural adversarial suite run once per tone and must agree on everything except the tone layer.
// Recorded responses are tone-independent by construction: this proves the app side of the claim,
// that the tone never alters the scope rules, the verdicts, the statuses or the safety results.
// Whether a live model keeps to its scope under each tone is reported by the live suites (T124).

const TONES = TONE_PRESETS.map((p) => p.id);
const rules = loadRuleFiles();
const cases = guardrailCases(rules);

async function replay(c: (typeof cases)[number], toneId: string): Promise<GuardrailRun> {
  const path = join(GUARDRAIL_FIXTURES, c.fixturePath);
  if (!existsSync(path)) throw new Error(`Recorded response missing: ${path}; run \`pnpm record:guardrails\`.`);
  return runGuardrailCase(
    { ...c, toneId },
    {
      provider: new MockProvider({ scripts: [parseFixture(readJson(path))] }),
      secret: sealSecret(DEFAULT_MOCK_KEY),
      modelId: "mock-model",
      capabilities: capabilityRegistry(),
      capabilityId: CAPABILITY_ID,
      refusalTemplate,
    },
  );
}

/** Everything a run shows or sends, with the tone layer taken out. */
function outcome(run: GuardrailRun) {
  return {
    verdict: run.verdict,
    ruleIds: run.ruleIds,
    status: run.status,
    text: run.text,
    layers: run.request?.layers.filter((l) => l.id !== "tone"),
    messages: run.request?.messages,
  };
}

describe("tone matrix: guardrail suite", () => {
  const byTone = new Map<string, GuardrailRun[]>();

  beforeAll(async () => {
    for (const tone of TONES) byTone.set(tone, await Promise.all(cases.map((c) => replay(c, tone))));
  });

  it("covers all three tones", () => {
    expect(TONES).toEqual(["warm", "neutral", "formal"]);
    expect(cases.length).toBeGreaterThan(0);
  });

  it("sends each tone's own guidance in the tone layer", () => {
    for (const preset of TONE_PRESETS) {
      for (const run of byTone.get(preset.id) ?? []) {
        expect(run.request?.layers.find((l) => l.id === "tone")?.text).toBe(preset.guidance);
      }
    }
  });

  it("gives identical verdicts, statuses, refusals, scope layers and messages under every tone", () => {
    const base = (byTone.get("neutral") ?? []).map(outcome);
    for (const tone of TONES) {
      const own = (byTone.get(tone) ?? []).map(outcome);
      expect(own, `tone ${tone}`).toEqual(base);
    }
  });
});

describe("tone matrix: structural adversarial suite", () => {
  const reports = new Map<string, StructuralReport>();

  beforeAll(async () => {
    const adversarial = loadAdversarialCases();
    for (const tone of ADVERSARIAL_TONES) {
      reports.set(
        tone,
        await runStructural(
          adversarial.map((c) => ({ ...c, tones: [tone] })),
          { capabilities: capabilityRegistry(), capabilityId: CAPABILITY_ID, refusalTemplate },
        ),
      );
    }
  });

  it("runs the same cases and finds nothing under any tone", () => {
    const expectedRuns = structuralCases(loadAdversarialCases()).length * 2;
    for (const tone of ADVERSARIAL_TONES) {
      const report = reports.get(tone);
      expect(report?.runs, tone).toBe(expectedRuns);
      expect(report?.failures, tone).toEqual([]);
    }
  });

  it("gives the same results under every tone", () => {
    const base = reports.get("neutral");
    for (const tone of ADVERSARIAL_TONES) expect(reports.get(tone), tone).toEqual(base);
  });
});
