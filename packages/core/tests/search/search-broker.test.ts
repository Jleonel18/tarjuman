import { describe, expect, it } from "vitest";
import { SearchBroker } from "../../src/search/search-broker";
import { SearchSettingsStore } from "../../src/search/search-settings";
import { SEARCH_LIMITS } from "../../src/ports/search";
import { createTestAbort } from "../helpers/scripted-provider";
import { MemoryCredentials } from "../helpers/memory-credentials";
import { makeClock, MemoryStorage } from "../helpers/memory-storage";
import { result, results, ScriptedSearchPort } from "../helpers/scripted-search";

// The only holder of SearchPort (005 contracts/search-port.md → SearchBroker).
const KEY = "AIzaFAKEbrokerKEY0000000000000000000000";
const REQUEST = { query: "escalada deportiva", targetLanguage: "es", kind: "any" as const, captionsOnly: false };

async function setup(options: { enabled?: boolean; consent?: boolean; key?: boolean } = {}) {
  const storage = new MemoryStorage();
  const settings = new SearchSettingsStore({ storage, now: makeClock().now });
  const port = new ScriptedSearchPort("youtube", "terms-1");
  const credentials = new MemoryCredentials(options.key === false ? {} : { youtube: KEY });
  if (options.enabled === false) await settings.setEnabled(false);
  if (options.consent !== false) await settings.recordConsent("youtube", "terms-1");
  const broker = new SearchBroker({ ports: [port], settings, credentials });
  return { broker, port, settings, credentials, abort: createTestAbort() };
}

describe("SearchBroker.run", () => {
  it("makes no request when search is turned off", async () => {
    const { broker, port, abort, credentials } = await setup({ enabled: false });
    expect(await broker.run("youtube", REQUEST, abort.signal)).toEqual({ ok: false, code: "disabled" });
    expect(port.searches).toHaveLength(0);
    expect(credentials.loads).toHaveLength(0);
  });

  it("makes no request without consent for the current terms version", async () => {
    const { broker, port, abort, settings } = await setup({ consent: false });
    expect(await broker.run("youtube", REQUEST, abort.signal)).toEqual({ ok: false, code: "no_consent" });
    expect(port.searches).toHaveLength(0);
    // Consent for an older terms version does not count.
    await settings.recordConsent("youtube", "terms-0");
    expect(await broker.run("youtube", REQUEST, abort.signal)).toEqual({ ok: false, code: "no_consent" });
    expect(port.searches).toHaveLength(0);
  });

  it("answers invalid_credential when no key is stored, without calling the port", async () => {
    const { broker, port, abort } = await setup({ key: false });
    expect(await broker.run("youtube", REQUEST, abort.signal)).toEqual({ ok: false, code: "invalid_credential" });
    expect(port.searches).toHaveLength(0);
  });

  it("answers bad_request for an unknown source", async () => {
    const { broker, abort } = await setup();
    expect(await broker.run("vimeo", REQUEST, abort.signal)).toEqual({ ok: false, code: "bad_request" });
  });

  it("rejects an empty query, a query over 120 characters, and a query holding a key shape, with no request", async () => {
    const { broker, port, abort } = await setup();
    const queries = [
      "   ",
      "x".repeat(SEARCH_LIMITS.queryMax + 1),
      "videos sk-ant-api03-ABCDEFGHIJKLMNOP",
      "my key AIzaFAKEquerySHAPE0000000000000000000000",
      "AQ.FAKEqueryKEYSHAPE00000000000000000000",
    ];
    for (const query of queries) {
      expect(await broker.run("youtube", { ...REQUEST, query }, abort.signal), query).toEqual({ ok: false, code: "bad_request" });
    }
    expect(port.searches).toHaveLength(0);
  });

  it("accepts a query of exactly 120 characters and trims it", async () => {
    const { broker, port, abort } = await setup();
    const outcome = await broker.run("youtube", { ...REQUEST, query: `  ${"x".repeat(120)}  ` }, abort.signal);
    expect(outcome.ok).toBe(true);
    expect(port.searches[0]?.query).toBe("x".repeat(120));
  });

  it("sends only the request fields, with the app's result count, and the stored key", async () => {
    const { broker, port, abort } = await setup();
    await broker.run("youtube", { ...REQUEST, kind: "music", captionsOnly: true }, abort.signal);
    expect(port.searches[0]).toEqual({
      query: "escalada deportiva",
      targetLanguage: "es",
      kind: "music",
      captionsOnly: true,
      maxResults: SEARCH_LIMITS.resultsPerSearch,
    });
    expect(port.keysUsed).toEqual([KEY]);
  });

  it("returns the results in source order, without refs", async () => {
    const { broker, port, abort } = await setup();
    const found = results(3);
    port.enqueue({ ok: true, results: found });
    const outcome = await broker.run("youtube", REQUEST, abort.signal);
    expect(outcome).toEqual({ ok: true, results: found });
    if (outcome.ok) for (const r of outcome.results) expect(r).not.toHaveProperty("ref");
  });

  it("never retries: a failing port is called once", async () => {
    const { broker, port, abort } = await setup();
    port.enqueue({ ok: false, code: "rate_limited" });
    expect(await broker.run("youtube", REQUEST, abort.signal)).toEqual({ ok: false, code: "rate_limited" });
    expect(port.searches).toHaveLength(1);
  });

  it("turns a throwing port into a network failure instead of throwing", async () => {
    const { broker, port, abort } = await setup();
    port.search = async () => {
      throw new Error(`boom ${KEY}`);
    };
    const outcome = await broker.run("youtube", REQUEST, abort.signal);
    expect(outcome).toEqual({ ok: false, code: "network" });
    expect(JSON.stringify(outcome)).not.toContain(KEY);
  });

  it("drops results with a bad id and caps oversized fields (the core does not trust the adapter)", async () => {
    const { broker, port, abort } = await setup();
    port.enqueue({
      ok: true,
      results: [
        result({ externalId: "x/../../y?z=1&" }),
        result({ externalId: "short" }),
        result({ title: "T".repeat(999), channel: "C".repeat(999), descriptionExcerpt: "D".repeat(999) }),
      ],
    });
    const outcome = await broker.run("youtube", REQUEST, abort.signal);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0]?.title).toHaveLength(SEARCH_LIMITS.titleMax);
    expect(outcome.results[0]?.channel).toHaveLength(SEARCH_LIMITS.channelMax);
    expect(outcome.results[0]?.descriptionExcerpt).toHaveLength(SEARCH_LIMITS.descriptionExcerptMax);
  });

  it("withholds key-shaped text in result fields and forces the source id", async () => {
    const { broker, port, abort } = await setup();
    port.enqueue({
      ok: true,
      results: [result({ sourceId: "other", descriptionExcerpt: "use AIzaFAKEhostileKEY000000000000000000000 now" })],
    });
    const outcome = await broker.run("youtube", REQUEST, abort.signal);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.results[0]?.sourceId).toBe("youtube");
    expect(outcome.results[0]?.descriptionExcerpt).not.toContain("AIza");
  });

  it("never lets the stored key reach the outcome", async () => {
    const { broker, port, abort } = await setup();
    port.enqueue({ ok: true, results: [result({ title: `leak ${KEY}` })] });
    const outcome = await broker.run("youtube", REQUEST, abort.signal);
    expect(JSON.stringify(outcome)).not.toContain(KEY);
  });
});

describe("SearchBroker.details (card refresh)", () => {
  it("checks the switch and consent like a search, and calls the port once with the ids", async () => {
    const off = await setup({ enabled: false });
    expect(await off.broker.details("youtube", ["aaaaaaaaaaa"], off.abort.signal)).toEqual({ ok: false, code: "disabled" });
    const noConsent = await setup({ consent: false });
    expect(await noConsent.broker.details("youtube", ["aaaaaaaaaaa"], noConsent.abort.signal)).toEqual({
      ok: false,
      code: "no_consent",
    });
    const { broker, port, abort } = await setup();
    const outcome = await broker.details("youtube", ["aaaaaaaaaaa", "bbbbbbbbbbb"], abort.signal);
    expect(outcome.ok).toBe(true);
    expect(port.detailsCalls).toEqual([["aaaaaaaaaaa", "bbbbbbbbbbb"]]);
  });

  it("rejects ids that are not video ids, with no request", async () => {
    const { broker, port, abort } = await setup();
    expect(await broker.details("youtube", ["not an id"], abort.signal)).toEqual({ ok: false, code: "bad_request" });
    expect(await broker.details("youtube", [], abort.signal)).toEqual({ ok: false, code: "bad_request" });
    expect(port.detailsCalls).toHaveLength(0);
  });
});

describe("SearchBroker.termsVersion", () => {
  it("exposes the terms version of a source, for the consent dialog", async () => {
    const { broker } = await setup();
    expect(broker.termsVersionOf("youtube")).toBe("terms-1");
    expect(broker.termsVersionOf("vimeo")).toBeUndefined();
  });
});
