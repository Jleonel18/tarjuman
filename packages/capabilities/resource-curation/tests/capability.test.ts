import {
  CapabilityRegistry,
  ContextAssembler,
  type LearnerProfile,
  type SearchState,
  type ToolContext,
  type ToolSearchOutcome,
} from "@tarjuman/core";
import { describe, expect, it } from "vitest";
import resourceCuration from "../src/index";

const PROFILE: LearnerProfile = {
  id: "profile",
  uiLanguage: "en",
  mediationLanguage: "es",
  targetLanguage: "ja",
  level: "B1",
  interests: ["escalada"],
  toneId: "neutral",
  configuredEffort: "medium",
  providerId: "gemini",
  modelId: "gemini-3.8-flash",
  createdAt: "2026-10-14T00:00:00.000Z",
  updatedAt: "2026-10-14T00:00:00.000Z",
};

const tool = (name: string) => {
  const found = resourceCuration.tools.find((t) => t.name === name);
  if (!found) throw new Error(`no tool ${name}`);
  return found;
};

/** A ToolContext whose search records what it was asked and answers with `outcome`. */
function context(outcome: ToolSearchOutcome) {
  const asked: unknown[] = [];
  const ctx = {
    capabilityId: "resource-curation",
    search: {
      videos: async (req: unknown) => {
        asked.push(req);
        return outcome;
      },
    },
  } as unknown as ToolContext;
  return { ctx, asked };
}

const FOUND: ToolSearchOutcome = {
  ok: true,
  results: [
    {
      ref: "r1",
      title: "Escalada",
      channel: "Club",
      descriptionExcerpt: "Intro.",
      durationSeconds: 120,
      hasCaptions: true,
      audioLanguage: "es",
      type: "video",
    },
  ],
};

describe("resource-curation capability", () => {
  it("registers under contract 1.1.0, available in every conversation, with only the YouTube search permission", () => {
    const registered = new CapabilityRegistry().register(resourceCuration);
    expect(registered.id).toBe("resource-curation");
    expect(registered.contractVersion).toBe("1.1.0");
    expect(registered.availability).toBe("all_conversations");
    expect(registered.permissions).toEqual([{ kind: "search", sources: ["youtube"] }]);
    expect(registered.tools.map((t) => t.name)).toEqual(["search_videos", "show_resources"]);
  });

  it("registers next to language-qa without changing it", async () => {
    const { default: languageQa } = await import("../../language-qa/src/index");
    const registry = new CapabilityRegistry();
    registry.register(languageQa);
    registry.register(resourceCuration);
    expect(registry.forTurn("language-qa").map((c) => c.id)).toEqual(["language-qa", "resource-curation"]);
  });
});

describe("search_videos", () => {
  const schema = tool("search_videos").inputSchema as {
    additionalProperties: unknown;
    required: string[];
    properties: Record<string, Record<string, unknown>>;
  };

  it("has a strict schema: query 1–120 characters, kind any|music, captionsOnly optional", () => {
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["query", "kind"]);
    expect(schema.properties["query"]).toMatchObject({ type: "string", minLength: 1, maxLength: 120 });
    expect(schema.properties["kind"]).toMatchObject({ type: "string", enum: ["any", "music"] });
    expect(schema.properties["captionsOnly"]).toMatchObject({ type: "boolean" });
  });

  it("needs the search permission, has no side effects, and is described in English and Spanish", () => {
    const t = tool("search_videos");
    expect(t.requiredPermissions).toEqual([{ kind: "search", sources: ["youtube"] }]);
    expect(t.sideEffecting).toBe(false);
    expect(t.presentation).toBeUndefined();
    expect(Object.keys(t.description).sort()).toEqual(["en", "es"]);
  });

  it("calls ctx.search.videos with the trimmed query and returns the results, which carry no links", async () => {
    const { ctx, asked } = context(FOUND);
    const outcome = await tool("search_videos").handler?.({ query: "  escalada deportiva ", kind: "music", captionsOnly: true }, ctx);
    expect(asked).toEqual([{ query: "escalada deportiva", kind: "music", captionsOnly: true }]);
    expect(outcome).toEqual({ ok: true, output: { results: FOUND.ok ? FOUND.results : [] } });
    expect(JSON.stringify(outcome)).not.toMatch(/https?:|link/);
  });

  it("defaults captionsOnly to false", async () => {
    const { ctx, asked } = context(FOUND);
    await tool("search_videos").handler?.({ query: "q", kind: "any" }, ctx);
    expect(asked).toEqual([{ query: "q", kind: "any", captionsOnly: false }]);
  });

  it.each([
    ["no input", undefined],
    ["a string", "escalada"],
    ["an empty query", { query: "   ", kind: "any" }],
    ["a long query", { query: "x".repeat(121), kind: "any" }],
    ["a missing kind", { query: "q" }],
    ["an unknown kind", { query: "q", kind: "podcast" }],
    ["a non-boolean captionsOnly", { query: "q", kind: "any", captionsOnly: "yes" }],
    ["an extra field", { query: "q", kind: "any", targetLanguage: "xx" }],
    ["a non-string query", { query: 3, kind: "any" }],
  ])("rejects %s without calling the search", async (_name, input) => {
    const { ctx, asked } = context(FOUND);
    expect(await tool("search_videos").handler?.(input, ctx)).toEqual({ ok: false, error: "bad_input" });
    expect(asked).toEqual([]);
  });

  it("passes a failed search on as an error result", async () => {
    const { ctx } = context({ ok: false, error: "quota_exhausted" });
    expect(await tool("search_videos").handler?.({ query: "q", kind: "any" }, ctx)).toEqual({ ok: false, error: "quota_exhausted" });
  });
});

describe("show_resources", () => {
  const t = tool("show_resources");
  const schema = t.inputSchema as {
    additionalProperties: unknown;
    required: string[];
    properties: { items: { type: string; minItems: number; maxItems: number; items: { required: string[]; additionalProperties: unknown; properties: Record<string, Record<string, unknown>> } } };
  };

  it("is a presentation tool: no handler, no permissions, no side effects", () => {
    expect(t.presentation).toBe("resources");
    expect(t.handler).toBeUndefined();
    expect(t.requiredPermissions).toEqual([]);
    expect(t.sideEffecting).toBe(false);
  });

  it("takes 1–10 items of id (r + digits), fitNote (1–300), difficulty, and an optional interest", () => {
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["items"]);
    const items = schema.properties.items;
    expect(items).toMatchObject({ type: "array", minItems: 1, maxItems: 10 });
    expect(items.items.additionalProperties).toBe(false);
    expect(items.items.required).toEqual(["id", "fitNote", "difficulty"]);
    expect(items.items.properties["id"]).toMatchObject({ type: "string", pattern: "^r\\d+$" });
    expect(items.items.properties["fitNote"]).toMatchObject({ type: "string", minLength: 1, maxLength: 300 });
    expect(items.items.properties["difficulty"]).toMatchObject({ enum: ["easier", "about_right", "harder", "unknown"] });
    expect(items.items.properties["interest"]).toMatchObject({ type: "string" });
  });
});

describe("prompt fragments", () => {
  const assemble = (searchState?: SearchState) =>
    new ContextAssembler()
      .assemble({ profile: PROFILE, capability: resourceCuration, history: [], turn: { userText: "hola" }, ...(searchState && { searchState }) })
      .layers.find((l) => l.id === "capability")?.text ?? "";

  it("only targets the capability layer", () => {
    expect(Object.values(resourceCuration.promptFragments).every((f) => f.layer === "capability")).toBe(true);
  });

  it("tells the model how to search when search is available", () => {
    const text = assemble("available").toLowerCase();
    for (const phrase of [
      "target language",
      "at most two searches",
      "show_resources",
      "same order",
      "do not repeat the titles",
      "never write links",
      "never invent",
      "two lines",
      "interests",
    ]) {
      expect(text, phrase).toContain(phrase);
    }
  });

  it.each([
    ["off", "turned off"],
    ["no_key", "no search key"],
    ["model_cannot_search", "cannot search"],
  ] as const)("says why search is unavailable when the state is %s, and offers no search instructions", (state, reason) => {
    const text = assemble(state).toLowerCase();
    expect(text).toContain(reason);
    expect(text).toContain("do not recommend specific videos");
    expect(text).not.toContain("show_resources");
  });

  it("says nothing about search when the state is unknown", () => {
    expect(assemble()).toBe("");
  });
});

describe("i18n", () => {
  it("has the same keys in English and Spanish, all in the capability's namespace", () => {
    const en = Object.keys(resourceCuration.i18n["en"] ?? {}).sort();
    const es = Object.keys(resourceCuration.i18n["es"] ?? {}).sort();
    expect(en.length).toBeGreaterThan(0);
    expect(es).toEqual(en);
    for (const key of en) expect(key.startsWith("capability.resource-curation.")).toBe(true);
  });
});
