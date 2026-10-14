import { describe, expect, it } from "vitest";
import type { Message } from "../../src/conversation/types";
import type { SearchOutcome } from "../../src/ports/search";
import type { ExpiredResourceCard, ResourceCard } from "../../src/search/resource-card";
import { ResourceRetention, RETENTION_DAYS } from "../../src/search/retention";
import { SavedResourcesStore } from "../../src/search/saved-resources";
import { SearchBroker } from "../../src/search/search-broker";
import { SearchSettingsStore } from "../../src/search/search-settings";
import { createTestAbort } from "../helpers/scripted-provider";
import { MemoryCredentials } from "../helpers/memory-credentials";
import { makeClock, MemoryStorage } from "../helpers/memory-storage";
import { result, ScriptedSearchPort } from "../helpers/scripted-search";

// The 30-day rule (005 FR-021): YouTube data is not kept longer, in saved resources and in
// conversations alike. Refreshing fetches it again, once, by learner action.

const DAY = 86_400_000;
const FETCHED = "2026-09-01T00:00:00.000Z";
const at = (days: number) => new Date(Date.parse(FETCHED) + days * DAY).toISOString();

function card(overrides: Partial<ResourceCard> = {}): ResourceCard {
  return {
    ref: "r1",
    sourceId: "youtube",
    sourceDisplay: "YouTube (youtube.com)",
    externalId: "aaaaaaaaaaa",
    title: "Escalada",
    channel: "Club",
    durationSeconds: 100,
    hasCaptions: true,
    audioLanguage: "es",
    type: "video",
    priceLabel: "free",
    accessNote: null,
    sponsored: false,
    affiliate: false,
    link: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    fetchedAt: FETCHED,
    fitNote: "Good fit.",
    difficulty: "about_right",
    ...overrides,
  };
}

const message = (id: string, resources: ResourceCard[]): Message => ({
  id,
  conversationId: "c1",
  author: "assistant",
  segments: [{ trust: "untrusted", text: "Here." }],
  status: "complete",
  verdict: "accept",
  ruleIds: [],
  usageId: null,
  createdAt: FETCHED,
  resources,
});

async function setup(options: { consent?: boolean } = {}) {
  const storage = new MemoryStorage();
  const clock = { now: at(0) };
  const settings = new SearchSettingsStore({ storage, now: makeClock().now });
  if (options.consent !== false) await settings.recordConsent("youtube", "terms-1");
  const port = new ScriptedSearchPort("youtube", "terms-1");
  const broker = new SearchBroker({ ports: [port], settings, credentials: new MemoryCredentials({ youtube: "AIzaFAKEretentionKEY00000000000000000000" }) });
  const saved = new SavedResourcesStore({ storage, now: () => clock.now });
  const retention = new ResourceRetention({ storage, search: broker, now: () => clock.now });
  return { storage, clock, port, saved, retention, abort: createTestAbort() };
}

const expired = (c: ResourceCard): ExpiredResourceCard => ({ expired: true, sourceId: c.sourceId, externalId: c.externalId, fetchedAt: c.fetchedAt });

describe("ResourceRetention.purgeExpired", () => {
  it("is 30 days", () => {
    expect(RETENTION_DAYS).toBe(30);
  });

  it("keeps only the id, the source, the fetch time, and the expired mark, after 30 days, in conversations and saved items", async () => {
    const { storage, clock, saved, retention } = await setup();
    await storage.put("messages", message("m1", [card()]));
    await saved.save(card());
    clock.now = at(31);
    expect(await retention.purgeExpired()).toEqual({ messages: 1, saved: 1 });

    const stored = await storage.get<Message>("messages", "m1");
    expect(stored?.resources).toEqual([expired(card())]);
    const [savedCard] = await saved.list();
    expect(savedCard?.card).toEqual(expired(card()));
    expect(JSON.stringify(await storage.query("messages"))).not.toContain("Escalada");
    expect(JSON.stringify(await storage.query("saved_resources"))).not.toContain("Escalada");
  });

  it("leaves a card of exactly 30 days, and a fresh one, alone", async () => {
    const { storage, clock, retention } = await setup();
    await storage.put("messages", message("m1", [card({ fetchedAt: at(0) }), card({ externalId: "bbbbbbbbbbb", fetchedAt: at(10) })]));
    clock.now = at(30);
    expect(await retention.purgeExpired()).toEqual({ messages: 0, saved: 0 });
    expect((await storage.get<Message>("messages", "m1"))?.resources?.every((c) => !c.expired)).toBe(true);
  });

  it("expires only the old card of a message that has both", async () => {
    const { storage, clock, retention } = await setup();
    await storage.put("messages", message("m1", [card({ fetchedAt: at(0) }), card({ externalId: "bbbbbbbbbbb", fetchedAt: at(25) })]));
    clock.now = at(40);
    await retention.purgeExpired();
    const resources = (await storage.get<Message>("messages", "m1"))?.resources ?? [];
    expect(resources.map((c) => c.expired === true)).toEqual([true, false]);
  });

  it("is harmless to run twice, and touches messages without cards not at all", async () => {
    const { storage, clock, retention } = await setup();
    await storage.put("messages", message("m1", [card()]));
    await storage.put("messages", { ...message("m2", []), resources: undefined });
    clock.now = at(60);
    await retention.purgeExpired();
    expect(await retention.purgeExpired()).toEqual({ messages: 0, saved: 0 });
  });
});

describe("ResourceRetention.refresh", () => {
  async function expiredWorld() {
    const world = await setup();
    await world.storage.put("messages", message("m1", [card()]));
    await world.saved.save(card());
    world.clock.now = at(31);
    await world.retention.purgeExpired();
    return world;
  }

  it("asks the source once for that video and restores the source fields with a new fetch time, everywhere it is kept", async () => {
    const { port, retention, storage, saved, clock, abort } = await expiredWorld();
    port.enqueue({ ok: true, results: [result({ externalId: "aaaaaaaaaaa", title: "Escalada (updated)" })] });
    const outcome = await retention.refresh("youtube", "aaaaaaaaaaa", abort.signal);

    expect(port.detailsCalls).toEqual([["aaaaaaaaaaa"]]);
    expect(outcome.ok && outcome.card).toMatchObject({ title: "Escalada (updated)", externalId: "aaaaaaaaaaa", fetchedAt: "2026-10-14T12:00:00.000Z" });
    const inMessage = (await storage.get<Message>("messages", "m1"))?.resources?.[0];
    expect(inMessage).toMatchObject({ title: "Escalada (updated)" });
    expect(inMessage?.expired).not.toBe(true);
    expect((await saved.list())[0]?.card).toMatchObject({ title: "Escalada (updated)" });
    expect(clock.now).toBe(at(31));
  });

  it("keeps the card expired when the video is gone, with no retry", async () => {
    const { port, retention, storage, abort } = await expiredWorld();
    port.enqueue({ ok: true, results: [] });
    expect(await retention.refresh("youtube", "aaaaaaaaaaa", abort.signal)).toEqual({ ok: false, code: "not_found" });
    expect(port.detailsCalls).toHaveLength(1);
    expect((await storage.get<Message>("messages", "m1"))?.resources).toEqual([expired(card())]);
  });

  it("keeps the card expired when the source fails, and makes one request", async () => {
    const { port, retention, storage, abort } = await expiredWorld();
    port.enqueue({ ok: false, code: "quota_exhausted" } satisfies SearchOutcome);
    expect(await retention.refresh("youtube", "aaaaaaaaaaa", abort.signal)).toEqual({ ok: false, code: "quota_exhausted" });
    expect(port.detailsCalls).toHaveLength(1);
    expect((await storage.get<Message>("messages", "m1"))?.resources).toEqual([expired(card())]);
  });

  it("makes no request when search is not allowed", async () => {
    const world = await setup({ consent: false });
    await world.storage.put("messages", message("m1", [card()]));
    world.clock.now = at(31);
    await world.retention.purgeExpired();
    expect(await world.retention.refresh("youtube", "aaaaaaaaaaa", world.abort.signal)).toEqual({ ok: false, code: "no_consent" });
    expect(world.port.detailsCalls).toHaveLength(0);
  });
});
