/**
 * Mechanical enforcement of Principles II and XI and the pipeline boundary (plan.md, T015/T021).
 * Type-only imports are exempt where noted: ports are interfaces, so a type import cannot
 * create a provider instance or reach a secret.
 */
const NOT_TYPE_ONLY = ["type-only"];

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "core-imports-no-outer-package",
      comment: "packages/core is the stable center: it imports no capability, adapter, UI, or app.",
      severity: "error",
      from: { path: "^packages/core/" },
      to: {
        // Matches both resolved paths and bare package names: core declares none of these as
        // dependencies, so a violating import is "unresolved" and shows up by package name.
        path: "^(packages/(capabilities|provider-anthropic|provider-ollama|provider-gemini|search-youtube|storage-web|ui|testing)|apps)/|^@tarjuman/(capability-.*|provider-anthropic|provider-ollama|provider-gemini|search-youtube|storage-web|ui|web|testing)(/|$)",
      },
    },
    {
      name: "core-no-framework-or-platform",
      comment: "packages/core must run unchanged in browser and desktop: no React, SDK, or Node/DOM built-ins.",
      severity: "error",
      from: { path: "^packages/core/src/" },
      to: {
        path: "^(react|react-dom|@anthropic-ai/sdk|idb|i18next|react-i18next)(/|$)|^(node:)?(fs|path|os|crypto|http|https|net|child_process|stream|url|util|buffer)$",
      },
    },
    {
      name: "sdk-only-in-provider-adapter",
      comment: "Only packages/provider-anthropic may import @anthropic-ai/sdk (Principle XI). Gemini uses fetch.",
      severity: "error",
      from: { pathNot: "^packages/provider-anthropic/" },
      to: { path: "@anthropic-ai/sdk" },
    },
    {
      name: "provider-impl-only-in-composition-root",
      comment:
        "A concrete provider is instantiated only in the composition root; everything else sees the ProviderPort type.",
      severity: "error",
      from: { pathNot: "^(apps/web/src/composition-root\\.ts|apps/[^/]+/tests/|packages/provider-(anthropic|ollama|gemini)/|tests/)" },
      to: { path: "^packages/provider-(anthropic|ollama|gemini)/", dependencyTypesNot: NOT_TYPE_ONLY },
    },
    {
      name: "providers-independent",
      comment:
        "Provider adapters never import each other: each stands alone behind ProviderPort (Principle XI).",
      severity: "error",
      from: { path: "^packages/provider-anthropic/" },
      to: { path: "^packages/provider-(ollama|gemini)/|^@tarjuman/provider-(ollama|gemini)(/|$)" },
    },
    {
      name: "providers-independent-reverse",
      comment: "See providers-independent.",
      severity: "error",
      from: { path: "^packages/provider-ollama/" },
      to: { path: "^packages/provider-(anthropic|gemini)/|^@tarjuman/provider-(anthropic|gemini)(/|$)|@anthropic-ai/sdk" },
    },
    {
      name: "providers-independent-gemini",
      comment: "See providers-independent. The Gemini adapter uses fetch, never another adapter or an SDK.",
      severity: "error",
      from: { path: "^packages/provider-gemini/" },
      to: { path: "^packages/provider-(anthropic|ollama)/|^@tarjuman/provider-(anthropic|ollama)(/|$)|@anthropic-ai/sdk" },
    },
    {
      name: "search-impl-only-in-composition-root",
      comment:
        "A concrete search source is instantiated only in the composition root; everything else sees the SearchPort type (specs/005 contracts/search-port.md).",
      severity: "error",
      from: { pathNot: "^(apps/web/src/composition-root\\.ts|apps/[^/]+/tests/|packages/search-youtube/|tests/)" },
      to: { path: "^packages/search-youtube/|^@tarjuman/search-youtube(/|$)", dependencyTypesNot: NOT_TYPE_ONLY },
    },
    {
      name: "search-adapters-independent",
      comment:
        "A search adapter imports only the core (and the testing helpers in tests): no provider, capability, storage, or UI, and no SDK.",
      severity: "error",
      from: { path: "^packages/search-youtube/" },
      to: {
        path: "^packages/(provider-anthropic|provider-ollama|provider-gemini|capabilities|storage-web|ui)/|^@tarjuman/(provider-.*|capability-.*|storage-web|ui)(/|$)|@anthropic-ai/sdk",
      },
    },
    {
      name: "providers-never-import-search",
      comment: "Provider adapters stay independent of search sources (Principle XI).",
      severity: "error",
      from: { path: "^packages/provider-(anthropic|ollama|gemini)/" },
      to: { path: "^packages/search-youtube/|^@tarjuman/search-youtube(/|$)" },
    },
    {
      name: "capabilities-no-adapters",
      comment:
        "A capability declares data and tools against the core's types. It never imports an adapter, storage, or UI (Principle II).",
      severity: "error",
      from: { path: "^packages/capabilities/", pathNot: "^packages/capabilities/[^/]+/tests/" },
      to: {
        path: "^packages/(provider-anthropic|provider-ollama|provider-gemini|search-youtube|storage-web|ui|testing)/|^@tarjuman/(provider-.*|search-youtube|storage-web|ui|testing)(/|$)",
      },
    },
    {
      name: "provider-ollama-never-unseals",
      comment:
        "The dev-only Ollama adapter sends no credential (002 FR-007), so it must never be able to read a raw secret.",
      severity: "error",
      from: { path: "^packages/provider-ollama/" },
      to: { path: "^packages/core/src/(ports/secret-(store|unseal)|adapter)\\.ts$|^@tarjuman/core/adapter$" },
    },
    {
      name: "credentials-never-touch-provider",
      comment:
        "KeyManager depends on CredentialValidator, never on ProviderPort (contracts/pipeline.md).",
      severity: "error",
      from: { path: "^packages/core/src/credentials/" },
      to: {
        path: "^packages/core/src/(ports/provider|pipeline/(?!credential-validation|types))",
      },
    },
    {
      name: "capabilities-no-pipeline-internals",
      comment: "Capabilities declare data; they cannot reach pipeline stages (US8-3).",
      severity: "error",
      from: { path: "^packages/capabilities/" },
      to: { path: "^packages/core/src/pipeline/" },
    },
    {
      name: "unseal-secret-only-in-adapters",
      comment:
        "Reading a raw secret (secret-unseal / secret-store) is for adapters only. secret-handle.ts may use the store to seal and destroy. Tests may unseal to assert on it.",
      severity: "error",
      from: {
        pathNot:
          "^(packages/(provider-anthropic|provider-gemini|search-youtube|storage-web|testing)/|packages/core/src/ports/secret-handle\\.ts$|packages/core/src/ports/secret-unseal\\.ts$|packages/core/src/adapter\\.ts$|packages/[^/]+/tests/|tests/)",
      },
      to: { path: "^packages/core/src/(ports/secret-(store|unseal)|adapter)\\.ts$" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    exclude: { path: "(^|/)(dist|node_modules|coverage)/" },
  },
};
