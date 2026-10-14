import { describe, expect, it } from "vitest";
import { SearchSettingsStore } from "../../src/search/search-settings";
import { makeClock, MemoryStorage } from "../helpers/memory-storage";

// Search on/off and consent per source (005 FR-018, FR-019; data-model.md → SearchSettings).

function setup() {
  const storage = new MemoryStorage();
  const clock = makeClock();
  return { storage, store: new SearchSettingsStore({ storage, now: clock.now }) };
}

describe("SearchSettingsStore", () => {
  it("defaults to enabled with no consent", async () => {
    const { store, storage } = setup();
    expect(await store.read()).toEqual({ id: "search", enabled: true, consent: [] });
    expect(await store.isEnabled()).toBe(true);
    expect(await store.hasConsent("youtube", "terms-1")).toBe(false);
    // Reading never writes.
    expect(storage.count("settings")).toBe(0);
  });

  it("stores the on/off switch", async () => {
    const { store } = setup();
    await store.setEnabled(false);
    expect(await store.isEnabled()).toBe(false);
    await store.setEnabled(true);
    expect(await store.isEnabled()).toBe(true);
  });

  it("records consent per source with the terms version and the time", async () => {
    const { store } = setup();
    await store.recordConsent("youtube", "terms-1");
    expect(await store.hasConsent("youtube", "terms-1")).toBe(true);
    expect(await store.hasConsent("other", "terms-1")).toBe(false);
    expect((await store.read()).consent).toEqual([
      { sourceId: "youtube", agreedAt: "2026-10-03T00:00:00.000Z", termsVersion: "terms-1" },
    ]);
  });

  it("asks again when the terms version changes", async () => {
    const { store } = setup();
    await store.recordConsent("youtube", "terms-1");
    expect(await store.hasConsent("youtube", "terms-2")).toBe(false);
    await store.recordConsent("youtube", "terms-2");
    expect(await store.hasConsent("youtube", "terms-2")).toBe(true);
    // One entry per source: the new agreement replaces the old.
    expect((await store.read()).consent).toHaveLength(1);
  });

  it("keeps consent when the switch is toggled, and the switch when consent is recorded", async () => {
    const { store } = setup();
    await store.setEnabled(false);
    await store.recordConsent("youtube", "terms-1");
    expect(await store.isEnabled()).toBe(false);
    await store.setEnabled(true);
    expect(await store.hasConsent("youtube", "terms-1")).toBe(true);
  });

  it("treats a malformed stored record as the default", async () => {
    const { store, storage } = setup();
    await storage.put("settings", { id: "search", enabled: "yes", consent: "all" } as never);
    expect(await store.read()).toEqual({ id: "search", enabled: true, consent: [] });
  });
});
