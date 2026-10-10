import { describe, expect, it } from "vitest";
import { compareSemver, recordedHashProblem, ruleChangeProblem } from "../../scripts/rule-versions";

// The logic behind `pnpm lint:rules` (001 T081): a changed rule needs a version bump, and the
// recorded guardrail fixtures must still match the rules and prompt layers they were made for.

const rule = (overrides: Record<string, unknown> = {}) => ({
  id: "scope.language-learning-only",
  version: "1.0.0",
  description: "Keeps answers on language learning.",
  refusalTemplateKey: "refusal.out_of_scope",
  acceptCases: [{ input: "What does ser mean?", locale: "en" }],
  refuseCases: [{ input: "Write me an HTML app", locale: "en" }],
  ...overrides,
});

describe("compareSemver", () => {
  it.each([
    ["1.0.0", "1.0.0", 0],
    ["1.0.1", "1.0.0", 1],
    ["1.0.0", "1.0.1", -1],
    ["1.10.0", "1.9.0", 1],
    ["2.0.0", "1.99.99", 1],
    ["0.9.0", "1.0.0", -1],
  ])("%s vs %s", (a, b, expected) => {
    expect(Math.sign(compareSemver(a, b))).toBe(expected);
  });
});

describe("ruleChangeProblem", () => {
  it("accepts a rule that does not exist on the base branch (a new rule)", () => {
    expect(ruleChangeProblem(undefined, rule())).toBeUndefined();
  });

  it("accepts a rule that did not change", () => {
    expect(ruleChangeProblem(rule(), rule())).toBeUndefined();
  });

  it("accepts a version bump on its own", () => {
    expect(ruleChangeProblem(rule(), rule({ version: "1.0.1" }))).toBeUndefined();
  });

  it("rejects a content change without a version bump, naming the rule", () => {
    const problem = ruleChangeProblem(rule(), rule({ description: "A different description of the rule." }));
    expect(problem).toContain("scope.language-learning-only");
    expect(problem).toMatch(/version/i);
  });

  it("rejects a changed case without a version bump", () => {
    const changed = rule({ refuseCases: [{ input: "Write me an HTML app", locale: "en" }, { input: "x", locale: "en" }] });
    expect(ruleChangeProblem(rule(), changed)).toBeDefined();
  });

  it("accepts a content change with a bigger version", () => {
    expect(ruleChangeProblem(rule(), rule({ description: "A different description of the rule.", version: "1.1.0" }))).toBeUndefined();
  });

  it("rejects a content change whose version went down", () => {
    const base = rule({ version: "2.0.0" });
    expect(ruleChangeProblem(base, rule({ description: "A different description of the rule.", version: "1.5.0" }))).toBeDefined();
  });

  it("ignores key order, which is not a content change", () => {
    const reordered = Object.fromEntries(Object.entries(rule()).reverse());
    expect(ruleChangeProblem(rule(), reordered)).toBeUndefined();
  });
});

describe("recordedHashProblem", () => {
  const hash = "a".repeat(64);

  it("accepts a matching hash, ignoring a trailing newline", () => {
    expect(recordedHashProblem(`${hash}\n`, hash)).toBeUndefined();
  });

  it("rejects a missing hash and says how to record", () => {
    expect(recordedHashProblem(undefined, hash)).toContain("pnpm record:guardrails");
  });

  it("rejects a stale hash and says how to record", () => {
    const problem = recordedHashProblem("b".repeat(64), hash);
    expect(problem).toContain("pnpm record:guardrails");
    expect(problem).toMatch(/stale|no longer match/i);
  });
});
