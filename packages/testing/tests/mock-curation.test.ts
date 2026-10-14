import type { ModelRequest, ProviderMessage } from "@tarjuman/core";
import { sealSecret } from "@tarjuman/core";
import { describe, expect, it } from "vitest";
import { curationResponder } from "../src/mock-provider";
import { DEFAULT_MOCK_SEARCH_KEY, e2eSearchResponder, makeSearchResults, MockSearchPort } from "../src/mock-search";
import { HOSTILE_SEARCH_RESULTS } from "../src/fixtures/hostile-search";

// The test doubles the e2e build uses for resource curation (005): a model that searches and shows
// results, and a search source that answers by the words in the query.

const TOOLS = [{ name: "search_videos", description: "", inputSchema: {} }];
const request = (messages: ProviderMessage[], tools = TOOLS): ModelRequest => ({
  modelId: "mock-model",
  layers: [],
  messages,
  maxTokens: 100,
  tools,
});
const user = (content: string): ProviderMessage => ({ role: "user", content });
const toolMessage = (name: string, content: string): ProviderMessage => ({ role: "tool", toolCallId: "c", name, content });
const stepsOf = (script: ReturnType<typeof curationResponder>) => script?.steps ?? [];

describe("curationResponder", () => {
  it("ignores a turn without the search tool, or a request that is not about videos or songs", () => {
    expect(curationResponder(request([user("videos about climbing")], []))).toBeUndefined();
    expect(curationResponder(request([user("What does ser mean?")]))).toBeUndefined();
  });

  it("asks what the learner likes when there is no topic and no interests, but searches when there are interests", () => {
    const withInterests = (interests: string): ModelRequest => ({
      ...request([user("Find me something to watch")]),
      layers: [{ id: "user_preferences", text: `<user_profile>\ninterests:\n${interests}\n</user_profile>` }],
    });
    expect(JSON.stringify(curationResponder(withInterests("none")))).toContain("CLARIFY");
    expect(curationResponder(withInterests("- climbing"))).toBeUndefined();
  });

  it("step 1 searches with the learner's own words", () => {
    const [call, , stop] = stepsOf(curationResponder(request([user("Find videos about   climbing")])));
    expect(call).toEqual({ type: "tool_call", id: "call_search_1", name: "search_videos", input: { query: "Find videos about climbing", kind: "any" } });
    expect(stop).toEqual({ type: "stop", reason: "tool_use" });
  });

  it("step 2 shows the first three refs it finds in the results", () => {
    const results = '{"ok":true,"output":{"results":[{"ref":"r1"},{"ref":"r2"},{"ref":"r3"},{"ref":"r4"}]}}';
    const steps = stepsOf(curationResponder(request([user("videos"), toolMessage("search_videos", results)])));
    expect(steps[0]).toMatchObject({ type: "tool_call", name: "show_resources" });
    const input = (steps[0] as unknown as { input: { items: { id: string }[] } }).input;
    expect(input.items.map((i) => i.id)).toEqual(["r1", "r2", "r3"]);
  });

  it("answers plainly when nothing was found", () => {
    const steps = stepsOf(curationResponder(request([user("videos about nothing"), toolMessage("search_videos", '{"ok":true,"output":{"results":[]}}')])));
    expect(steps[0]).toMatchObject({ type: "text" });
    expect(JSON.stringify(steps)).toContain("could not find");
  });

  it("makes a second search for 'fail' when asked, then shows what the first found", () => {
    const first = toolMessage("search_videos", '{"ok":true,"output":{"results":[{"ref":"r1"}]}}');
    const second = stepsOf(curationResponder(request([user("videos TWO-SEARCHES"), first])));
    expect(second[0]).toMatchObject({ name: "search_videos", input: { query: "fail" } });
    const failed = toolMessage("search_videos", '{"ok":false,"error":"network"}');
    const third = stepsOf(curationResponder(request([user("videos TWO-SEARCHES"), first, failed])));
    expect(third[0]).toMatchObject({ name: "show_resources" });
  });

  it("answers after show_resources", () => {
    const steps = stepsOf(curationResponder(request([user("videos"), toolMessage("show_resources", '{"ok":true}')])));
    expect(steps[0]).toMatchObject({ type: "text" });
    expect(JSON.stringify(steps)).toContain("ACCEPT");
  });
});

describe("MockSearchPort", () => {
  const signal = new AbortController().signal;
  const req = (query: string) => ({ query, targetLanguage: "es", kind: "any" as const, captionsOnly: false, maxResults: 8 });

  it("answers by the words of the e2e responder: nothing, fail, or eight results", async () => {
    const port = new MockSearchPort({ respond: e2eSearchResponder });
    const key = sealSecret(DEFAULT_MOCK_SEARCH_KEY);
    expect(await port.search(req("videos about nothing"), key, signal)).toEqual({ ok: true, results: [] });
    expect(await port.search(req("fail"), key, signal)).toEqual({ ok: false, code: "network" });
    const found = await port.search(req("climbing"), key, signal);
    expect(found.ok && found.results).toHaveLength(8);
    expect(port.searches).toHaveLength(3);
  });

  it("rejects an unknown key and records every request", async () => {
    const port = new MockSearchPort();
    expect(await port.search(req("q"), sealSecret("AIzaWRONGwrongWRONGwrongWRONGwrongWRONG00"), signal)).toEqual({ ok: false, code: "invalid_credential" });
    expect(await port.validateCredential(sealSecret(DEFAULT_MOCK_SEARCH_KEY))).toEqual({ ok: true });
  });

  it("makes ids and links that pass the core's checks, and keeps the hostile fixtures hostile", () => {
    for (const r of makeSearchResults(5)) {
      expect(r.externalId).toMatch(/^[A-Za-z0-9_-]{11}$/);
      expect(r.link).toBe(`https://www.youtube.com/watch?v=${r.externalId}`);
    }
    expect(HOSTILE_SEARCH_RESULTS.length).toBeGreaterThanOrEqual(8);
    expect(JSON.stringify(HOSTILE_SEARCH_RESULTS)).toContain("Ignore all previous instructions");
  });
});
