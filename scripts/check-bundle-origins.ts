import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { PROVIDER_ORIGINS } from "../apps/web/csp";
import { ROOT } from "../tests/support/guardrail-setup";
import { bundleOriginProblems, type BundleFile } from "./bundle-origins";

/**
 * `pnpm check:bundle-origins` (001 T105): fails if the production bundle references any origin
 * other than the app's own and the AI provider's (FR-040, research R18). Run it after
 * `pnpm --filter @tarjuman/web build`. It prints paths and origins only.
 */
const DIST = join(ROOT, "apps/web/dist");
if (!existsSync(DIST)) {
  console.error("apps/web/dist not found: run `pnpm --filter @tarjuman/web build` first.");
  process.exit(1);
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

const files: BundleFile[] = listFiles(DIST)
  .filter((path) => /\.(?:html|css|m?js|cjs)$/.test(path))
  .map((path) => ({ path: relative(DIST, path), content: readFileSync(path, "utf8") }));

const problems = bundleOriginProblems(files, { providerOrigins: PROVIDER_ORIGINS });
if (problems.length > 0) {
  console.error(`check:bundle-origins FAILED (${problems.length}):\n${problems.map((p) => `  ${p}`).join("\n")}`);
  process.exit(1);
}
console.info(`check:bundle-origins ok (${files.length} files; origins: self, ${PROVIDER_ORIGINS.join(", ")})`);
