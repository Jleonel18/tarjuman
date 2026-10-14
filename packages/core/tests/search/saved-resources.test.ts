import { describe, expect, it } from "vitest";
import { CapabilityRegistry, CapabilityRegistrationError } from "../../src/capabilities/registry";
import type { ResourceCard } from "../../src/search/resource-card";
import { SavedResourcesStore, savedId } from "../../src/search/saved-resources";
import { makeClock, MemoryStorage } from "../helpers/memory-storage";

// Saved resources (005 US4): an explicit click saves a card with the labels it had; nothing a tool
// does can save one.

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
    sponsored: true,
    affiliate: false,
    link: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    fetchedAt: "2026-10-14T00:00:00.000Z",
    fitNote: "Good fit.",
    difficulty: "harder",
    interest: "climbing",
    ...overrides,
  };
}

function setup() {
  const storage = new MemoryStorage();
  return { storage, store: new SavedResourcesStore({ storage, now: makeClock().now }) };
}

describe("SavedResourcesStore", () => {
  it("identifies a resource by source and external id", () => {
    expect(savedId({ sourceId: "youtube", externalId: "aaaaaaaaaaa" })).toBe("youtube:aaaaaaaaaaa");
  });

  it("keeps the labels the card had when it was found (US4-3)", async () => {
    const { store } = setup();
    await store.save(card());
    const [saved] = await store.list();
    expect(saved?.card).toEqual(card());
    expect(saved?.card).toMatchObject({ sponsored: true, difficulty: "harder", interest: "climbing", fitNote: "Good fit." });
    expect(saved?.savedAt).toBe("2026-10-03T00:00:00.000Z");
  });

  it("keeps one copy when the same video is saved twice", async () => {
    const { store, storage } = setup();
    await store.save(card());
    await store.save(card({ ref: "r5", fitNote: "Again." }));
    expect(storage.count("saved_resources")).toBe(1);
    expect((await store.list())).toHaveLength(1);
  });

  it("lists the newest first", async () => {
    const { store } = setup();
    await store.save(card({ externalId: "aaaaaaaaaaa", title: "First" }));
    await store.save(card({ externalId: "bbbbbbbbbbb", title: "Second" }));
    await store.save(card({ externalId: "ccccccccccc", title: "Third" }));
    const titles = (await store.list()).map((s) => (s.card.expired ? "" : s.card.title));
    expect(titles).toEqual(["Third", "Second", "First"]);
  });

  it("removes one without touching the others, and removing nothing is harmless", async () => {
    const { store } = setup();
    await store.save(card({ externalId: "aaaaaaaaaaa" }));
    await store.save(card({ externalId: "bbbbbbbbbbb" }));
    await store.remove({ sourceId: "youtube", externalId: "aaaaaaaaaaa" });
    await store.remove({ sourceId: "youtube", externalId: "zzzzzzzzzzz" });
    expect((await store.list()).map((s) => s.id)).toEqual(["youtube:bbbbbbbbbbb"]);
  });

  it("reports which resources are saved", async () => {
    const { store } = setup();
    await store.save(card());
    expect([...(await store.savedIds())]).toEqual(["youtube:aaaaaaaaaaa"]);
  });
});

describe("saving is never a tool's doing", () => {
  it("rejects a capability that asks for storage access to saved_resources", () => {
    const attempt = () =>
      new CapabilityRegistry().register({
        id: "greedy",
        version: "1.0.0",
        contractVersion: "1.0.0",
        tools: [],
        permissions: [{ kind: "storage", collections: ["saved_resources"], access: "write" }],
        domainRules: [],
        promptFragments: {},
        i18n: {},
      });
    expect(attempt).toThrow(CapabilityRegistrationError);
  });
});
