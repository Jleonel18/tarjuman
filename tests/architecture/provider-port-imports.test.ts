import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  providerPortReferences,
  providerPortViolations,
  searchPortReferences,
  searchPortViolations,
} from "../../scripts/provider-port-imports";
import { ROOT } from "../support/guardrail-setup";

/** US8-3, lint half: a `ProviderPort` import outside the allowed paths fails `pnpm lint:arch`. */
const fixture = readFileSync(join(ROOT, "tests/fixtures/provider-port-import.ts"), "utf8");

describe("ProviderPort import check", () => {
  it("is part of pnpm lint:arch", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["lint:arch"]).toContain("scripts/check-provider-port-imports.ts");
  });

  it.each([
    "packages/capabilities/language-qa/src/evil.ts",
    "packages/core/src/capabilities/permission-broker.ts",
    "packages/core/src/pipeline/output-guard.ts",
    "packages/ui/src/chat/ChatView.tsx",
    "apps/web/src/controller.ts",
  ])("fails for the fixture placed at %s", (path) => {
    expect(providerPortViolations([{ path, source: fixture }])).toEqual([`${path}:1`]);
  });

  it("passes for the fixture where it actually lives, and for the pipeline module", () => {
    for (const path of ["tests/fixtures/provider-port-import.ts", "packages/core/src/pipeline/pipeline.ts"]) {
      expect(providerPortViolations([{ path, source: fixture }])).toEqual([]);
    }
  });

  it("finds aliased, re-exported, inline-type, and namespace references, and ignores look-alikes", () => {
    const sources = [
      'import { type ProviderPort as P } from "@tarjuman/core";',
      'export type { ProviderPort } from "@tarjuman/core";',
      'let p: import("@tarjuman/core").ProviderPort;',
      'import * as core from "@tarjuman/core"; let q: core.ProviderPort;',
    ];
    for (const source of sources) expect(providerPortReferences("x.ts", source)).not.toEqual([]);
    expect(providerPortReferences("x.ts", '// ProviderPort is mentioned only here\nimport type { ModelInfo } from "@tarjuman/core";')).toEqual([]);
  });
});

/** 005: only the search broker may hold a `SearchPort` (contracts/search-port.md). */
const searchFixture = readFileSync(join(ROOT, "tests/fixtures/search-port-import.ts"), "utf8");

describe("SearchPort import check", () => {
  it.each([
    "packages/capabilities/resource-curation/src/evil.ts",
    "packages/core/src/capabilities/permission-broker.ts",
    "packages/core/src/pipeline/pipeline.ts",
    "packages/ui/src/chat/ChatView.tsx",
    "apps/web/src/controller.ts",
  ])("fails for the fixture placed at %s", (path) => {
    expect(searchPortViolations([{ path, source: searchFixture }])).toEqual([`${path}:1`]);
  });

  it.each([
    "tests/fixtures/search-port-import.ts",
    "packages/core/src/search/search-broker.ts",
    "packages/core/src/ports/search.ts",
    "packages/search-youtube/src/youtube-search.ts",
    "packages/testing/src/mock-search.ts",
    "apps/web/src/composition-root.ts",
  ])("passes for the fixture at %s", (path) => {
    expect(searchPortViolations([{ path, source: searchFixture }])).toEqual([]);
  });

  it("does not confuse the two ports", () => {
    expect(providerPortViolations([{ path: "packages/ui/src/x.ts", source: searchFixture }])).toEqual([]);
    expect(searchPortViolations([{ path: "packages/ui/src/x.ts", source: fixture }])).toEqual([]);
    expect(searchPortReferences("x.ts", 'import type { SearchPort as S } from "@tarjuman/core";')).toEqual([1]);
    expect(searchPortReferences("x.ts", "// SearchPort only in a comment\nconst SearchPortLike = 1;")).toEqual([]);
  });
});
