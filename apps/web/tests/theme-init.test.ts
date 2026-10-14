import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { THEME_STORAGE_KEY } from "@tarjuman/storage-web";
import { describe, expect, it } from "vitest";

/**
 * `public/theme-init.js` runs before first paint as a classic script, outside the app bundle, so it
 * cannot import the store. These tests run the real file in a bare context and check that it
 * agrees with `ThemePreferenceStore`: same key, same values, and it only reads (FR-002, FR-003).
 */
const SCRIPT = readFileSync(fileURLToPath(new URL("../public/theme-init.js", import.meta.url)), "utf8");

interface Page {
  dataset: Record<string, string>;
  setItemCalls: number;
  readKeys: string[];
}

function run(stored: Record<string, string>, options: { blocked?: boolean } = {}): Page {
  const page: Page = { dataset: {}, setItemCalls: 0, readKeys: [] };
  const localStorage = {
    getItem(key: string): string | null {
      if (options.blocked) throw new Error("SecurityError");
      page.readKeys.push(key);
      return stored[key] ?? null;
    },
    setItem(): void {
      page.setItemCalls += 1;
    },
    removeItem(): void {
      page.setItemCalls += 1;
    },
  };
  runInNewContext(SCRIPT, { document: { documentElement: { dataset: page.dataset } }, localStorage });
  return page;
}

describe("theme-init.js", () => {
  it("is a classic script: no import or export", () => {
    expect(SCRIPT).not.toMatch(/^\s*(import|export)\b/m);
  });

  it("reads the same key the store writes", () => {
    expect(SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
    expect(run({}).readKeys).toEqual([THEME_STORAGE_KEY]);
  });

  it.each(["light", "dark"])("sets data-theme for %s", (value) => {
    expect(run({ [THEME_STORAGE_KEY]: value }).dataset).toEqual({ theme: value });
  });

  it.each([
    ["system", { [THEME_STORAGE_KEY]: "system" }],
    ["a missing key", {}],
    ["junk", { [THEME_STORAGE_KEY]: "Dark" }],
    ["an empty value", { [THEME_STORAGE_KEY]: "" }],
  ])("does nothing for %s", (_label, stored) => {
    expect(run(stored).dataset).toEqual({});
  });

  it("does nothing, and does not throw, when localStorage is blocked", () => {
    expect(run({}, { blocked: true }).dataset).toEqual({});
  });

  it("never writes", () => {
    expect(run({ [THEME_STORAGE_KEY]: "dark" }).setItemCalls).toBe(0);
    expect(run({ [THEME_STORAGE_KEY]: "junk" }).setItemCalls).toBe(0);
  });

  it("stays under 1 KB", () => {
    expect(new TextEncoder().encode(SCRIPT).length).toBeLessThan(1024);
  });
});
