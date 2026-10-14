import { describe, expect, it } from "vitest";
import { readStoredProfile, validateProfile } from "../../src/profile/validation";

const MODELS = {
  anthropic: ["claude-sonnet-5-5", "claude-opus-5-5"],
  gemini: ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
};

function input(overrides: Record<string, unknown> = {}) {
  return {
    uiLanguage: "en",
    mediationLanguage: "es",
    targetLanguage: "ja",
    level: "A2",
    interests: ["cooking", "football"],
    providerId: "anthropic",
    modelId: "claude-sonnet-5-5",
    ...overrides,
  };
}

function check(overrides: Record<string, unknown> = {}) {
  return validateProfile(input(overrides), { modelsByProvider: MODELS });
}

function failedPaths(overrides: Record<string, unknown>): string[] {
  const result = check(overrides);
  if (result.ok) throw new Error("expected validation to fail");
  return result.issues.map((i) => i.path);
}

describe("validateProfile", () => {
  it("accepts a complete profile and applies defaults", () => {
    const result = check();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toneId).toBe("neutral");
    expect(result.value.configuredEffort).toBe("medium");
  });

  it("keeps explicit tone and effort", () => {
    const result = check({ toneId: "warm", configuredEffort: "high" });
    expect(result.ok && result.value.toneId).toBe("warm");
    expect(result.ok && result.value.configuredEffort).toBe("high");
  });

  describe("languages (FR-034)", () => {
    it("rejects the same mediation and target language", () => {
      const result = check({ mediationLanguage: "es", targetLanguage: "es" });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.issues).toContainEqual({ path: "targetLanguage", code: "same_as_mediation" });
    });

    it("treats the same language with different regions as different", () => {
      expect(check({ mediationLanguage: "es-MX", targetLanguage: "es-AR" }).ok).toBe(true);
    });

    it("accepts any well-formed BCP 47 target language", () => {
      for (const tag of ["ja", "yo", "qu", "zh-Hant-TW", "ar", "gn"]) {
        expect(check({ targetLanguage: tag }).ok, tag).toBe(true);
      }
    });

    it("rejects malformed language tags", () => {
      expect(failedPaths({ targetLanguage: "not a tag!" })).toContain("targetLanguage");
      expect(failedPaths({ mediationLanguage: "" })).toContain("mediationLanguage");
    });

    it("limits the UI language to shipped locales", () => {
      expect(check({ uiLanguage: "es" }).ok).toBe(true);
      expect(failedPaths({ uiLanguage: "fr" })).toContain("uiLanguage");
    });

    it("lets the UI language equal the mediation or target language", () => {
      expect(check({ uiLanguage: "es", mediationLanguage: "es", targetLanguage: "ja" }).ok).toBe(true);
    });
  });

  describe("interests", () => {
    it("accepts none", () => {
      expect(check({ interests: [] }).ok).toBe(true);
    });

    it("accepts exactly 10 and rejects 11", () => {
      const ten = Array.from({ length: 10 }, (_, i) => `topic ${i}`);
      expect(check({ interests: ten }).ok).toBe(true);
      expect(failedPaths({ interests: [...ten, "one more"] })).toContain("interests");
    });

    it("accepts 60 characters and rejects 61", () => {
      expect(check({ interests: ["a".repeat(60)] }).ok).toBe(true);
      expect(failedPaths({ interests: ["a".repeat(61)] })).toContain("interests.0");
    });

    it("rejects non-string and blank entries", () => {
      expect(check({ interests: [42] }).ok).toBe(false);
      expect(check({ interests: ["   "] }).ok).toBe(false);
    });
  });

  describe("level (FR-035)", () => {
    it("accepts A1 to C2 and unknown", () => {
      for (const level of ["A1", "A2", "B1", "B2", "C1", "C2", "unknown"]) {
        expect(check({ level }).ok, level).toBe(true);
      }
    });

    it("rejects anything else", () => {
      expect(failedPaths({ level: "D1" })).toContain("level");
      expect(failedPaths({ level: "a1" })).toContain("level");
    });
  });

  describe("effort and model", () => {
    it("offers only low, medium, and high", () => {
      expect(failedPaths({ configuredEffort: "xhigh" })).toContain("configuredEffort");
      expect(failedPaths({ configuredEffort: "max" })).toContain("configuredEffort");
    });

    it("requires the model to exist in the provider model table", () => {
      expect(failedPaths({ modelId: "gpt-nope" })).toContain("modelId");
      expect(check({ modelId: "claude-opus-5-5" }).ok).toBe(true);
    });
  });

  it("rejects missing required fields and non-objects", () => {
    expect(validateProfile(undefined, { modelsByProvider: MODELS }).ok).toBe(false);
    expect(validateProfile({}, { modelsByProvider: MODELS }).ok).toBe(false);
  });

  it("does not echo input values in issues", () => {
    const secretish = "sk-ant-api03-not-a-real-key-000000";
    const result = check({ interests: [secretish.repeat(3)] });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(secretish);
  });
});

describe("validateProfile: provider (004)", () => {
  it("requires a provider", () => {
    expect(failedPaths({ providerId: undefined })).toContain("providerId");
  });

  it("rejects a provider the build does not offer", () => {
    const result = check({ providerId: "openai" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({ path: "providerId", code: "unknown_provider" });
  });

  it("accepts a Gemini profile with a Gemini model", () => {
    const result = check({ providerId: "gemini", modelId: "gemini-3.8-flash" });
    expect(result.ok && result.value.providerId).toBe("gemini");
  });

  it("rejects a model that belongs to another provider (FR-018)", () => {
    expect(failedPaths({ providerId: "gemini", modelId: "claude-sonnet-5-5" })).toContain("modelId");
    expect(failedPaths({ providerId: "anthropic", modelId: "gemini-3.8-flash" })).toContain("modelId");
  });
});

describe("readStoredProfile (004 FR-002)", () => {
  const stored = {
    id: "profile" as const,
    uiLanguage: "en",
    mediationLanguage: "es",
    targetLanguage: "ja",
    level: "A2" as const,
    interests: [],
    toneId: "neutral",
    configuredEffort: "medium" as const,
    modelId: "claude-sonnet-5-5",
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };

  it("reads a profile saved before 004 as an Anthropic profile", () => {
    expect(readStoredProfile(stored)?.providerId).toBe("anthropic");
  });

  it("keeps a stored provider", () => {
    expect(readStoredProfile({ ...stored, providerId: "gemini", modelId: "gemini-3.8-flash" })?.providerId).toBe("gemini");
  });

  it("returns undefined for nothing stored", () => {
    expect(readStoredProfile(undefined)).toBeUndefined();
  });
});
