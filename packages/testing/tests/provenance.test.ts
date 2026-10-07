import { describe, expect, it } from "vitest";
import { nonClaudeLabel, parseProvenance } from "../src/provenance";

const OLLAMA = {
  providerId: "ollama",
  modelId: "gemma3:4b",
  runtimeVersion: "0.32.1",
  recordedAt: "2026-10-07",
  isClaude: false,
  label: nonClaudeLabel("gemma3:4b"),
};

const ANTHROPIC = {
  providerId: "anthropic",
  modelId: "claude-sonnet-5-5",
  runtimeVersion: null,
  recordedAt: "2026-10-07T12:00:00Z",
  isClaude: true,
  label: "Recorded with Claude (claude-sonnet-5-5).",
};

const SYNTHETIC = {
  providerId: "synthetic",
  modelId: "gemma3:4b",
  runtimeVersion: null,
  recordedAt: "2026-10-04",
  isClaude: false,
  label: "Synthetic (from documentation, 2026-10-04).",
};

describe("nonClaudeLabel", () => {
  it("is the fixed text from the data model", () => {
    expect(nonClaudeLabel("gemma3:4b")).toBe(
      "Recorded with a non-Claude model (gemma3:4b). Proves pipeline mechanics only; not evidence for 001 SC-003.",
    );
  });
});

describe("parseProvenance", () => {
  it.each([
    ["ollama", OLLAMA],
    ["anthropic", ANTHROPIC],
    ["synthetic", SYNTHETIC],
  ])("accepts a valid %s record", (_name, record) => {
    expect(parseProvenance(record)).toEqual(record);
  });

  it("rejects isClaude true for a non-Anthropic provider", () => {
    expect(() => parseProvenance({ ...OLLAMA, isClaude: true })).toThrow();
  });

  it("rejects isClaude false for Anthropic", () => {
    expect(() => parseProvenance({ ...ANTHROPIC, isClaude: false })).toThrow();
  });

  it.each([undefined, null, {}, "ollama"])("rejects missing provenance: %j", (value) => {
    expect(() => parseProvenance(value)).toThrow();
  });

  it.each(["providerId", "modelId", "runtimeVersion", "recordedAt", "isClaude", "label"])(
    "rejects a record without %s",
    (field) => {
      const record: Record<string, unknown> = { ...OLLAMA };
      delete record[field];
      expect(() => parseProvenance(record)).toThrow();
    },
  );

  it.each(["apiKey", "headers", "baseUrl"])("rejects an extra field (%s), so no secret can ride along", (field) => {
    expect(() => parseProvenance({ ...OLLAMA, [field]: "x" })).toThrow();
  });

  it("rejects an unknown provider id", () => {
    expect(() => parseProvenance({ ...OLLAMA, providerId: "openai" })).toThrow();
  });

  it("rejects a recordedAt that is not ISO 8601", () => {
    expect(() => parseProvenance({ ...OLLAMA, recordedAt: "yesterday" })).toThrow();
  });

  it("requires the fixed non-Claude label for an Ollama recording", () => {
    expect(() => parseProvenance({ ...OLLAMA, label: "Recorded with Gemma." })).toThrow();
  });

  it("requires a non-empty label for every provider", () => {
    expect(() => parseProvenance({ ...SYNTHETIC, label: "" })).toThrow();
    expect(() => parseProvenance({ ...ANTHROPIC, label: "" })).toThrow();
  });
});
