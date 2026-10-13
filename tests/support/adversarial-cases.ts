import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AdversarialCase } from "@tarjuman/testing";
import { ROOT } from "./guardrail-setup";

export const ADVERSARIAL_CASES_DIR = join(ROOT, "tests/adversarial/cases");

/** Every adversarial case, in a fixed order. The schema test (T087) guards their shape. */
export function loadAdversarialCases(): AdversarialCase[] {
  return readdirSync(ADVERSARIAL_CASES_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .flatMap((name) => JSON.parse(readFileSync(join(ADVERSARIAL_CASES_DIR, name), "utf8")) as AdversarialCase[]);
}
