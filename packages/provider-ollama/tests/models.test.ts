import { describe, expect, it } from "vitest";
import { DEFAULT_OLLAMA_MODEL_ID, OLLAMA_MODELS } from "../src/models";

describe("OLLAMA_MODELS", () => {
  it("lists exactly gemma3:4b and gemma3:1b", () => {
    expect(OLLAMA_MODELS.map((m) => m.id)).toEqual(["gemma3:4b", "gemma3:1b"]);
  });

  it("defaults to gemma3:4b", () => {
    expect(DEFAULT_OLLAMA_MODEL_ID).toBe("gemma3:4b");
    expect(OLLAMA_MODELS.some((m) => m.id === DEFAULT_OLLAMA_MODEL_ID)).toBe(true);
  });

  it.each(OLLAMA_MODELS.map((m) => [m.id, m] as const))("%s has the documented limits and zero pricing", (_id, model) => {
    expect(model.contextWindow).toBe(32768);
    expect(model.maxOutput).toBe(8192);
    expect(model.supportsEffort).toBe(false);
    expect(model.effortLevels).toEqual([]);
    expect(model.pricing).toEqual({ inputPerMTok: 0, outputPerMTok: 0, asOf: "2026-10-04" });
  });

  it.each(OLLAMA_MODELS.map((m) => [m.id, m] as const))("%s display name says it is not Claude", (_id, model) => {
    expect(model.displayName).toContain("not Claude");
  });
});
