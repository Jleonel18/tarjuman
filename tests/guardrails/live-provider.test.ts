import { unsealSecret } from "@tarjuman/core/adapter";
import { nonClaudeLabel } from "@tarjuman/testing/provenance";
import { describe, expect, it } from "vitest";
import { selectLiveProvider } from "../support/live-provider";

// No test here reads `.env`: every environment is a literal object.
const FAKE_KEY = "sk-ant-api03-SYNTHETIC-KEY-FOR-SELECTOR-TESTS-0003";

/** Stands in for `fetch`: answers `/api/version` and `/v1/models`, and records every URL. */
function fakeFetch(version: string | "fail" = "0.32.1") {
  const urls: string[] = [];
  const fetch = async (input: unknown): Promise<Response> => {
    const url = String(input);
    urls.push(url);
    if (version === "fail") throw new TypeError("Failed to fetch");
    if (url.endsWith("/api/version")) return Response.json({ version });
    if (url.endsWith("/v1/models")) return Response.json({ object: "list", data: [{ id: "gemma3:4b" }] });
    return new Response(null, { status: 404 });
  };
  return { fetch: fetch as typeof globalThis.fetch, urls };
}

describe("selectLiveProvider: Ollama (default)", () => {
  it("selects Ollama with gemma3:4b and non-Claude provenance when TARJUMAN_PROVIDER is unset", async () => {
    const { fetch } = fakeFetch();
    const selection = await selectLiveProvider({}, { fetch });
    expect(selection.provider.id).toBe("ollama");
    expect(selection.modelId).toBe("gemma3:4b");
    expect(selection.provenance).toEqual({
      providerId: "ollama",
      modelId: "gemma3:4b",
      runtimeVersion: "0.32.1",
      isClaude: false,
      label: nonClaudeLabel("gemma3:4b"),
    });
  });

  it("returns a handle holding the placeholder `ollama`", async () => {
    const selection = await selectLiveProvider({}, fakeFetch());
    expect(unsealSecret(selection.secret)).toBe("ollama");
  });

  it("honors OLLAMA_BASE_URL and OLLAMA_MODEL", async () => {
    const fake = fakeFetch();
    const selection = await selectLiveProvider(
      { OLLAMA_BASE_URL: "http://127.0.0.1:9999/", OLLAMA_MODEL: "gemma3:1b" },
      { fetch: fake.fetch },
    );
    expect(selection.modelId).toBe("gemma3:1b");
    expect(selection.provenance.label).toBe(nonClaudeLabel("gemma3:1b"));
    expect(fake.urls).toContain("http://127.0.0.1:9999/api/version");

    await selection.provider.validateCredential(selection.secret);
    expect(fake.urls).toContain("http://127.0.0.1:9999/v1/models");
  });

  it("records runtimeVersion as null when the version cannot be read", async () => {
    const selection = await selectLiveProvider({}, fakeFetch("fail"));
    expect(selection.provenance.runtimeVersion).toBeNull();
  });

  it("treats TARJUMAN_PROVIDER=ollama the same as unset", async () => {
    const selection = await selectLiveProvider({ TARJUMAN_PROVIDER: "ollama" }, fakeFetch());
    expect(selection.provider.id).toBe("ollama");
  });
});

describe("selectLiveProvider: Anthropic", () => {
  it("throws a message naming TARJUMAN_TEST_KEY when it is missing or empty", async () => {
    for (const env of [{ TARJUMAN_PROVIDER: "anthropic" }, { TARJUMAN_PROVIDER: "anthropic", TARJUMAN_TEST_KEY: "" }]) {
      await expect(selectLiveProvider(env, fakeFetch())).rejects.toThrow(/TARJUMAN_TEST_KEY/);
    }
  });

  it("seals the key, marks the provenance as Claude, and keeps the key out of the provenance", async () => {
    const fake = fakeFetch();
    const selection = await selectLiveProvider({ TARJUMAN_PROVIDER: "anthropic", TARJUMAN_TEST_KEY: FAKE_KEY }, fake);
    expect(selection.provider.id).toBe("anthropic");
    expect(unsealSecret(selection.secret)).toBe(FAKE_KEY);
    expect(selection.provenance).toMatchObject({ providerId: "anthropic", runtimeVersion: null, isClaude: true });
    expect(selection.provenance.label).toContain(selection.modelId);
    expect(JSON.stringify(selection.provenance)).not.toContain(FAKE_KEY);
    // No runtime version probe for a hosted provider.
    expect(fake.urls).toEqual([]);
  });
});

describe("selectLiveProvider: unknown provider", () => {
  it("throws listing the allowed values, without echoing other environment values", async () => {
    const failure = selectLiveProvider({ TARJUMAN_PROVIDER: "openai", TARJUMAN_TEST_KEY: FAKE_KEY }, fakeFetch());
    await expect(failure).rejects.toThrow(/ollama.*anthropic|anthropic.*ollama/);
    await expect(failure).rejects.not.toThrow(new RegExp(FAKE_KEY));
  });
});
