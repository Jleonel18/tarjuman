import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * FR-014 and FR-014a, checked on the production build: the bundled fonts stay inside their size
 * budget, only the Latin and Arabic subsets ship, text never waits for a font (`swap`), and the
 * Arabic face is limited to Arabic code points, so a Latin-only page never downloads it.
 */

const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));
const KB = 1024;
const LATIN_BUDGET = 250 * KB;
const ARABIC_BUDGET = 200 * KB;

/**
 * The Arabic blocks, plus the marks and Arabic-related supplementary blocks the font package
 * declares for its Arabic subset (joiners, directional marks, hyphens, Arabic numerals and
 * mathematical letters). Nothing here covers Basic Latin or Latin-1.
 */
const ARABIC_ALLOWED: readonly (readonly [number, number])[] = [
  [0x0600, 0x06ff],
  [0x0750, 0x077f],
  [0x0870, 0x08ff],
  [0xfb50, 0xfdff],
  [0xfe70, 0xfeff],
  [0x200c, 0x200e],
  [0x2010, 0x2011],
  [0x204f, 0x204f],
  [0x2e41, 0x2e41],
  [0x102e0, 0x102ff],
  [0x10e60, 0x10e7f],
  [0x10ec0, 0x10eff],
  [0x1ee00, 0x1eeff],
];

let outDir: string;
let previousProvider: string | undefined;
let previousNodeEnv: string | undefined;
let fonts: { name: string; size: number }[];
let css: string;

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), "tarjuman-font-budget-"));
  previousProvider = process.env["VITE_PROVIDER"];
  delete process.env["VITE_PROVIDER"];
  // See prod-excludes-dev-provider.test.ts: Vitest sets NODE_ENV to "test", which would make this a dev build.
  previousNodeEnv = process.env["NODE_ENV"];
  process.env["NODE_ENV"] = "production";

  await build({ root: APP_ROOT, mode: "production", logLevel: "silent", build: { outDir, emptyOutDir: true, write: true } });

  fonts = [];
  const cssParts: string[] = [];
  for (const entry of await readdir(outDir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    if (entry.name.endsWith(".woff2")) fonts.push({ name: entry.name, size: (await stat(path)).size });
    if (entry.name.endsWith(".css")) cssParts.push(await readFile(path, "utf8"));
  }
  css = cssParts.join("\n");
}, 120_000);

afterAll(async () => {
  if (previousProvider === undefined) delete process.env["VITE_PROVIDER"];
  else process.env["VITE_PROVIDER"] = previousProvider;
  if (previousNodeEnv === undefined) delete process.env["NODE_ENV"];
  else process.env["NODE_ENV"] = previousNodeEnv;
  await rm(outDir, { recursive: true, force: true });
});

/** The Fontsource subset in a file name such as `inter-latin-ext-wght-normal-Ab12.woff2`. */
function subsetOf(name: string): string {
  return /-(latin-ext|latin|arabic|cyrillic-ext|cyrillic|greek-ext|greek|vietnamese|math|symbols)-wght/.exec(name)?.[1] ?? "unknown";
}

function fontFaces(source: string): string[] {
  return [...source.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] ?? "");
}

/** Parses `U+0600-06FF`, `U+204F`, and the minifier's wildcard form `U+6??`. */
function ranges(unicodeRange: string): [number, number][] {
  return unicodeRange.split(",").map((part) => {
    const value = part.trim().replace(/^U\+/i, "");
    if (value.includes("?")) return [Number.parseInt(value.replace(/\?/g, "0"), 16), Number.parseInt(value.replace(/\?/g, "f"), 16)];
    const [from, to] = value.split("-");
    const start = Number.parseInt(from ?? "", 16);
    return [start, to === undefined ? start : Number.parseInt(to, 16)];
  });
}

describe("bundled fonts in the production build", () => {
  it("emits the Latin and Arabic font files (guards against a build without fonts)", () => {
    expect(fonts.some((f) => subsetOf(f.name) === "latin")).toBe(true);
    expect(fonts.some((f) => subsetOf(f.name) === "arabic")).toBe(true);
  });

  it("keeps every Latin file together within 250 KB", () => {
    const latin = fonts.filter((f) => subsetOf(f.name).startsWith("latin")).reduce((sum, f) => sum + f.size, 0);
    expect(latin).toBeLessThanOrEqual(LATIN_BUDGET);
  });

  it("keeps the Arabic files within 200 KB", () => {
    const arabic = fonts.filter((f) => subsetOf(f.name) === "arabic").reduce((sum, f) => sum + f.size, 0);
    expect(arabic).toBeLessThanOrEqual(ARABIC_BUDGET);
  });

  it("ships no other subset (Cyrillic, Greek, Vietnamese, …)", () => {
    const others = fonts.map((f) => f.name).filter((name) => !["latin", "latin-ext", "arabic"].includes(subsetOf(name)));
    expect(others).toEqual([]);
  });

  it("shows text at once in a fallback font: every @font-face uses font-display: swap", () => {
    const faces = fontFaces(css);
    expect(faces.length).toBeGreaterThanOrEqual(5);
    expect(faces.filter((face) => !/font-display:\s*swap/.test(face))).toEqual([]);
  });

  it("limits the Arabic face to Arabic code points", () => {
    const arabicFaces = fontFaces(css).filter((face) => /-arabic-wght[^)]*\.woff2/.test(face));
    expect(arabicFaces).toHaveLength(1);
    const range = /unicode-range:\s*([^;]+)/.exec(arabicFaces[0] ?? "")?.[1] ?? "";
    const outside = ranges(range).filter(([from, to]) => !ARABIC_ALLOWED.some(([lo, hi]) => from >= lo && to <= hi));
    expect(range).not.toBe("");
    expect(outside.map(([from, to]) => `U+${from.toString(16)}-${to.toString(16)}`)).toEqual([]);
  });
});
