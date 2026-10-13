import { describe, expect, it } from "vitest";
import type { ModelInfo } from "../../src/ports/provider";
import { buildUsageRecord, CONTEXT_WARNING_RATIO, isContextWarning, sumUsage } from "../../src/stats/usage";

const PRICED: ModelInfo = {
  id: "priced-model",
  displayName: "Priced",
  contextWindow: 200_000,
  maxOutput: 8_000,
  supportsEffort: true,
  effortLevels: ["low", "medium", "high"],
  pricing: { inputPerMTok: 3, outputPerMTok: 15, cacheReadPerMTok: 0.3, asOf: "2026-10-01" },
};

const UNPRICED: ModelInfo = { ...PRICED, id: "unpriced-model", pricing: null };

function build(model: ModelInfo, usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number }) {
  return buildUsageRecord({
    id: "usage-1",
    conversationId: "c-1",
    messageId: "m-1",
    model,
    usage,
    configuredEffort: "medium",
    recommendedEffort: "low",
    createdAt: "2026-10-13T00:00:00.000Z",
  });
}

describe("buildUsageRecord: provider-reported tokens", () => {
  it("passes input, output and cache tokens through unchanged (SC-005)", () => {
    const record = build(PRICED, { inputTokens: 1234, outputTokens: 56, cacheReadTokens: 7 });
    expect(record).toMatchObject({ inputTokens: 1234, outputTokens: 56, cacheReadTokens: 7 });
  });

  it("reports 0 cache tokens when the provider reported none", () => {
    const record = build(PRICED, { inputTokens: 10, outputTokens: 2 });
    expect(record).toMatchObject({ cacheReadTokens: 0, cacheWriteTokens: 0 });
  });

  it("carries identity, model and both efforts through", () => {
    const record = build(PRICED, { inputTokens: 1, outputTokens: 1 });
    expect(record).toMatchObject({
      id: "usage-1",
      conversationId: "c-1",
      messageId: "m-1",
      modelId: "priced-model",
      configuredEffort: "medium",
      recommendedEffort: "low",
      createdAt: "2026-10-13T00:00:00.000Z",
    });
  });
});

describe("buildUsageRecord: context accounting", () => {
  it("derives contextUsedTokens from input tokens plus cache reads", () => {
    expect(build(PRICED, { inputTokens: 1000, outputTokens: 5 }).contextUsedTokens).toBe(1000);
    expect(build(PRICED, { inputTokens: 1000, outputTokens: 5, cacheReadTokens: 500 }).contextUsedTokens).toBe(1500);
  });

  it("takes the window from the model table and computes the ratio", () => {
    const record = build(PRICED, { inputTokens: 50_000, outputTokens: 5 });
    expect(record.contextWindow).toBe(200_000);
    expect(record.contextRatio).toBeCloseTo(0.25);
  });

  it("keeps the ratio within [0, 1] even when the provider reports more than the window", () => {
    expect(build(PRICED, { inputTokens: 0, outputTokens: 0 }).contextRatio).toBe(0);
    expect(build(PRICED, { inputTokens: 250_000, outputTokens: 0 }).contextRatio).toBe(1);
  });

  it("warns at 80% and above, not below", () => {
    expect(CONTEXT_WARNING_RATIO).toBe(0.8);
    expect(isContextWarning(0.79)).toBe(false);
    expect(isContextWarning(0.8)).toBe(true);
    expect(isContextWarning(1)).toBe(true);
  });
});

describe("buildUsageRecord: cost estimate", () => {
  it("multiplies tokens by the price row and records the row's date", () => {
    const record = build(PRICED, { inputTokens: 1_000_000, outputTokens: 500_000 });
    // 1M × $3 + 0.5M × $15
    expect(record.estimatedCostUsd).toBeCloseTo(10.5);
    expect(record.pricingAsOf).toBe("2026-10-01");
  });

  it("prices cache reads at the cache-read rate when the row has one", () => {
    const record = build(PRICED, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 });
    expect(record.estimatedCostUsd).toBeCloseTo(0.3);
  });

  it("is null, with a null date, when the model has no price row (FR-021)", () => {
    const record = build(UNPRICED, { inputTokens: 1000, outputTokens: 100 });
    expect(record.estimatedCostUsd).toBeNull();
    expect(record.pricingAsOf).toBeNull();
  });
});

describe("sumUsage: session totals", () => {
  const a = build(PRICED, { inputTokens: 1000, outputTokens: 100, cacheReadTokens: 10 });
  const b = build(PRICED, { inputTokens: 2000, outputTokens: 200 });

  it("sums the tokens of every record", () => {
    expect(sumUsage([a, b])).toMatchObject({ inputTokens: 3000, outputTokens: 300, cacheReadTokens: 10 });
  });

  it("sums the cost estimates", () => {
    const expected = (a.estimatedCostUsd ?? 0) + (b.estimatedCostUsd ?? 0);
    expect(sumUsage([a, b]).estimatedCostUsd).toBeCloseTo(expected);
  });

  it("has a null cost when any record has no price, so the UI never shows a partial total as exact", () => {
    const unpriced = build(UNPRICED, { inputTokens: 5, outputTokens: 5 });
    expect(sumUsage([a, unpriced]).estimatedCostUsd).toBeNull();
  });

  it("is all zeros, with a 0 cost, for an empty session", () => {
    expect(sumUsage([])).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimatedCostUsd: 0,
    });
  });
});
