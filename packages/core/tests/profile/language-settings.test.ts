import { describe, expect, it } from "vitest";
import { validateProfile } from "../../src/profile/validation";

const MODELS = ["claude-sonnet-5-5"];
const BASE = {
  uiLanguage: "en",
  mediationLanguage: "es",
  targetLanguage: "ja",
  level: "B1",
  interests: [],
  modelId: "claude-sonnet-5-5",
};

function check(change: Record<string, unknown>) {
  return validateProfile({ ...BASE, ...change }, { knownModelIds: MODELS });
}

function languages(change: Record<string, unknown>) {
  const result = check(change);
  if (!result.ok) throw new Error(`expected ${JSON.stringify(change)} to be valid`);
  const { uiLanguage, mediationLanguage, targetLanguage } = result.value;
  return { uiLanguage, mediationLanguage, targetLanguage };
}

describe("language settings: three independent settings", () => {
  it("changing the interface language leaves the other two alone", () => {
    expect(languages({ uiLanguage: "es" })).toEqual({
      uiLanguage: "es",
      mediationLanguage: "es",
      targetLanguage: "ja",
    });
  });

  it("changing the mediation language leaves the interface and target alone", () => {
    expect(languages({ mediationLanguage: "ar" })).toEqual({
      uiLanguage: "en",
      mediationLanguage: "ar",
      targetLanguage: "ja",
    });
  });

  it("changing the target language leaves the interface and mediation alone", () => {
    expect(languages({ targetLanguage: "he" })).toEqual({
      uiLanguage: "en",
      mediationLanguage: "es",
      targetLanguage: "he",
    });
  });

  it("allows the interface language to equal either of the other two", () => {
    expect(check({ uiLanguage: "es", mediationLanguage: "es" }).ok).toBe(true);
    expect(check({ uiLanguage: "en", mediationLanguage: "es", targetLanguage: "en" }).ok).toBe(true);
  });
});

describe("language settings: mediation and target must differ", () => {
  it("rejects a target equal to the mediation language", () => {
    const result = check({ targetLanguage: "es" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toEqual([{ path: "targetLanguage", code: "same_as_mediation" }]);
  });

  it("rejects a mediation language equal to the target, whatever the letter case", () => {
    expect(check({ mediationLanguage: "JA" }).ok).toBe(false);
  });

  it("does not use the interface language in that comparison", () => {
    expect(check({ uiLanguage: "es", targetLanguage: "es", mediationLanguage: "en" }).ok).toBe(true);
  });

  it("accepts right-to-left languages in either role", () => {
    expect(check({ mediationLanguage: "ar", targetLanguage: "he" }).ok).toBe(true);
    expect(check({ mediationLanguage: "he", targetLanguage: "ar" }).ok).toBe(true);
  });

  it("never lets the pseudo-RTL test locale into a stored profile", () => {
    expect(check({ uiLanguage: "ar-XB" }).ok).toBe(false);
  });
});
