import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SC-001, for what Stylelint cannot see: a component must not set a color through a `style` prop.
 * Colors come from the tokens in `packages/ui/src/styles/tokens.css` and nowhere else.
 */
const root = resolve(import.meta.dirname, "../..");

/** A hex color, a color function, or a CSS named color commonly typed by hand. */
const COLOR =
  /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|light-dark)\(|\b(color|background|backgroundColor|borderColor|fill|stroke)\s*:\s*["'`](?!var\()/i;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === "dist") return [];
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith(".tsx") ? [path] : [];
  });
}

/** The value of every `style={…}` prop, found by matching braces. */
function styleProps(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/\bstyle=\{/g)) {
    let depth = 1;
    let i = (match.index ?? 0) + match[0].length;
    const start = i;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") depth -= 1;
      i += 1;
    }
    found.push(source.slice(start, i - 1));
  }
  return found;
}

describe("no inline colors in components", () => {
  const files = ["packages/ui/src", "apps/web/src"].flatMap((dir) => sources(join(root, dir)));

  it("scans the components (guards against a scan that finds nothing)", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("detects a color in a style prop (positive control)", () => {
    const sample = '<p style={{ color: "red" }} /><p style={{ background: "#fff" }} /><p style={{ inlineSize: 4 }} />';
    expect(styleProps(sample).filter((value) => COLOR.test(value))).toHaveLength(2);
  });

  it("finds no style prop that sets a color", () => {
    const offenders = files.flatMap((file) =>
      styleProps(readFileSync(file, "utf8"))
        .filter((value) => COLOR.test(value))
        .map((value) => `${file.replace(root, "")}: style={${value}}`),
    );
    expect(offenders).toEqual([]);
  });
});
