import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import languageQa from "@tarjuman/capability-language-qa";
import { CapabilityRegistry, loadRules, type DomainRule, type RefusalTemplates } from "@tarjuman/core";

/**
 * What every guardrail tool needs besides a provider: the rule files, the capability, and the
 * refusal templates. Shared by the recorder, the live runner and the per-PR suite, so they agree
 * on the cases. Node-only: it reads the repository's files.
 */
export const ROOT = resolve(import.meta.dirname, "../..");
export const GUARDRAIL_FIXTURES = join(ROOT, "packages/testing/fixtures/guardrails");
export const CAPABILITY_ID = languageQa.id;

const RULE_DIRS = ["packages/core/rules", "packages/capabilities/language-qa/rules"];
const CATALOGS = { en: "packages/ui/src/i18n/locales/en.json", es: "packages/ui/src/i18n/locales/es.json" } as const;

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Every rule file, validated, in a fixed order (core first). An invalid rule throws. */
export function loadRuleFiles(): DomainRule[] {
  const inputs = RULE_DIRS.flatMap((dir) => {
    const absolute = join(ROOT, dir);
    if (!existsSync(absolute)) return [];
    return readdirSync(absolute)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => readJson(join(absolute, name)));
  });
  return loadRules(inputs);
}

/** Shipped refusal templates by locale then key. Only `en` and `es` ship (FR-027). */
export function catalog(locale: "en" | "es"): Record<string, string> {
  return readJson(join(ROOT, CATALOGS[locale])) as Record<string, string>;
}

/** The app resolves these from its interface catalogs; the tools read the same files. */
export const refusalTemplate: RefusalTemplates = (key, locale) => catalog(locale)[key];

export function capabilityRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  registry.register(languageQa);
  return registry;
}
