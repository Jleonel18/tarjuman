/**
 * Catalog rules (FR-031, SC-006): English and Spanish must have the same keys, no empty values, no
 * value that is just its own key (an untranslated placeholder), and the same ICU arguments.
 * Pure functions so they can be tested; `lint-i18n.ts` is the command-line wrapper.
 */

export type Catalog = Record<string, string>;

export interface CatalogGroup {
  /** Human-readable name used in messages, e.g. "ui" or "capability language-qa". */
  name: string;
  /** When set, every key must start with `capability.<id>.`. */
  capabilityId?: string;
  /** Locale tag to its catalog. Must contain `en` and `es`. */
  catalogs: Record<string, Catalog | undefined>;
}

export const REQUIRED_LOCALES = ["en", "es"] as const;

const BRANCHING = /^\s*([A-Za-z_][\w.]*)\s*,\s*(plural|select|selectordinal)\s*,/;
const SIMPLE_ARG = /^\s*([A-Za-z_][\w.]*)\s*(?:,|$)/;

function matchingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function collectArguments(text: string, into: Set<string>): void {
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf("{", i);
    if (open === -1) return;
    const end = matchingBrace(text, open);
    if (end === -1) return;
    const content = text.slice(open + 1, end);
    const branching = BRANCHING.exec(content);
    if (branching) {
      into.add(branching[1]!);
      // Branch bodies (`one {# item}`) are text that may contain further arguments; they are not
      // arguments themselves.
      let j = branching[0].length;
      while (j < content.length) {
        const bodyOpen = content.indexOf("{", j);
        if (bodyOpen === -1) break;
        const bodyEnd = matchingBrace(content, bodyOpen);
        if (bodyEnd === -1) break;
        collectArguments(content.slice(bodyOpen + 1, bodyEnd), into);
        j = bodyEnd + 1;
      }
    } else {
      const simple = SIMPLE_ARG.exec(content);
      if (simple) into.add(simple[1]!);
    }
    i = end + 1;
  }
}

/** Names of ICU arguments used in a message, e.g. `{count, plural, ...}` and `{name}`. */
export function icuArguments(message: string): string[] {
  const names = new Set<string>();
  collectArguments(message, names);
  return [...names].sort();
}

export function checkGroup(group: CatalogGroup): string[] {
  const problems: string[] = [];
  const at = (locale: string, key?: string) => `${group.name} [${locale}]${key ? ` ${key}` : ""}`;

  for (const locale of REQUIRED_LOCALES) {
    if (!group.catalogs[locale]) problems.push(`${group.name}: missing ${locale} catalog`);
  }
  const en = group.catalogs["en"];
  const es = group.catalogs["es"];

  for (const locale of REQUIRED_LOCALES) {
    const catalog = group.catalogs[locale];
    if (!catalog) continue;
    for (const [key, value] of Object.entries(catalog)) {
      if (typeof value !== "string" || value.trim() === "") problems.push(`${at(locale, key)}: empty value`);
      else if (value === key) problems.push(`${at(locale, key)}: value is identical to its key (untranslated)`);
      if (group.capabilityId !== undefined && !key.startsWith(`capability.${group.capabilityId}.`)) {
        problems.push(`${at(locale, key)}: key must start with "capability.${group.capabilityId}."`);
      }
    }
  }

  if (en && es) {
    for (const key of Object.keys(en)) {
      if (!(key in es)) problems.push(`${at("es", key)}: missing (present in en)`);
    }
    for (const key of Object.keys(es)) {
      if (!(key in en)) problems.push(`${at("en", key)}: missing (present in es)`);
    }
    for (const key of Object.keys(en)) {
      const a = es[key];
      const b = en[key];
      if (typeof a !== "string" || typeof b !== "string") continue;
      const enArgs = icuArguments(b).join(",");
      const esArgs = icuArguments(a).join(",");
      if (enArgs !== esArgs) {
        problems.push(`${at("es", key)}: ICU arguments differ (en: {${enArgs}} vs es: {${esArgs}})`);
      }
    }
  }
  return problems;
}

export function checkCatalogs(groups: CatalogGroup[]): string[] {
  return groups.flatMap(checkGroup);
}
