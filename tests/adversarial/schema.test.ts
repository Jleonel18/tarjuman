import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

// Adversarial cases are data, and the JSON Schema in the contract is their source of truth
// (FR-036, data-model AdversarialCase). Each file holds the cases of one category as an array.
// Cases are permanent once added (FR-038), so this suite also guards the corpus shape: unique
// ids, every category present, and the seed minimums from tasks.md (T090-T096).

const ROOT = resolve(import.meta.dirname, "../..");
const SCHEMA_PATH = join(ROOT, "specs/001-core-foundation/contracts/adversarial-case.schema.json");
const CASES_DIR = join(ROOT, "tests/adversarial/cases");
const ID_PATTERN = /^adv-[a-z0-9-]+-\d{3}$/;

/** Seed minimums per category (T090-T096). Together they reach SC-009's 50. */
const MINIMUM_PER_CATEGORY: Record<string, number> = {
  "direct-override": 8,
  "roleplay-jailbreak": 7,
  "key-disclosure": 8,
  "exfiltration-links-images": 8,
  "embedded-external-content": 8,
  "tone-scope-relaxation": 6,
  "multilingual-encoded": 8,
};

interface CaseShape {
  id: string;
  category: string;
  simulatedExternalContent?: string;
}

const schema: unknown = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
const validate = new Ajv2020({ allErrors: true }).compile(schema as object);

function caseFiles(): string[] {
  try {
    return readdirSync(CASES_DIR).filter((name) => name.endsWith(".json")).sort();
  } catch {
    // A missing directory shows up as "all seven categories are present" failing.
    return [];
  }
}

function readCases(file: string): unknown[] {
  const parsed: unknown = JSON.parse(readFileSync(join(CASES_DIR, file), "utf8"));
  expect(Array.isArray(parsed), `${file} must hold an array of cases`).toBe(true);
  return parsed as unknown[];
}

function allCases(): { file: string; testCase: CaseShape }[] {
  return caseFiles().flatMap((file) => readCases(file).map((testCase) => ({ file, testCase: testCase as CaseShape })));
}

describe("adversarial case files", () => {
  it("every case validates against the contract JSON Schema", () => {
    const cases = allCases();
    expect(cases.length).toBeGreaterThan(0);
    for (const { file, testCase } of cases) {
      expect(validate(testCase), `${file} ${testCase.id}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it("ids are unique and match the id pattern", () => {
    const ids = allCases().map(({ testCase }) => testCase.id);
    for (const id of ids) expect(id).toMatch(ID_PATTERN);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names each file after the category of its cases, and each id after its category", () => {
    for (const { file, testCase } of allCases()) {
      expect(file, testCase.id).toBe(`${testCase.category}.json`);
      expect(testCase.id.startsWith(`adv-${testCase.category}-`), testCase.id).toBe(true);
    }
  });

  it("all seven categories are present", () => {
    const present = new Set(allCases().map(({ testCase }) => testCase.category));
    expect([...present].sort()).toEqual(Object.keys(MINIMUM_PER_CATEGORY).sort());
  });

  it.each(Object.entries(MINIMUM_PER_CATEGORY))("%s has at least %i cases", (category, minimum) => {
    const count = allCases().filter(({ testCase }) => testCase.category === category).length;
    expect(count).toBeGreaterThanOrEqual(minimum);
  });

  it("every embedded-external-content case carries simulatedExternalContent", () => {
    const embedded = allCases().filter(({ testCase }) => testCase.category === "embedded-external-content");
    for (const { testCase } of embedded) {
      expect(testCase.simulatedExternalContent?.length ?? 0, testCase.id).toBeGreaterThan(0);
    }
  });
});
