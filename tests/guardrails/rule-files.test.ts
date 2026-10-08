import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadRules, RuleLoadError } from "@tarjuman/core";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

// Rule files are data, and the JSON Schema in the contract is their source of truth (FR-025,
// FR-026). The core's Zod loader must agree with it. This lives here, not in packages/core,
// because the core forbids Node built-ins and the files sit in several packages.

const ROOT = resolve(import.meta.dirname, "../..");
const SCHEMA_PATH = join(ROOT, "specs/001-core-foundation/contracts/domain-rule.schema.json");
const RULE_DIRS = ["packages/core/rules", "packages/capabilities/language-qa/rules"];

/** Rule files the scope work (T073, T074) must ship. A missing one fails here, not silently. */
const REQUIRED_FILES = [
  "packages/core/rules/scope.language-learning-only.json",
  "packages/capabilities/language-qa/rules/translation.pedagogical-only.json",
];

const schema: unknown = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
const validate = new Ajv2020({ allErrors: true }).compile(schema as object);

function ruleFiles(): string[] {
  return RULE_DIRS.flatMap((dir) => {
    const absolute = join(ROOT, dir);
    let names: string[] = [];
    try {
      names = readdirSync(absolute).filter((name) => name.endsWith(".json"));
    } catch {
      // A missing directory is reported by the required-files test below.
    }
    return names.map((name) => join(dir, name));
  });
}

function readRule(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(ROOT, relativePath), "utf8"));
}

describe("rule files", () => {
  it.each(REQUIRED_FILES)("%s exists", (file) => {
    expect(ruleFiles()).toContain(file);
  });

  it.each(REQUIRED_FILES)("%s validates against the contract JSON Schema", (file) => {
    const rule = readRule(file);
    expect(validate(rule), JSON.stringify(validate.errors)).toBe(true);
  });

  it.each(REQUIRED_FILES)("%s loads through the core rule loader", (file) => {
    expect(() => loadRules([readRule(file)])).not.toThrow();
  });

  it("validates every rule file in the rule directories, not only the required ones", () => {
    const files = ruleFiles();
    expect(files.length).toBeGreaterThanOrEqual(REQUIRED_FILES.length);
    for (const file of files) {
      const rule = readRule(file);
      expect(validate(rule), `${file}: ${JSON.stringify(validate.errors)}`).toBe(true);
      expect(() => loadRules([rule]), file).not.toThrow();
    }
  });

  it("names each file after its rule id", () => {
    expect(ruleFiles().length).toBeGreaterThan(0);
    for (const file of ruleFiles()) {
      const rule = readRule(file) as { id: string };
      expect(file.endsWith(`/${rule.id}.json`), file).toBe(true);
    }
  });
});

describe("the Zod loader agrees with the JSON Schema", () => {
  const base = {
    id: "scope.language-learning-only",
    version: "1.0.0",
    description: "Keeps answers on language learning.",
    refusalTemplateKey: "refusal.out_of_scope",
    acceptCases: [{ input: "What does ser mean?", locale: "en" }],
    refuseCases: [{ input: "Write me an HTML app", locale: "en" }],
  };
  const without = (key: string) => Object.fromEntries(Object.entries(base).filter(([k]) => k !== key));

  const corpus: [string, unknown, boolean][] = [
    ["a minimal rule", base, true],
    ["a rule with clarifyCases", { ...base, clarifyCases: [{ input: "Help with my email", locale: "en" }] }, true],
    ["a case with profile and note", { ...base, acceptCases: [{ input: "x", locale: "en", profile: { mediation: "es" }, note: "n" }] }, true],
    ["no acceptCases", without("acceptCases"), false],
    ["no refuseCases", without("refuseCases"), false],
    ["empty acceptCases", { ...base, acceptCases: [] }, false],
    ["empty refuseCases", { ...base, refuseCases: [] }, false],
    ["no refusalTemplateKey", without("refusalTemplateKey"), false],
    ["uppercase id", { ...base, id: "Scope" }, false],
    ["id with a double dot", { ...base, id: "scope..x" }, false],
    ["id with an underscore", { ...base, id: "scope_x" }, false],
    ["short version", { ...base, version: "1.0" }, false],
    ["prerelease version", { ...base, version: "1.0.0-beta" }, false],
    ["9-character description", { ...base, description: "123456789" }, false],
    ["10-character description", { ...base, description: "1234567890" }, true],
    ["an unknown field", { ...base, severity: "high" }, false],
    ["a case with an unknown field", { ...base, acceptCases: [{ input: "x", locale: "en", weight: 1 }] }, false],
    ["a case with an empty input", { ...base, acceptCases: [{ input: "", locale: "en" }] }, false],
    ["a case without a locale", { ...base, refuseCases: [{ input: "x" }] }, false],
  ];

  it.each(corpus)("%s", (_name, rule, expected) => {
    const byJsonSchema = validate(rule);
    const byLoader = (() => {
      try {
        loadRules([rule]);
        return true;
      } catch (error) {
        // Only a deliberate rejection counts; any other failure (a missing export, say) is a bug.
        if (error instanceof RuleLoadError) return false;
        throw error;
      }
    })();
    expect(byJsonSchema).toBe(expected);
    expect(byLoader).toBe(expected);
  });
});
