import { CapabilityRegistry, ContextAssembler, type LearnerProfile } from "@tarjuman/core";
import { describe, expect, it } from "vitest";
import languageQa from "../src/index";

const PROFILE: LearnerProfile = {
  id: "profile",
  uiLanguage: "en",
  mediationLanguage: "es",
  targetLanguage: "ja",
  level: "A2",
  interests: ["cooking"],
  toneId: "neutral",
  configuredEffort: "medium",
  modelId: "claude-sonnet-5-5",
  createdAt: "2026-10-03T00:00:00.000Z",
  updatedAt: "2026-10-03T00:00:00.000Z",
};

describe("language-qa capability", () => {
  it("passes registry validation and declares no tools and no permissions", () => {
    const registered = new CapabilityRegistry().register(languageQa);
    expect(registered.id).toBe("language-qa");
    expect(registered.tools).toEqual([]);
    expect(registered.permissions).toEqual([]);
  });

  it("covers the five question areas with fragments in the capability layer only", () => {
    const fragments = Object.values(languageQa.promptFragments);
    expect(fragments.every((f) => f.layer === "capability")).toBe(true);
    const text = fragments.map((f) => f.text["en"] ?? "").join("\n").toLowerCase();
    for (const topic of ["vocabulary", "grammar", "usage", "pronunciation", "culture"]) {
      expect(text).toContain(topic);
    }
    expect(text).toContain("uncertain");
    expect(text).toContain("clarifying question");
  });

  it("sends the level and interests instruction in the assembled capability layer", () => {
    const { layers } = new ContextAssembler().assemble({
      profile: PROFILE,
      capability: languageQa,
      history: [],
      turn: { userText: "How do I say 'web page' in Japanese?" },
    });
    const capabilityLayer = layers.find((l) => l.id === "capability")?.text ?? "";
    expect(capabilityLayer).toMatch(/level/i);
    expect(capabilityLayer).toMatch(/interests/i);
    expect(capabilityLayer).toMatch(/user_profile/);
  });

  it("keeps UI strings under its own namespace in en and es with the same keys", () => {
    const en = Object.keys(languageQa.i18n["en"] ?? {}).sort();
    const es = Object.keys(languageQa.i18n["es"] ?? {}).sort();
    expect(en.length).toBeGreaterThan(0);
    expect(es).toEqual(en);
    expect(en.every((k) => k.startsWith("capability.language-qa."))).toBe(true);
  });
});
