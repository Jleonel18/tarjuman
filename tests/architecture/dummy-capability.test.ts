import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import languageQa from "@tarjuman/capability-language-qa";
import { CapabilityRegistry, sealSecret } from "@tarjuman/core";
import { runGuardrailCase } from "@tarjuman/testing";
import { DEFAULT_MOCK_KEY, MockProvider } from "@tarjuman/testing/mock-provider";
import { describe, expect, it } from "vitest";
import { dummyCapability } from "../fixtures/dummy-capability";
import { ROOT, refusalTemplate } from "../support/guardrail-setup";

/**
 * SC-008: a capability is added by declaration only. The dummy capability lives in `tests/`, is
 * registered next to `language-qa`, and runs a whole turn through the real pipeline with the
 * guardrails, a non-default tone and the metrics stage active, with no change to `packages/core`.
 */
function registry(): CapabilityRegistry {
  const r = new CapabilityRegistry();
  r.register(languageQa);
  r.register(dummyCapability);
  return r;
}

function turn(capabilityId: string, input: string) {
  return runGuardrailCase(
    { input, mediation: "es", target: "ja", toneId: "warm" },
    {
      provider: new MockProvider(),
      secret: sealSecret(DEFAULT_MOCK_KEY),
      modelId: "mock-model",
      capabilities: registry(),
      capabilityId,
      refusalTemplate,
    },
  );
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === "dist" ? [] : sourceFiles(path);
    return /\.(ts|tsx|json)$/.test(entry.name) ? [path] : [];
  });
}

describe("dummy capability (SC-008)", () => {
  it("registers next to language-qa", () => {
    expect(registry().list().map((c) => c.id)).toEqual(["language-qa", "dummy"]);
  });

  it("runs a full turn through the pipeline with guardrails, tone, and metrics active", async () => {
    const run = await turn("dummy", dummyCapability.domainRules[0]?.acceptCases[0]?.input ?? "");
    expect(run.verdict).toBe("accept");
    expect(run.ruleIds).toContain("scope.dummy@1.0.0");
    expect(run.status).toBe("complete");
    expect(run.events.some((e) => e.type === "usage")).toBe(true);

    const layers = run.request?.layers ?? [];
    expect(layers.map((l) => l.id)).toEqual(expect.arrayContaining(["security", "domain_scope", "capability", "tone"]));
    expect(layers.find((l) => l.id === "capability")?.text).toContain("You may show short vocabulary notices.");
    expect(layers.find((l) => l.id === "domain_scope")?.text).toContain("scope.dummy");
    // The security layer stays first: a capability adds below it and never above.
    expect(layers[0]?.id).toBe("security");
  });

  it("leaves language-qa working the same way in the same registry", async () => {
    const run = await turn("language-qa", "What is the difference between ser and estar?");
    expect(run.verdict).toBe("accept");
    expect(run.ruleIds).not.toContain("scope.dummy@1.0.0");
    expect(run.request?.layers.find((l) => l.id === "capability")?.text).not.toContain("vocabulary notices");
  });

  it("no file in packages/core refers to the dummy capability or the test fixtures", () => {
    const core = join(ROOT, "packages/core");
    const offenders = sourceFiles(core).filter((file) =>
      /dummy-capability|tests\/fixtures|["']dummy["']/.test(readFileSync(file, "utf8")),
    );
    expect(offenders.map((file) => relative(ROOT, file))).toEqual([]);
  });
});
