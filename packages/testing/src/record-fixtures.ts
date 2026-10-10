import type { CapabilityRegistry, DomainRule, ModelRequest, ProviderPort, RefusalTemplates, SecretHandle } from "@tarjuman/core";
import { guardrailCases } from "./guardrail-cases";
import { runGuardrailCase } from "./guardrail-harness";
import type { MockScript } from "./mock-provider";
import { sha256Hex, stableStringify } from "./hash";
import { FixtureProvenance, FixtureProvenanceDraft } from "./provenance";

/**
 * The recorder logic (001 T079; specs/002-free-dev-provider/contracts/fixture-provenance.md).
 * It receives a provider and returns what to write; it builds no provider and does no file I/O,
 * so the same code is tested against the mock and run against Ollama or Claude.
 */
export interface RecordDeps {
  provider: ProviderPort;
  secret: SecretHandle;
  /** Who is answering. `modelId` is also the model the learner profile asks for. */
  provenance: FixtureProvenanceDraft;
  capabilities: CapabilityRegistry;
  capabilityId: string;
  /** Every rule whose cases are recorded: the core's and the capability's. */
  rules: readonly DomainRule[];
  refusalTemplate: RefusalTemplates;
  now?: () => Date;
}

export interface Recording {
  /** Relative to `packages/testing/fixtures/guardrails/`. */
  path: string;
  script: MockScript;
}

export interface RecordResult {
  recordings: Recording[];
  provenance: FixtureProvenance;
  /** Hash of the rules and the prompt layers the recordings were made against (`.recorded-hash`). */
  hash: string;
  warnings: string[];
}

/** A reported prompt below this share of the local estimate is treated as a truncated prompt. */
const TRUNCATION_RATIO = 0.5;
const CHARS_PER_TOKEN = 4;
/** Layers that do not depend on the learner; the rest would make the hash change per profile. */
const HASHED_LAYERS = new Set(["security", "domain_scope", "capability"]);

/**
 * Records every case in order, one provider call each, no retries. All-or-nothing: if any case
 * fails, nothing is returned, so a half-recorded set can never replace a good one. A failure
 * names the case and the error code, never the content.
 */
export async function recordFixtures(deps: RecordDeps): Promise<RecordResult> {
  const draft = FixtureProvenanceDraft.parse(deps.provenance);
  const recordings: Recording[] = [];
  const requests: ModelRequest[] = [];
  const warnings: string[] = [];

  for (const c of guardrailCases(deps.rules)) {
    const run = await runGuardrailCase(c, {
      provider: deps.provider,
      secret: deps.secret,
      modelId: draft.modelId,
      capabilities: deps.capabilities,
      capabilityId: deps.capabilityId,
      refusalTemplate: deps.refusalTemplate,
    });
    const failed = run.events.find((e) => e.type === "error");
    if (failed?.type === "error") {
      throw new Error(`Recording failed at ${c.fixturePath.replace(/\.json$/, "")}: provider error "${failed.code}".`);
    }
    if (run.request) {
      requests.push(run.request);
      const warning = truncationWarning(c.fixturePath.replace(/\.json$/, ""), run.request, run.steps);
      if (warning) warnings.push(warning);
    }
    recordings.push({ path: c.fixturePath, script: { steps: run.steps } });
  }

  const recordedAt = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);
  return {
    recordings,
    provenance: FixtureProvenance.parse({ ...draft, recordedAt }),
    hash: await recordedHash(deps.rules, requests),
    warnings,
  };
}

/**
 * Ollama silently drops the START of a prompt larger than its context, and that is where the
 * security layer sits (002 research, Verification Results). The reported `prompt_tokens` is the
 * only sign, so compare it with a rough local estimate.
 */
export function truncationWarning(label: string, request: ModelRequest, steps: MockScript["steps"]): string | undefined {
  const usage = steps.find((s) => s.type === "usage");
  if (usage?.type !== "usage") {
    return `${label}: the response reported no usage, so prompt truncation cannot be checked.`;
  }
  const chars =
    request.layers.reduce((n, l) => n + l.text.length, 0) + request.messages.reduce((n, m) => n + m.content.length, 0);
  const estimate = Math.round(chars / CHARS_PER_TOKEN);
  if (usage.inputTokens < estimate * TRUNCATION_RATIO) {
    return `${label}: prompt_tokens ${usage.inputTokens} is far below the local estimate ${estimate}; the start of the prompt (the security layer) may have been dropped. Set OLLAMA_CONTEXT_LENGTH=32768.`;
  }
  return undefined;
}

/**
 * SHA-256 over the rules (sorted by id, keys sorted) and the distinct learner-independent prompt
 * layers the recorded requests carried. Nothing the model answered goes in, so re-running the
 * checker with any provider gives the same hash for the same rules and prompts.
 */
export async function recordedHash(rules: readonly DomainRule[], requests: readonly ModelRequest[]): Promise<string> {
  const layers = new Set<string>();
  for (const request of requests) {
    layers.add(
      JSON.stringify(request.layers.filter((l) => HASHED_LAYERS.has(l.id)).map((l) => [l.id, l.text])),
    );
  }
  const canonical = stableStringify({
    rules: [...rules].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    layers: [...layers].sort(),
  });
  return sha256Hex(canonical);
}
