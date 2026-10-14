import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../support/guardrail-setup";

/** T148: the nightly workflow uses the test key without ever putting it in a log. */
const workflow = readFileSync(join(ROOT, ".github/workflows/nightly-live.yml"), "utf8");
const lines = workflow.split("\n").filter((line) => !line.trimStart().startsWith("#"));

describe("nightly live workflow", () => {
  it("runs both live suites against Claude", () => {
    expect(workflow).toContain("run: pnpm test:live:guardrails");
    expect(workflow).toContain("run: pnpm test:live:redteam");
    expect(workflow.match(/TARJUMAN_PROVIDER: anthropic/g)).toHaveLength(2);
  });

  it("never runs on pull requests", () => {
    expect(workflow).not.toMatch(/^\s*pull_request/m);
  });

  it("reads the secret only into a step's environment", () => {
    const uses = lines.filter((line) => line.includes("secrets."));
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) expect(line.trim()).toBe("TARJUMAN_TEST_KEY: ${{ secrets.TARJUMAN_TEST_KEY }}");
  });

  it("never prints the key or the environment", () => {
    const printing = lines.filter((line) => /\b(echo|printf|printenv|env\s*$|set\s+-x|cat)\b/.test(line));
    for (const line of printing) expect(line).not.toMatch(/\$\{?TARJUMAN_TEST_KEY|printenv|set\s+-x|^\s*env\s*$/);
  });
});
