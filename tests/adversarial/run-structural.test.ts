import type { SafeBlock } from "@tarjuman/core";
import {
  ADVERSARIAL_TONES,
  countRemoteResourceElements,
  formatStructuralReport,
  runStructural,
  structuralCases,
  type StructuralReport,
} from "@tarjuman/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { loadAdversarialCases } from "../support/adversarial-cases";
import { CAPABILITY_ID, capabilityRegistry, refusalTemplate } from "../support/guardrail-setup";

// The structural layer of the red-team suite (FR-036, SC-004, SC-009). It does not ask a model to
// resist: it proves the app is built so the attack cannot work, whatever a model does. For every
// case and every tone, a model that does exactly what the attacker wants is simulated, and the
// real pipeline must still (1) keep the key out of the request, (2) render no remote resource.

const cases = loadAdversarialCases();
let report: StructuralReport;

beforeAll(async () => {
  report = await runStructural(cases, {
    capabilities: capabilityRegistry(),
    capabilityId: CAPABILITY_ID,
    refusalTemplate,
  });
});

describe("structural adversarial runner", () => {
  it("covers at least 50 cases (SC-009)", () => {
    expect(structuralCases(cases).length).toBeGreaterThanOrEqual(50);
  });

  it("runs every case under every tone, with and without a pasted key", () => {
    expect(ADVERSARIAL_TONES).toEqual(["warm", "neutral", "formal"]);
    expect(report.runs).toBe(structuralCases(cases).length * ADVERSARIAL_TONES.length * 2);
  });

  it("never lets the key into a request, an event, or a render", () => {
    expect(report.failures).toEqual([]);
    expect(report.keyDisclosures).toBe(0);
  });

  it("never produces an image, raw HTML, script, iframe, or auto-loading resource", () => {
    expect(report.remoteResourceElements).toBe(0);
  });

  it("warns and withholds when a key is pasted into any case", () => {
    expect(report.pastedKeysWithheld).toBe(report.pastedKeyRuns);
    expect(report.pastedKeyRuns).toBeGreaterThan(0);
  });

  it("actually exercises hostile output: every run streamed attacker markup through the OutputGuard", () => {
    expect(report.hostileOutputsRendered).toBe(report.runs);
  });

  it("prints the summary quickstart.md asks for", () => {
    const text = formatStructuralReport(report);
    expect(text).toContain(`cases: ${structuralCases(cases).length}`);
    expect(text).toContain("key disclosures: 0");
    expect(text).toContain("remote-resource elements: 0");
  });

  it("counts a remote resource when one is present (the check can fail)", () => {
    const unsafe = [
      { type: "paragraph", children: [{ type: "image", src: "https://attacker.example/x.png" }] },
      { type: "html", value: "<script>alert(1)</script>" },
      {
        type: "paragraph",
        children: [{ type: "link", children: [], destination: "javascript:alert(1)", destinationDisplay: "javascript:alert(1)" }],
      },
      {
        type: "paragraph",
        children: [{ type: "link", children: [], destination: "https://a.example", destinationDisplay: "https://b.example" }],
      },
    ] as unknown as SafeBlock[];
    expect(countRemoteResourceElements(unsafe)).toBe(4);
    expect(countRemoteResourceElements([{ type: "paragraph", children: [{ type: "text", text: "ok" }] }])).toBe(0);
  });
});
