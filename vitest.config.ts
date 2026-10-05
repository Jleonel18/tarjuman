import { defineConfig } from "vitest/config";

// Vitest projects replace the old vitest.workspace.ts. The adversarial and guardrail projects are
// separate so `pnpm test:redteam` and the live (nightly) suites can select them by name.
const live = !!process.env["TARJUMAN_LIVE"];

export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["packages/*/tests/**/*.test.{ts,tsx}", "packages/capabilities/*/tests/**/*.test.{ts,tsx}", "apps/*/tests/**/*.test.{ts,tsx}"], exclude: ["packages/*/tests/**/*.live.test.ts"], environment: "node" } },
      { test: { name: "architecture", include: ["tests/architecture/**/*.test.ts"], environment: "node" } },
      { test: { name: "adversarial", include: ["tests/adversarial/**/*.test.ts"], exclude: ["tests/adversarial/**/*.live.test.ts"], environment: "node" } },
      { test: { name: "guardrails", include: ["tests/guardrails/**/*.test.ts"], exclude: ["tests/guardrails/**/*.live.test.ts"], environment: "node" } },
      ...(live
        ? [
            { test: { name: "adversarial-live", include: ["tests/adversarial/**/*.live.test.ts"], environment: "node", testTimeout: 120_000 } },
            { test: { name: "guardrails-live", include: ["tests/guardrails/**/*.live.test.ts"], environment: "node", testTimeout: 120_000 } },
            // Opt-in adapter smoke tests against a real local runtime (e.g. Ollama); free, but not in CI.
            { test: { name: "provider-live", include: ["packages/*/tests/**/*.live.test.ts"], environment: "node", testTimeout: 120_000 } },
          ]
        : []),
    ],
    passWithNoTests: true,
  },
});
