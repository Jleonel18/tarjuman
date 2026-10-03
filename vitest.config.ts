import { defineConfig } from "vitest/config";

// Vitest projects replace the old vitest.workspace.ts. The adversarial and guardrail projects are
// separate so `pnpm test:redteam` and the live (nightly) suites can select them by name.
const live = !!process.env["TARJUMAN_LIVE"];

export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["packages/*/tests/**/*.test.{ts,tsx}", "packages/capabilities/*/tests/**/*.test.{ts,tsx}"], environment: "node" } },
      { test: { name: "architecture", include: ["tests/architecture/**/*.test.ts"], environment: "node" } },
      { test: { name: "adversarial", include: ["tests/adversarial/**/*.test.ts"], exclude: ["tests/adversarial/**/*.live.test.ts"], environment: "node" } },
      { test: { name: "guardrails", include: ["tests/guardrails/**/*.test.ts"], exclude: ["tests/guardrails/**/*.live.test.ts"], environment: "node" } },
      ...(live
        ? [
            { test: { name: "adversarial-live", include: ["tests/adversarial/**/*.live.test.ts"], environment: "node", testTimeout: 120_000 } },
            { test: { name: "guardrails-live", include: ["tests/guardrails/**/*.live.test.ts"], environment: "node", testTimeout: 120_000 } },
          ]
        : []),
    ],
    passWithNoTests: true,
  },
});
