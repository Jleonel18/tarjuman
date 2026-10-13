import { describe, expect, it } from "vitest";
import type { Capability } from "../../src/capabilities/types";
import { ContextAssembler } from "../../src/pipeline/context-assembler";
import type { LayerId } from "../../src/ports/provider";
import { DEFAULT_TONE_ID, type LearnerProfile } from "../../src/profile/types";
import { TONE_PRESETS, getTonePreset } from "../../src/profile/tone-presets";

const PROFILE: LearnerProfile = {
  id: "profile",
  uiLanguage: "en",
  mediationLanguage: "es",
  targetLanguage: "ja",
  level: "B1",
  interests: ["cooking"],
  toneId: "neutral",
  configuredEffort: "medium",
  modelId: "claude-sonnet-5-5",
  createdAt: "2026-10-13T00:00:00.000Z",
  updatedAt: "2026-10-13T00:00:00.000Z",
};

const CAPABILITY: Capability = {
  id: "language-qa",
  version: "1.0.0",
  contractVersion: "1.0.0",
  tools: [],
  permissions: [],
  domainRules: [],
  promptFragments: { vocabulary: { layer: "capability", text: { en: "CAPABILITY-FRAGMENT" } } },
  i18n: {},
};

const assembler = new ContextAssembler();

function assemble(toneId: string) {
  return assembler.assemble({
    profile: { ...PROFILE, toneId },
    capability: CAPABILITY,
    domainScope: "DOMAIN-SCOPE-TEXT",
    history: [],
    turn: { userText: "What does 食べる mean?" },
  });
}

function text(result: ReturnType<typeof assemble>, id: LayerId): string | undefined {
  return result.layers.find((l) => l.id === id)?.text;
}

describe("tone presets", () => {
  it("offers warm, neutral and formal, each with an id, a name key and guidance", () => {
    expect(TONE_PRESETS.map((p) => p.id)).toEqual(["warm", "neutral", "formal"]);
    for (const preset of TONE_PRESETS) {
      expect(preset.nameKey).toBe(`tone.${preset.id}`);
      expect(preset.guidance.trim().length).toBeGreaterThan(0);
    }
  });

  it("defaults to neutral, also for an unknown or stale id", () => {
    expect(DEFAULT_TONE_ID).toBe("neutral");
    expect(getTonePreset("warm").id).toBe("warm");
    expect(getTonePreset("no-such-tone").id).toBe("neutral");
    expect(getTonePreset("").id).toBe("neutral");
  });

  it("has guidance about style only: it never mentions scope, rules or permissions", () => {
    for (const preset of TONE_PRESETS) {
      expect(preset.guidance).toMatch(/style only/i);
      expect(preset.guidance).not.toMatch(/ignore|override|no restrictions|any topic/i);
    }
  });
});

describe("tone layer in the assembled prompt", () => {
  it("reads the tone from the profile's toneId", () => {
    for (const preset of TONE_PRESETS) {
      expect(text(assemble(preset.id), "tone")).toBe(preset.guidance);
    }
  });

  it("falls back to neutral for an unknown toneId", () => {
    expect(text(assemble("bogus"), "tone")).toBe(getTonePreset("neutral").guidance);
  });

  it("sits below the capability layer and above user preferences", () => {
    const ids = assemble("warm").layers.map((l) => l.id);
    expect(ids).toEqual(["security", "domain_scope", "capability", "tone", "user_preferences"]);
  });

  it("puts the tone text only in the tone layer", () => {
    for (const preset of TONE_PRESETS) {
      const result = assemble(preset.id);
      for (const layer of result.layers) {
        if (layer.id !== "tone") expect(layer.text, `${preset.id} leaked into ${layer.id}`).not.toContain(preset.guidance);
      }
      expect(JSON.stringify(result.messages)).not.toContain(preset.guidance);
    }
  });

  it("changes no other layer and no message when the tone changes", () => {
    const base = assemble("neutral");
    for (const id of ["warm", "formal"]) {
      const other = assemble(id);
      expect(other.layers.filter((l) => l.id !== "tone")).toEqual(base.layers.filter((l) => l.id !== "tone"));
      expect(other.messages).toEqual(base.messages);
      expect(text(other, "tone")).not.toBe(text(base, "tone"));
    }
  });
});
