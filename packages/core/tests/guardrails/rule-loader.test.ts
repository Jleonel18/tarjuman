import { describe, expect, it } from "vitest";
import { loadRules, RuleLoadError } from "../../src/guardrails/rule-loader";

const valid = (overrides: Record<string, unknown> = {}) => ({
  id: "scope.language-learning-only",
  version: "1.0.0",
  description: "Keeps answers on language learning.",
  refusalTemplateKey: "refusal.out_of_scope",
  acceptCases: [{ input: "What does ser mean?", locale: "en" }],
  refuseCases: [{ input: "Write me an HTML app", locale: "en" }],
  ...overrides,
});

const without = (key: string) => Object.fromEntries(Object.entries(valid()).filter(([k]) => k !== key));

/** Returns the error a load throws, so each test can assert on what it names. */
function failure(input: unknown[]): RuleLoadError {
  try {
    loadRules(input);
  } catch (error) {
    if (error instanceof RuleLoadError) return error;
    throw error;
  }
  throw new Error("Expected loadRules to throw a RuleLoadError.");
}

describe("loadRules: valid rules", () => {
  it("returns the rules it was given", () => {
    const rules = loadRules([valid(), valid({ id: "translation.pedagogical-only" })]);
    expect(rules.map((r) => r.id)).toEqual(["scope.language-learning-only", "translation.pedagogical-only"]);
  });

  it("accepts optional clarifyCases, and a case with a profile and a note", () => {
    const [rule] = loadRules([
      valid({
        clarifyCases: [
          { input: "Help me with my email", locale: "en", profile: { mediation: "es", target: "ja" }, note: "borderline" },
        ],
      }),
    ]);
    expect(rule?.clarifyCases).toHaveLength(1);
  });

  it("accepts an empty list of rules", () => {
    expect(loadRules([])).toEqual([]);
  });
});

describe("loadRules: a rule needs accept and refuse cases (FR-026)", () => {
  it("rejects a rule with no acceptCases", () => {
    expect(() => loadRules([without("acceptCases")])).toThrow(RuleLoadError);
  });

  it("rejects a rule with no refuseCases", () => {
    expect(() => loadRules([without("refuseCases")])).toThrow(RuleLoadError);
  });

  it("rejects empty acceptCases and empty refuseCases", () => {
    expect(() => loadRules([valid({ acceptCases: [] })])).toThrow(RuleLoadError);
    expect(() => loadRules([valid({ refuseCases: [] })])).toThrow(RuleLoadError);
  });

  it("rejects a case with an empty input or a missing locale", () => {
    expect(() => loadRules([valid({ acceptCases: [{ input: "", locale: "en" }] })])).toThrow(RuleLoadError);
    expect(() => loadRules([valid({ refuseCases: [{ input: "Write an app" }] })])).toThrow(RuleLoadError);
  });
});

describe("loadRules: field rules", () => {
  it.each(["scope.language-learning-only", "translation.pedagogical-only", "a", "scope", "a1.b-2.c3"])(
    "accepts the id %s",
    (id) => {
      expect(() => loadRules([valid({ id })])).not.toThrow();
    },
  );

  it.each(["", "Scope", "scope.UPPER", "1scope", "scope..x", "scope.", ".scope", "scope_x", "scope x"])(
    "rejects the id %j",
    (id) => {
      expect(() => loadRules([valid({ id })])).toThrow(RuleLoadError);
    },
  );

  it.each(["1.0.0", "0.0.1", "12.34.56"])("accepts the version %s", (version) => {
    expect(() => loadRules([valid({ version })])).not.toThrow();
  });

  it.each(["", "1.0", "1", "v1.0.0", "1.0.0-beta", "1.0.x", "1.0.0.0"])("rejects the version %j", (version) => {
    expect(() => loadRules([valid({ version })])).toThrow(RuleLoadError);
  });

  it("requires a description of at least 10 characters", () => {
    expect(() => loadRules([valid({ description: "123456789" })])).toThrow(RuleLoadError);
    expect(() => loadRules([valid({ description: "1234567890" })])).not.toThrow();
  });

  it("requires a refusalTemplateKey", () => {
    expect(() => loadRules([without("refusalTemplateKey")])).toThrow(RuleLoadError);
    expect(() => loadRules([valid({ refusalTemplateKey: "" })])).toThrow(RuleLoadError);
  });

  it("rejects fields the contract does not define", () => {
    expect(() => loadRules([valid({ severity: "high" })])).toThrow(RuleLoadError);
    expect(() =>
      loadRules([valid({ acceptCases: [{ input: "What does ser mean?", locale: "en", weight: 2 }] })]),
    ).toThrow(RuleLoadError);
  });

  it("rejects values that are not objects", () => {
    expect(() => loadRules([null])).toThrow(RuleLoadError);
    expect(() => loadRules(["scope.language-learning-only"])).toThrow(RuleLoadError);
    expect(() => loadRules([[]])).toThrow(RuleLoadError);
  });
});

describe("loadRules: startup failure", () => {
  it("rejects the whole load when any one rule is invalid", () => {
    expect(() => loadRules([valid(), valid({ id: "Bad Id" })])).toThrow(RuleLoadError);
  });

  it("names the position of the bad rule and the failing field", () => {
    const error = failure([valid(), valid({ id: "second", version: "nope" })]);
    expect(error.message).toContain("rule 1");
    expect(error.message).toContain("version");
  });

  it("names the rule id when it has one", () => {
    const error = failure([valid({ id: "scope.broken", acceptCases: [] })]);
    expect(error.message).toContain("scope.broken");
  });
});
