import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every catalog key that appears as a string literal in the UI or the app must exist in the
 * English catalog. `lint:i18n` checks that en and es match each other; this checks that the code
 * does not ask for a key nobody wrote, which would show the user a raw key.
 */
const root = resolve(import.meta.dirname, "../..");
const PREFIX = /^(common|app|onboarding|level|key|chat|conversations|error)\.[A-Za-z0-9_.]+$/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === "dist") return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("catalog keys used in code", () => {
  const en = JSON.parse(readFileSync(join(root, "packages/ui/src/i18n/locales/en.json"), "utf8")) as Record<string, string>;
  const used = new Map<string, string>();
  for (const dir of ["packages/ui/src", "apps/web/src"]) {
    for (const file of sources(join(root, dir))) {
      for (const match of readFileSync(file, "utf8").matchAll(/"([A-Za-z0-9_.]+)"/g)) {
        const literal = match[1] ?? "";
        if (PREFIX.test(literal)) used.set(literal, file);
      }
    }
  }

  it("finds the keys (guards against the scan silently matching nothing)", () => {
    expect(used.size).toBeGreaterThan(30);
  });

  it("has an English string for every key the code uses", () => {
    const missing = [...used].filter(([key]) => !(key in en)).map(([key, file]) => `${key} (${file.replace(root, "")})`);
    expect(missing).toEqual([]);
  });
});
