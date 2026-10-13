import { describe, expect, it } from "vitest";
import {
  extractRequestFeatures,
  recommendEffort,
  type RequestFeatures,
} from "../../src/stats/recommend-effort";

const base: RequestFeatures = {
  messageLength: 20,
  subQuestionCount: 1,
  hasPastedMaterial: false,
  requestType: "lookup",
};

describe("recommendEffort", () => {
  it("recommends low for short vocabulary and pronunciation lookups", () => {
    expect(recommendEffort({ ...base, requestType: "lookup" })).toBe("low");
    expect(recommendEffort({ ...base, requestType: "pronunciation" })).toBe("low");
  });

  it("recommends medium for grammar explanations and usage contrasts", () => {
    const features = { ...base, messageLength: 120 };
    expect(recommendEffort({ ...features, requestType: "grammar" })).toBe("medium");
    expect(recommendEffort({ ...features, requestType: "contrast" })).toBe("medium");
  });

  it("recommends high for multi-part analysis", () => {
    expect(
      recommendEffort({ ...base, messageLength: 400, subQuestionCount: 4, requestType: "analysis" }),
    ).toBe("high");
  });

  it("recommends high for a long translation that needs an explanation", () => {
    expect(
      recommendEffort({
        messageLength: 1800,
        subQuestionCount: 1,
        hasPastedMaterial: true,
        requestType: "translation",
      }),
    ).toBe("high");
  });

  it("does not recommend low for a lookup that has grown into several questions", () => {
    expect(recommendEffort({ ...base, subQuestionCount: 4 })).not.toBe("low");
  });

  it("only ever recommends the three levels v1 exposes", () => {
    const types = ["lookup", "pronunciation", "grammar", "contrast", "translation", "analysis"] as const;
    for (const requestType of types) {
      for (const messageLength of [0, 50, 500, 5000]) {
        for (const subQuestionCount of [0, 1, 3, 8]) {
          for (const hasPastedMaterial of [false, true]) {
            const effort = recommendEffort({ messageLength, subQuestionCount, hasPastedMaterial, requestType });
            expect(["low", "medium", "high"]).toContain(effort);
          }
        }
      }
    }
  });

  it("is pure and deterministic: the same features give the same answer and are not mutated", () => {
    const features: RequestFeatures = { ...base, requestType: "grammar", messageLength: 300 };
    const copy = JSON.parse(JSON.stringify(features)) as RequestFeatures;
    const first = recommendEffort(features);
    for (let i = 0; i < 5; i++) expect(recommendEffort(features)).toBe(first);
    expect(features).toEqual(copy);
  });
});

describe("extractRequestFeatures", () => {
  it("measures the message length", () => {
    expect(extractRequestFeatures({ userText: "hola" }).messageLength).toBe(4);
  });

  it("counts sub-questions in English, Spanish and Arabic punctuation", () => {
    expect(extractRequestFeatures({ userText: "What is ser? And estar? Which one here?" }).subQuestionCount).toBe(3);
    expect(extractRequestFeatures({ userText: "¿Qué es ser? ¿Y estar?" }).subQuestionCount).toBe(2);
    expect(extractRequestFeatures({ userText: "ما معنى هذا؟ ولماذا؟" }).subQuestionCount).toBe(2);
  });

  it("counts a question-less request as one question", () => {
    expect(extractRequestFeatures({ userText: "Explain the subjunctive" }).subQuestionCount).toBe(1);
  });

  it("detects pasted material and counts it in the length", () => {
    const features = extractRequestFeatures({
      userText: "Translate this",
      untrustedMaterial: [{ source: "user_paste", text: "x".repeat(1000) }],
    });
    expect(features.hasPastedMaterial).toBe(true);
    expect(features.messageLength).toBe("Translate this".length + 1000);
  });

  it("reports no pasted material when there is none", () => {
    expect(extractRequestFeatures({ userText: "hi" }).hasPastedMaterial).toBe(false);
  });

  it("is deterministic and makes no model call: it is a plain synchronous function", () => {
    const turn = { userText: "What does ser mean?" };
    expect(extractRequestFeatures(turn)).toEqual(extractRequestFeatures(turn));
  });
});
