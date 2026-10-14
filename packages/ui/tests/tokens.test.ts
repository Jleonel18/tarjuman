import { describe, expect, it } from "vitest";
import contract from "../../../specs/003-visual-design/contracts/design-tokens.md?raw";
import tokensCss from "../src/styles/tokens.css?raw";

/**
 * SC-002 before any browser runs: every text-on-background pair the token contract declares meets
 * WCAG contrast in both themes (4.5:1 for text, 3:1 for a boundary), computed from the values in
 * `tokens.css`. The pairs are read from the contract's "Used on" column, so a new row is tested
 * without touching this file (contracts/design-tokens.md, rule 3).
 */

type Rgb = readonly [number, number, number];

/** `--color-x: light-dark(#light, #dark)` for every color token in the stylesheet. */
function colorTokens(css: string): Map<string, { light: Rgb; dark: Rgb }> {
  const tokens = new Map<string, { light: Rgb; dark: Rgb }>();
  for (const match of css.matchAll(/(--color-[a-z-]+)\s*:\s*light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)/gi)) {
    tokens.set(match[1] ?? "", { light: hex(match[2] ?? ""), dark: hex(match[3] ?? "") });
  }
  return tokens;
}

function hex(value: string): Rgb {
  const n = Number.parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Short background names in the contract's "Used on" column, mapped to their token. */
const BACKGROUND_ALIASES: Record<string, string> = { raised: "surface-raised" };

interface Pair {
  foreground: string;
  background: string;
  kind: "text" | "boundary";
}

/** Rows like "| `--color-text` | … | canvas: text 16.3 / 14.4 |" in the "Color roles" table. */
function contractPairs(markdown: string): Pair[] {
  const pairs: Pair[] = [];
  for (const line of markdown.split("\n")) {
    const row = /^\|\s*`(--color-[a-z-]+)`\s*\|.*\|\s*([a-z ]+):\s*(text|boundary)\b[^|]*\|\s*$/.exec(line);
    if (!row) continue;
    const name = (row[2] ?? "").trim();
    pairs.push({
      foreground: row[1] ?? "",
      background: `--color-${BACKGROUND_ALIASES[name] ?? name.replace(/ /g, "-")}`,
      kind: row[3] as Pair["kind"],
    });
  }
  return pairs;
}

const MINIMUM = { text: 4.5, boundary: 3 } as const;
const tokens = colorTokens(tokensCss);
const pairs = contractPairs(contract);

describe("design tokens", () => {
  it("reads the pairs from the contract (guards against a parser that matches nothing)", () => {
    expect(pairs.length).toBeGreaterThanOrEqual(9);
    expect(pairs).toContainEqual({ foreground: "--color-border", background: "--color-canvas", kind: "boundary" });
  });

  it("defines every token the contract names", () => {
    const named = new Set([...contract.matchAll(/`(--[a-z0-9-]+)`/g)].map((m) => m[1] ?? ""));
    const defined = new Set([...tokensCss.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1] ?? ""));
    for (let step = 1; step <= 6; step += 1) named.add(`--space-${step}`);
    const missing = [...named].filter((name) => !defined.has(name));
    expect(missing).toEqual([]);
  });

  it("writes every color token as light-dark(light, dark)", () => {
    const declared = [...tokensCss.matchAll(/(--color-[a-z-]+)\s*:/g)].map((m) => m[1] ?? "");
    expect(declared.length).toBeGreaterThan(0);
    expect(declared.filter((name) => !tokens.has(name))).toEqual([]);
  });

  for (const theme of ["light", "dark"] as const) {
    it(`meets the contrast minimum for every declared pair in the ${theme} theme`, () => {
      const failures: string[] = [];
      for (const pair of pairs) {
        const fg = tokens.get(pair.foreground);
        const bg = tokens.get(pair.background);
        if (!fg || !bg) {
          failures.push(`${pair.foreground} on ${pair.background}: token missing`);
          continue;
        }
        const ratio = contrast(fg[theme], bg[theme]);
        if (ratio < MINIMUM[pair.kind]) {
          failures.push(`${pair.foreground} on ${pair.background}: ${ratio.toFixed(2)} < ${MINIMUM[pair.kind]}`);
        }
      }
      expect(failures).toEqual([]);
    });
  }

  it("shortens motion to near zero for reduced motion", () => {
    const block = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/.exec(tokensCss)?.[1] ?? "";
    expect(block).toMatch(/--duration-fast:\s*0\.01ms/);
    expect(block).toMatch(/--duration-base:\s*0\.01ms/);
  });
});
