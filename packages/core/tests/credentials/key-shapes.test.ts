import { describe, expect, it } from "vitest";
import {
  credentialIdsOfKey,
  findKeyShape,
  hasKeyShape,
  isKeyFor,
  KEY_SHAPES,
  maskKey,
  providerOfKey,
} from "../../src/credentials/key-shapes";

// Fake keys only: they match the shapes in data-model.md → KeyShape and are not real credentials.
const ANTHROPIC = "sk-ant-api03-FAKEFAKEFAKEFAKE-a1b2";
const GEMINI_STANDARD = "AIzaFAKEfakeFAKEfakeFAKEfakeFAKE-_0a1b2"; // AIza + 35
const GEMINI_AUTH = "AQ.FAKEfakeFAKEfakeFAKEfakeFAKEfakeFAKEfakeFAKE_-a1b2"; // AQ. + 49

describe("KEY_SHAPES", () => {
  it("maps each pattern to the set of credential ids it is valid for (005 data-model → KeyShape)", () => {
    expect(KEY_SHAPES.map((shape) => [...shape.credentialIds])).toEqual([["anthropic"], ["gemini", "youtube"], ["gemini"]]);
  });

  it("the fake keys used in tests have the documented lengths", () => {
    expect(GEMINI_STANDARD.length).toBe(4 + 35);
    expect(GEMINI_AUTH.length - 3).toBeGreaterThanOrEqual(30);
  });
});

describe("providerOfKey", () => {
  it.each([
    [ANTHROPIC, "anthropic"],
    [GEMINI_STANDARD, "gemini"],
    [GEMINI_AUTH, "gemini"],
    [`  ${GEMINI_AUTH}  `, "gemini"],
  ])("recognizes %s", (key, provider) => {
    expect(providerOfKey(key)).toBe(provider);
  });

  it.each([
    ["an unknown shape", "ollama"],
    ["a short AIza run", "AIzaSHORT"],
    ["a short AQ. run", "AQ.short"],
    ["AIza with one character too few", GEMINI_STANDARD.slice(0, -1)],
    ["a key inside a longer word", `x${GEMINI_STANDARD}`],
    ["empty", ""],
  ])("returns undefined for %s", (_name, key) => {
    expect(providerOfKey(key)).toBeUndefined();
  });
});

describe("maskKey", () => {
  it.each([
    [ANTHROPIC, "sk-ant-…a1b2"],
    [GEMINI_STANDARD, "AIza…a1b2"],
    [GEMINI_AUTH, "AQ.…a1b2"],
    ["some-unknown-key-a1b2", "…a1b2"],
  ])("masks %s as %s", (key, masked) => {
    expect(maskKey(key)).toBe(masked);
  });

  it("never contains the key", () => {
    for (const key of [ANTHROPIC, GEMINI_STANDARD, GEMINI_AUTH]) expect(maskKey(key)).not.toContain(key.slice(4, -4));
  });
});

describe("findKeyShape", () => {
  it.each([
    ["alone", GEMINI_AUTH, "gemini"],
    ["after an assignment", `GEMINI_API_KEY=${GEMINI_AUTH}`, "gemini"],
    ["after an assignment (standard key)", `key=${GEMINI_STANDARD}`, "gemini"],
    ["in an Anthropic assignment", `NAME=${ANTHROPIC}`, "anthropic"],
  ])("finds a key %s", (_name, token, provider) => {
    expect(findKeyShape(token)).toBe(provider);
  });

  it("finds nothing in ordinary words", () => {
    expect(findKeyShape("AQ.")).toBeUndefined();
    expect(findKeyShape("AIzawhat")).toBeUndefined();
    expect(findKeyShape("hello")).toBeUndefined();
  });
});

describe("credentialIdsOfKey and isKeyFor (005)", () => {
  it("an AIza key is valid for gemini and youtube", () => {
    expect(credentialIdsOfKey(GEMINI_STANDARD)).toEqual(["gemini", "youtube"]);
    expect(isKeyFor(GEMINI_STANDARD, "gemini")).toBe(true);
    expect(isKeyFor(GEMINI_STANDARD, "youtube")).toBe(true);
    expect(isKeyFor(GEMINI_STANDARD, "anthropic")).toBe(false);
  });

  it("an AQ. key is for gemini only, and an Anthropic key for anthropic only", () => {
    expect(credentialIdsOfKey(GEMINI_AUTH)).toEqual(["gemini"]);
    expect(isKeyFor(GEMINI_AUTH, "youtube")).toBe(false);
    expect(credentialIdsOfKey(ANTHROPIC)).toEqual(["anthropic"]);
    expect(isKeyFor(ANTHROPIC, "youtube")).toBe(false);
  });

  it("a key of unknown shape is not judged", () => {
    expect(credentialIdsOfKey("an-unknown-shape-1234")).toBeUndefined();
    expect(isKeyFor("an-unknown-shape-1234", "youtube")).toBe(true);
  });
});

describe("hasKeyShape", () => {
  it("is true for providers with a known key shape only", () => {
    expect(hasKeyShape("anthropic")).toBe(true);
    expect(hasKeyShape("gemini")).toBe(true);
    expect(hasKeyShape("youtube")).toBe(true);
    expect(hasKeyShape("mock")).toBe(false);
    expect(hasKeyShape("ollama")).toBe(false);
  });
});
