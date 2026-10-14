import ts from "typescript";

/**
 * Only the pipeline module may reach a `ProviderPort` (contracts/pipeline.md, invariant 1), and only
 * the search broker may reach a `SearchPort` (005 contracts/search-port.md). The dependency-cruiser
 * rules see modules, not names, and both ports are exported from the same `@tarjuman/core` index as
 * harmless types such as `ModelInfo`, so this check reads the imported names themselves. Part of
 * `pnpm lint:arch`.
 */
export const PROVIDER_PORT_ALLOWED: readonly RegExp[] = [
  /^packages\/core\/src\/ports\/provider\.ts$/,
  /^packages\/core\/src\/pipeline\/(pipeline|credential-validation)\.ts$/,
  /^packages\/provider-[^/]+\//,
  /^packages\/testing\//,
  /^apps\/web\/src\/composition-root\.ts$/,
  // Tests may name the port to build doubles; they ship nowhere.
  /^tests\//,
  /^packages\/(?:capabilities\/)?[^/]+\/tests\//,
  /^apps\/[^/]+\/tests\//,
];

export const SEARCH_PORT_ALLOWED: readonly RegExp[] = [
  /^packages\/core\/src\/ports\/search\.ts$/,
  /^packages\/core\/src\/search\/(search-broker|search-credential-validation)\.ts$/,
  /^packages\/search-[^/]+\//,
  /^packages\/testing\//,
  /^apps\/web\/src\/composition-root\.ts$/,
  /^tests\//,
  /^packages\/(?:capabilities\/)?[^/]+\/tests\//,
  /^apps\/[^/]+\/tests\//,
];

/** Lines where `source` imports, re-exports, or refers through a namespace to the port `name`. */
function portReferences(name: string, path: string, source: string): number[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const lines: number[] = [];
  const hit = (node: ts.Node) => lines.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
  const named = (specifier: ts.ImportSpecifier | ts.ExportSpecifier) =>
    (specifier.propertyName ?? specifier.name).getText(file) === name;

  const visit = (node: ts.Node): void => {
    if (ts.isImportSpecifier(node) && named(node)) hit(node);
    else if (ts.isExportSpecifier(node) && named(node)) hit(node);
    // `import("@tarjuman/core").ProviderPort` and `core.ProviderPort` after `import * as core`.
    else if (ts.isImportTypeNode(node) && node.qualifier?.getText(file).split(".").at(-1) === name) hit(node);
    else if (ts.isQualifiedName(node) && node.right.text === name) hit(node);
    else if (ts.isPropertyAccessExpression(node) && node.name.text === name) hit(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return lines;
}

function violations(
  name: string,
  allowedPaths: readonly RegExp[],
  files: readonly { path: string; source: string }[],
): string[] {
  return files
    .filter(({ path }) => !allowedPaths.some((allowed) => allowed.test(path)))
    .flatMap(({ path, source }) => portReferences(name, path, source).map((line) => `${path}:${line}`));
}

export const providerPortReferences = (path: string, source: string): number[] =>
  portReferences("ProviderPort", path, source);

export const searchPortReferences = (path: string, source: string): number[] =>
  portReferences("SearchPort", path, source);

/** `path:line` for every `ProviderPort` reference outside the allowed paths. Paths are repository-relative. */
export const providerPortViolations = (files: readonly { path: string; source: string }[]): string[] =>
  violations("ProviderPort", PROVIDER_PORT_ALLOWED, files);

/** `path:line` for every `SearchPort` reference outside the allowed paths. */
export const searchPortViolations = (files: readonly { path: string; source: string }[]): string[] =>
  violations("SearchPort", SEARCH_PORT_ALLOWED, files);
