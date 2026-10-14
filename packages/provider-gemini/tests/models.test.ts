import { describe, expect, it } from "vitest";
import { GeminiProvider } from "../src/gemini-provider";
import { DEFAULT_GEMINI_MODEL_ID, GEMINI_MODELS } from "../src/models";

// The table must match research R8 exactly (models.list live and the pricing page, 2026-10-14).
// When Google changes a price or a limit, research.md is updated first, then this test, then the table.

describe("Gemini model table (research R8)", () => {
  it("offers three models, with gemini-3.8-flash as the default", () => {
    expect(GEMINI_MODELS.map((m) => m.id)).toEqual(["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-4-argon"]);
    expect(DEFAULT_GEMINI_MODEL_ID).toBe("gemini-3.8-flash");
  });

  it.each([
    ["gemini-3.8-flash", "Gemini 3.8 Flash", 1_048_576, 65_536, 0.75, 3.75, 0.075],
    ["gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite", 1_048_576, 65_536, 0.3, 2.5, 0.03],
    ["gemini-4-argon", "Gemini 4 Argon", 1_048_576, 32_768, 2, 10, 0.1],
  ])("%s has the researched limits and prices", (id, displayName, contextWindow, maxOutput, input, output, cacheRead) => {
    const model = GEMINI_MODELS.find((m) => m.id === id);
    expect(model).toEqual({
      id,
      displayName,
      contextWindow,
      maxOutput,
      supportsEffort: true,
      effortLevels: ["low", "medium", "high"],
      pricing: { inputPerMTok: input, outputPerMTok: output, cacheReadPerMTok: cacheRead, asOf: "2026-10-14" },
    });
  });

  it("listModels returns a copy of the table", () => {
    const provider = new GeminiProvider();
    const list = provider.listModels();
    expect(list).toEqual(GEMINI_MODELS);
    list.pop();
    expect(provider.listModels()).toHaveLength(3);
  });

  it("has the id gemini", () => {
    expect(new GeminiProvider().id).toBe("gemini");
  });
});
