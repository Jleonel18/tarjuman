import type { UsageRecord } from "@tarjuman/core";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { ContextNotice } from "../src/chat/ContextNotice";
import { ModelEffortSettings } from "../src/settings/ModelEffortSettings";
import { StatsPanel } from "../src/stats/StatsPanel";
import { render } from "./render";

const noop = () => {};

function record(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    id: "u1",
    conversationId: "c1",
    messageId: "m1",
    modelId: "mock-model",
    inputTokens: 1200,
    outputTokens: 30,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    contextUsedTokens: 1200,
    contextWindow: 200_000,
    contextRatio: 0.006,
    estimatedCostUsd: 0.00135,
    pricingAsOf: "2026-10-02",
    configuredEffort: "medium",
    recommendedEffort: "low",
    createdAt: "2026-10-13T00:00:00.000Z",
    ...overrides,
  };
}

const panel = (records: UsageRecord[], configuredEffort: "low" | "medium" | "high" = "medium") =>
  createElement(StatsPanel, { records, configuredEffort, onApplyEffort: noop });

describe("StatsPanel searches and steps (005 FR-017)", () => {
  const withSearch = record({ steps: 3, searches: [{ sourceId: "youtube", count: 2 }] });

  it("shows how many searches were made, to which source, and that they use a free allowance", async () => {
    const { html, missing } = await render(panel([withSearch, record({ id: "u2", steps: 2, searches: [{ sourceId: "youtube", count: 1 }] })]));
    expect(missing).toEqual([]);
    expect(html).toContain("Searches: 3 (YouTube, free daily allowance)");
  });

  it("shows the number of model calls when a turn used more than one", async () => {
    const { html } = await render(panel([withSearch]));
    expect(html).toContain("Model calls: 3");
  });

  it("says nothing about searches or calls for plain single-call turns", async () => {
    const { html } = await render(panel([record(), record({ id: "u2", steps: 1 })]));
    expect(html).not.toContain("Searches:");
    expect(html).not.toContain("Model calls:");
  });

  it("still shows the summed cost as an estimate, with the price date", async () => {
    const { html } = await render(panel([withSearch]));
    expect(html).toContain("Estimated cost");
    expect(html).toContain("2026-10-02");
  });

  it("is in Spanish too", async () => {
    const { html, missing } = await render(panel([withSearch]), "es");
    expect(missing).toEqual([]);
    expect(html).toContain("Búsquedas: 2 (YouTube, cuota diaria gratuita)");
    expect(html).toContain("Llamadas al modelo: 3");
  });
});

describe("StatsPanel", () => {
  it("shows the reported tokens per answer and in total", async () => {
    const { html, missing } = await render(panel([record(), record({ id: "u2", inputTokens: 800, outputTokens: 10 })]));
    expect(missing).toEqual([]);
    expect(html).toContain("1,200");
    expect(html).toContain("2,000");
    expect(html).toContain("40");
  });

  it("labels the cost as an estimate with the price date", async () => {
    const { html } = await render(panel([record()]));
    expect(html).toContain("Estimated cost: $0.00135");
    expect(html).toContain("2026-10-02");
    expect(html).toContain("not a bill");
  });

  it("says pricing is unavailable instead of showing a number", async () => {
    const { html } = await render(panel([record({ estimatedCostUsd: null, pricingAsOf: null })]));
    expect(html).toContain("Pricing unavailable for this model.");
    expect(html).not.toContain("Estimated cost");
  });

  it("offers to apply the recommendation only when it differs from the configured effort", async () => {
    expect((await render(panel([record()], "medium"))).html).toContain("Use Low effort");
    expect((await render(panel([record()], "low"))).html).not.toContain("Use Low effort");
  });

  it("warns from 80% of the context window", async () => {
    expect((await render(panel([record({ contextRatio: 0.79 })]))).html).not.toContain("almost out of room");
    expect((await render(panel([record({ contextRatio: 0.8 })]))).html).toContain("almost out of room");
  });

  it("explains itself before the first answer", async () => {
    expect((await render(panel([]))).html).toContain("Usage appears here");
  });

  it("renders in Spanish without missing keys", async () => {
    const { html, missing } = await render(panel([record({ contextRatio: 0.9 })]), "es");
    expect(missing).toEqual([]);
    expect(html).toContain("Costo estimado");
    expect(html).toContain("casi no tiene espacio");
  });
});

describe("ModelEffortSettings", () => {
  const models = [
    { id: "a", displayName: "Model A", supportsEffort: true, effortLevels: ["low", "medium", "high"] as const },
    { id: "b", displayName: "Model B", supportsEffort: false, effortLevels: [] },
  ].map((m) => ({ ...m, effortLevels: [...m.effortLevels] }));

  it("offers low, medium and high for a model that supports effort", async () => {
    const { html, missing } = await render(
      createElement(ModelEffortSettings, { models, modelId: "a", effort: "medium", onChange: noop }),
    );
    expect(missing).toEqual([]);
    for (const label of ["Low", "Medium", "High"]) expect(html).toContain(`>${label}<`);
    expect(html).not.toContain("disabled");
  });

  it("disables effort for a model without it and says why", async () => {
    const { html } = await render(
      createElement(ModelEffortSettings, { models, modelId: "b", effort: "medium", onChange: noop }),
    );
    expect(html).toContain("disabled");
    expect(html).toContain("This model has no effort setting.");
  });
});

describe("ContextNotice", () => {
  it("shows the share used and offers a new conversation, without claiming anything was cut", async () => {
    const { html, missing } = await render(createElement(ContextNotice, { ratio: 0.85, onNewConversation: noop }));
    expect(missing).toEqual([]);
    expect(html).toContain("85%");
    expect(html).toContain("Start a new conversation");
    expect(html).toContain("Nothing has been cut");
  });
});
