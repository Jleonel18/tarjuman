import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { recordFixtures } from "@tarjuman/testing";
import {
  CAPABILITY_ID,
  GUARDRAIL_FIXTURES,
  capabilityRegistry,
  loadRuleFiles,
  refusalTemplate,
} from "../tests/support/guardrail-setup";
import { selectLiveProvider } from "../tests/support/live-provider";

/**
 * `pnpm record:guardrails`: records one response per guardrail case against a live model
 * (Ollama by default; `TARJUMAN_PROVIDER=anthropic` with `node --env-file=.env` for Claude) and
 * replaces the committed fixtures. All-or-nothing: if any case fails, the old fixtures stay.
 * It prints results only, never the environment, a key, or a request header.
 */
const selection = await selectLiveProvider();
console.info(selection.provenance.label);
console.info("Recording; this makes one model call per case and does not retry.");

const rules = loadRuleFiles();
const result = await recordFixtures({
  provider: selection.provider,
  secret: selection.secret,
  provenance: selection.provenance,
  capabilities: capabilityRegistry(),
  capabilityId: CAPABILITY_ID,
  rules,
  refusalTemplate,
});

// Replace the old set only now that every case succeeded.
mkdirSync(GUARDRAIL_FIXTURES, { recursive: true });
for (const name of readdirSync(GUARDRAIL_FIXTURES, { withFileTypes: true })) {
  rmSync(join(GUARDRAIL_FIXTURES, name.name), { recursive: true, force: true });
}
const write = (relative: string, content: string) => {
  const path = join(GUARDRAIL_FIXTURES, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};
for (const recording of result.recordings) write(recording.path, `${JSON.stringify(recording.script, null, 2)}\n`);
write("provenance.json", `${JSON.stringify(result.provenance, null, 2)}\n`);
write(".recorded-hash", `${result.hash}\n`);

for (const warning of result.warnings) console.warn(`warning: ${warning}`);
console.info(`Recorded ${result.recordings.length} cases into packages/testing/fixtures/guardrails/.`);
if (!result.provenance.isClaude) console.info("001 SC-003: unverified (no Claude run)");
