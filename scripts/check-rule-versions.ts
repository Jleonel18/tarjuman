import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { sealSecret } from "@tarjuman/core";
import { recordFixtures } from "@tarjuman/testing";
import { DEFAULT_MOCK_KEY, MockProvider } from "@tarjuman/testing/mock-provider";
import {
  CAPABILITY_ID,
  GUARDRAIL_FIXTURES,
  ROOT,
  capabilityRegistry,
  loadRuleFiles,
  refusalTemplate,
} from "../tests/support/guardrail-setup";
import { recordedHashProblem, ruleChangeProblem } from "./rule-versions";

/**
 * `pnpm lint:rules` (001 T081). Two checks, both offline:
 *   1. a rule file whose content changed against the base branch must have a bigger `version`;
 *   2. `.recorded-hash` must match the current rules and prompt layers, so the per-PR fixture
 *      gate can never pass on stale recordings.
 * The base branch is `origin/$GITHUB_BASE_REF` in CI and `main` elsewhere. In CI an unreachable
 * base is an error (check out with `fetch-depth: 0`); locally it is a warning.
 */
const RULE_DIRS = ["packages/core/rules", "packages/capabilities/language-qa/rules"];
const problems: string[] = [];

const baseRef = process.env["GITHUB_BASE_REF"] ? `origin/${process.env["GITHUB_BASE_REF"]}` : "main";
const git = (...args: string[]): string =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

function baseReachable(): boolean {
  try {
    git("rev-parse", "--verify", `${baseRef}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

function checkVersions(): void {
  for (const dir of RULE_DIRS) {
    const absolute = join(ROOT, dir);
    if (!existsSync(absolute)) continue;
    for (const name of readdirSync(absolute).filter((n) => n.endsWith(".json")).sort()) {
      const path = relative(ROOT, join(absolute, name));
      const current: unknown = JSON.parse(readFileSync(join(ROOT, path), "utf8"));
      let base: unknown;
      try {
        base = JSON.parse(git("show", `${baseRef}:${path}`));
      } catch {
        base = undefined; // Not on the base branch: a new rule.
      }
      const problem = ruleChangeProblem(base, current);
      if (problem) problems.push(`${path}: ${problem}`);
    }
  }
}

async function checkRecordedHash(): Promise<void> {
  // The hash is made without a model: any provider gives the same layers, so a stub is enough.
  const dry = await recordFixtures({
    provider: new MockProvider(),
    secret: sealSecret(DEFAULT_MOCK_KEY),
    provenance: {
      providerId: "synthetic",
      modelId: "mock-model",
      runtimeVersion: null,
      isClaude: false,
      label: "Dry run for the recorded hash.",
    },
    capabilities: capabilityRegistry(),
    capabilityId: CAPABILITY_ID,
    rules: loadRuleFiles(),
    refusalTemplate,
  });
  const path = join(GUARDRAIL_FIXTURES, ".recorded-hash");
  const problem = recordedHashProblem(existsSync(path) ? readFileSync(path, "utf8") : undefined, dry.hash);
  if (problem) problems.push(problem);
}

const compared = baseReachable();
if (compared) {
  checkVersions();
} else {
  const message = `Base ref "${baseRef}" is not reachable, so rule versions were not compared. In CI, check out with fetch-depth: 0.`;
  if (process.env["CI"]) problems.push(message);
  else console.warn(`warning: ${message}`);
}
await checkRecordedHash();

if (problems.length > 0) {
  console.error(`lint:rules found ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`lint:rules ok (versions ${compared ? `compared with ${baseRef}` : "not compared"}; fixtures match the rules and prompts)`);
