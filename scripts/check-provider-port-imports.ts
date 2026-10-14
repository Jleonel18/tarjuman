import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { providerPortViolations, searchPortViolations } from "./provider-port-imports";

/** `pnpm lint:arch`, second half: no `ProviderPort` outside the pipeline module (US8-3), no `SearchPort` outside the search broker. */
const ROOT = resolve(import.meta.dirname, "..");
const SCANNED = ["packages", "apps", "tests", "scripts"];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === "dist" ? [] : sources(path);
    return /\.(ts|tsx|mts|cts)$/.test(entry.name) ? [path] : [];
  });
}

const files = SCANNED.flatMap((dir) => sources(join(ROOT, dir))).map((path) => ({
  path: relative(ROOT, path).split("\\").join("/"),
  source: readFileSync(path, "utf8"),
}));
const providerViolations = providerPortViolations(files);
const searchViolations = searchPortViolations(files);

if (providerViolations.length > 0) {
  console.error("ProviderPort is only for the pipeline module, provider adapters, and the composition root:");
  for (const violation of providerViolations) console.error(`  ${violation}`);
}
if (searchViolations.length > 0) {
  console.error("SearchPort is only for the search broker, search adapters, and the composition root:");
  for (const violation of searchViolations) console.error(`  ${violation}`);
}
if (providerViolations.length > 0 || searchViolations.length > 0) process.exit(1);
console.log(`port imports ok (${files.length} files)`);
