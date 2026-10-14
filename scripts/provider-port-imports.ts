import ts from "typescript";

/**
 * Only the pipeline module may reach a `ProviderPort` (contracts/pipeline.md, invariant 1). The
 * dependency-cruiser rules see modules, not names, and `ProviderPort` is exported from the same
 * `@tarjuman/core` index as harmless types such as `ModelInfo`, so this check reads the imported
 * names themselves. Part of `pnpm lint:arch`.
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

const NAME = "ProviderPort";

/** Lines where `source` imports, re-exports, or refers through a namespace to `ProviderPort`. */
export function providerPortReferences(path: string, source: string): number[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const lines: number[] = [];
  const hit = (node: ts.Node) => lines.push(file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1);
  const named = (specifier: ts.ImportSpecifier | ts.ExportSpecifier) =>
    (specifier.propertyName ?? specifier.name).getText(file) === NAME;

  const visit = (node: ts.Node): void => {
    if (ts.isImportSpecifier(node) && named(node)) hit(node);
    else if (ts.isExportSpecifier(node) && named(node)) hit(node);
    // `import("@tarjuman/core").ProviderPort` and `core.ProviderPort` after `import * as core`.
    else if (ts.isImportTypeNode(node) && node.qualifier?.getText(file).split(".").at(-1) === NAME) hit(node);
    else if (ts.isQualifiedName(node) && node.right.text === NAME) hit(node);
    else if (ts.isPropertyAccessExpression(node) && node.name.text === NAME) hit(node);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return lines;
}

/** `path:line` for every reference outside the allowed paths. Paths are repository-relative. */
export function providerPortViolations(files: readonly { path: string; source: string }[]): string[] {
  return files
    .filter(({ path }) => !PROVIDER_PORT_ALLOWED.some((allowed) => allowed.test(path)))
    .flatMap(({ path, source }) => providerPortReferences(path, source).map((line) => `${path}:${line}`));
}
