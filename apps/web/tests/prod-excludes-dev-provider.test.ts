import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, type InlineConfig } from "vite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * SC-005: a production build contains no trace of the development-only Ollama provider, even when
 * `VITE_PROVIDER=ollama` is set. The positive control proves the check can see the code when the
 * dev branch is kept, so a pass is not just a search that finds nothing.
 */

const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEV_MARKERS = ["localhost:11434", "/v1/chat/completions", "[tarjuman dev provider]"];

let outDir: string;
let previousProvider: string | undefined;
let previousNodeEnv: string | undefined;

beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), "tarjuman-prod-bundle-"));
  previousProvider = process.env["VITE_PROVIDER"];
  process.env["VITE_PROVIDER"] = "ollama";
  // Vite derives `import.meta.env.DEV` from NODE_ENV, not from `mode`, and Vitest sets it to "test",
  // which would make this a development build. A real production build runs with "production".
  previousNodeEnv = process.env["NODE_ENV"];
  process.env["NODE_ENV"] = "production";
});

afterEach(async () => {
  if (previousProvider === undefined) delete process.env["VITE_PROVIDER"];
  else process.env["VITE_PROVIDER"] = previousProvider;
  if (previousNodeEnv === undefined) delete process.env["NODE_ENV"];
  else process.env["NODE_ENV"] = previousNodeEnv;
  await rm(outDir, { recursive: true, force: true });
});

async function emittedText(dir: string): Promise<string> {
  const parts: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) parts.push(await readFile(join(entry.parentPath, entry.name), "utf8"));
  }
  return parts.join("\n");
}

async function buildApp(extra: InlineConfig = {}): Promise<string> {
  await build({
    root: APP_ROOT,
    mode: "production",
    logLevel: "silent",
    ...extra,
    build: { outDir, emptyOutDir: true, write: true, ...extra.build },
  });
  return emittedText(outDir);
}

describe("production bundle and the dev-only Ollama provider", () => {
  it("contains none of the Ollama provider's endpoints or its diagnostic prefix", async () => {
    const output = await buildApp();
    // Booleans, so a failure does not print the whole bundle.
    for (const marker of DEV_MARKERS) expect(output.includes(marker), marker).toBe(false);
  }, 120_000);

  it("positive control: the same build with DEV forced on does contain them", async () => {
    const output = await buildApp({ define: { "import.meta.env.DEV": "true" } });
    expect(output.includes("[tarjuman dev provider]")).toBe(true);
  }, 120_000);
});
