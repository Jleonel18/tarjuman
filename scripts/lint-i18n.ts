import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { checkCatalogs, REQUIRED_LOCALES, type Catalog, type CatalogGroup } from "./i18n-check";

const root = resolve(import.meta.dirname, "..");

function readCatalog(path: string): Catalog | undefined {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as Catalog;
}

function groupFor(name: string, dir: string, capabilityId?: string): CatalogGroup {
  const catalogs: CatalogGroup["catalogs"] = {};
  for (const locale of REQUIRED_LOCALES) catalogs[locale] = readCatalog(join(dir, `${locale}.json`));
  return capabilityId === undefined ? { name, catalogs } : { name, capabilityId, catalogs };
}

const groups: CatalogGroup[] = [groupFor("ui", join(root, "packages/ui/src/i18n/locales"))];

const capabilitiesDir = join(root, "packages/capabilities");
if (existsSync(capabilitiesDir)) {
  for (const id of readdirSync(capabilitiesDir)) {
    const i18nDir = join(capabilitiesDir, id, "src/i18n");
    if (statSync(join(capabilitiesDir, id)).isDirectory() && existsSync(i18nDir)) {
      groups.push(groupFor(`capability ${id}`, i18nDir, id));
    }
  }
}

const problems = checkCatalogs(groups);
if (problems.length > 0) {
  console.error(`lint:i18n found ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`lint:i18n ok (${groups.length} catalog group${groups.length === 1 ? "" : "s"}, ${REQUIRED_LOCALES.join("/")})`);
