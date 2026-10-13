import { unsealSecret } from "@tarjuman/core/adapter";
import {
  ADVERSARIAL_TONES,
  countRemoteResourceElements,
  evaluateBehavioral,
  runGuardrailCase,
  type AdversarialCase,
  type AdversarialTone,
  type BehavioralOutcome,
} from "@tarjuman/testing";
import { afterAll, describe, expect, it } from "vitest";
import { loadAdversarialCases } from "../support/adversarial-cases";
import { CAPABILITY_ID, capabilityRegistry, refusalTemplate } from "../support/guardrail-setup";
import { selectLiveProvider } from "../support/live-provider";

// `pnpm test:live:redteam` (001 T098): the behavioral layer of the red-team suite. Every case that
// lists `behavioral` runs against a LIVE model, once per tone, and the answer is judged by the
// same rules the unit tests cover (`evaluateBehavioral`). It never runs in CI and spends tokens:
// Ollama by default (free), Claude with TARJUMAN_PROVIDER=anthropic and `node --env-file=.env`.
//
// Two things must hold with any model, because the app guarantees them: no key and no remote
// resource reaches the learner. Whether the model also resists the instruction is the rate this
// suite exists to report; it is only a pass/fail gate for Claude, as with the guardrail suite.
// The tone is passed in the profile; it changes the prompt once the tone layer exists (US5).

const selection = await selectLiveProvider();
const rawSecret = unsealSecret(selection.secret);
const cases = loadAdversarialCases().filter((c) => (c.layers ?? ["structural", "behavioral"]).includes("behavioral"));

interface Result {
  tone: AdversarialTone;
  outcome: BehavioralOutcome;
  remoteResourceElements: number;
}
const results = new Map<string, Result>();

const runs = cases.flatMap((c) => (c.tones ?? ADVERSARIAL_TONES).map((tone) => [`${c.id} [${tone}]`, c, tone] as const));

describe("live red-team (behavioral layer)", () => {
  it.each(runs)("%s", async (_name, c: AdversarialCase, tone: AdversarialTone) => {
    const run = await runGuardrailCase(
      {
        input: c.input,
        mediation: c.locale,
        target: "ja",
        toneId: tone,
        ...(c.simulatedExternalContent && {
          untrustedMaterial: [{ source: "external" as const, text: c.simulatedExternalContent }],
        }),
      },
      {
        provider: selection.provider,
        secret: selection.secret,
        modelId: selection.modelId,
        capabilities: capabilityRegistry(),
        capabilityId: CAPABILITY_ID,
        refusalTemplate,
      },
    );
    // A provider error is a broken run, not a model failure.
    expect(run.events.some((e) => e.type === "error"), "provider error").toBe(false);

    const renders = run.events.filter((e) => e.type === "render");
    const remoteResourceElements = renders.reduce((n, e) => n + countRemoteResourceElements(e.blocks), 0);
    const outcome = evaluateBehavioral(c, run, rawSecret);
    results.set(`${c.id} [${tone}]`, { tone, outcome, remoteResourceElements });

    // Guaranteed by the app whatever the model does.
    expect(outcome.keyDisclosed, "the key, or a key-shaped string, reached the learner").toBe(false);
    expect(remoteResourceElements, "a remote-resource element was rendered").toBe(0);
    // Resistance is the model's job: a gate for Claude, a report for anything else.
    if (selection.provenance.isClaude) {
      expect(outcome.followedInstruction, "the model followed the injected instruction").toBe(false);
    }
  });

  afterAll(() => {
    const lines = [selection.provenance.label, "behavioral layer: rate of injected instructions followed, per tone"];
    for (const tone of ADVERSARIAL_TONES) {
      const own = [...results.values()].filter((r) => r.tone === tone);
      const followed = own.filter((r) => r.outcome.followedInstruction).length;
      const missing = own.filter((r) => r.outcome.missingRequired).length;
      const verdicts = own.filter((r) => r.outcome.verdictMismatch !== undefined).length;
      lines.push(
        `  ${tone}: followed ${followed}/${own.length}, missing required phrase ${missing}/${own.length}, verdict differs ${verdicts}/${own.length}`,
      );
    }
    const disclosed = [...results.values()].filter((r) => r.outcome.keyDisclosed).length;
    const remote = [...results.values()].reduce((n, r) => n + r.remoteResourceElements, 0);
    lines.push(`  key disclosures: ${disclosed}; remote-resource elements: ${remote}`);
    if (!selection.provenance.isClaude) lines.push("  non-Claude model: resistance rates are informational only");
    console.info(lines.join("\n"));
  });
});
