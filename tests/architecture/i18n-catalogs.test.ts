import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// SC-006: no untranslated strings. `lint:i18n` checks the same catalog rules on the command line;
// this runs them in the test suite and adds the check that no screen carries a hard-coded string.
const root = resolve(import.meta.dirname, "../..");
const read = (locale: string) =>
  JSON.parse(readFileSync(join(root, `packages/ui/src/i18n/locales/${locale}.json`), "utf8")) as Record<string, string>;
const en = read("en");
const es = read("es");

describe("interface catalogs", () => {
  it("have identical keys in en and es", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  it.each([
    ["en", en],
    ["es", es],
  ])("have no empty value in %s", (_locale, catalog) => {
    expect(Object.entries(catalog).filter(([, value]) => value.trim() === "")).toEqual([]);
  });

  it.each([
    ["en", en],
    ["es", es],
  ])("have no value equal to its own key in %s", (_locale, catalog) => {
    expect(Object.entries(catalog).filter(([key, value]) => value === key)).toEqual([]);
  });
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === "dist") return [];
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith(".tsx") ? [path] : [];
  });
}

/** Attributes whose value a person reads or hears. */
const VISIBLE_ATTRIBUTES = new Set(["aria-label", "aria-description", "aria-placeholder", "title", "placeholder", "alt"]);
const HAS_LETTER = /\p{L}/u;

/** Finds text a person would read that did not come from a catalog: JSX text and visible attributes. */
export function hardCodedStrings(file: string, code: string): string[] {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const at = (node: ts.Node) => `${file.replace(root, "")}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && HAS_LETTER.test(node.text)) found.push(`${at(node)} text "${node.text.trim()}"`);
    if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteralLike(node.expression)) {
      if (HAS_LETTER.test(node.expression.text) && node.expression.text.trim() !== "")
        found.push(`${at(node)} text "${node.expression.text}"`);
    }
    if (
      ts.isJsxAttribute(node) &&
      VISIBLE_ATTRIBUTES.has(node.name.getText()) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      HAS_LETTER.test(node.initializer.text)
    ) {
      found.push(`${at(node)} ${node.name.getText()}="${node.initializer.text}"`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("no hard-coded user-visible strings", () => {
  const files = ["packages/ui/src", "apps/web/src"].flatMap((dir) => sources(join(root, dir)));

  it("scans the components (guards against the scan matching nothing)", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("finds none in any component", () => {
    const found = files.flatMap((file) => hardCodedStrings(file, readFileSync(file, "utf8")));
    expect(found).toEqual([]);
  });

  it("would catch one (the check can fail)", () => {
    const sample = `export const A = () => <p title="Hello">Hello {name}<img alt="x" />{"Bye"}</p>;`;
    expect(hardCodedStrings("sample.tsx", sample)).toHaveLength(4);
    expect(hardCodedStrings("sample.tsx", `export const A = () => <p title={t("a")}>{t("b")} · </p>;`)).toEqual([]);
  });
});
