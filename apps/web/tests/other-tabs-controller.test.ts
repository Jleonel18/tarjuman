import { MemoryStorage, SessionSecrets, StorageDetachedError, ThemePreferenceStore } from "@tarjuman/storage-web";
import { DEFAULT_MOCK_KEY, MockProvider } from "@tarjuman/testing/mock-provider";
import { createI18n } from "@tarjuman/ui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assembleServices } from "../src/composition-root";
import { AppController, RESTART_FALLBACK_MS } from "../src/controller";
import type { OtherTabs, TabSignal } from "../src/other-tabs";
import { resetAppStore, useAppStore } from "../src/store";

// "Delete all my data" with another tab open (001 FR-017a, US7 scenario 4, security review
// finding 1). Each AppController here plays one tab; the channel between them is a double.

const DRAFT = { mediationLanguage: "es", targetLanguage: "ja", level: "B1" as const, interests: [] };

/** Records what this tab announces, and lets a test play what another tab announces. */
class FakeOtherTabs implements OtherTabs {
  readonly log: string[];
  readonly #listeners = new Set<(signal: TabSignal) => void>();
  constructor(log: string[] = []) {
    this.log = log;
  }
  announce(signal: TabSignal): void {
    this.log.push(`announce:${signal}`);
  }
  listen(listener: (signal: TabSignal) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  close(): void {
    this.#listeners.clear();
  }
  hear(signal: TabSignal): void {
    for (const listener of this.#listeners) listener(signal);
  }
}

async function tab(options: { latencyMs?: number } = {}) {
  const log: string[] = [];
  const storage = new MemoryStorage({ localStorage: undefined });
  const clearAll = storage.clearAll.bind(storage);
  storage.clearAll = async () => {
    log.push("clearAll");
    await clearAll();
  };
  const sessionSecrets = new SessionSecrets();
  const otherTabs = new FakeOtherTabs(log);
  const restart = vi.fn();
  const services = assembleServices({
    providers: [{ provider: new MockProvider({ latencyMs: options.latencyMs ?? 0 }), defaultModelId: "mock-model" }],
    storage,
    storageAvailable: true,
    sessionSecrets,
    i18n: await createI18n({ locale: "en" }),
    themes: new ThemePreferenceStore({ localStorage: undefined }),
    otherTabs,
    restart,
  });
  const controller = new AppController(services, { themeRoot: undefined });
  await controller.boot();
  await controller.completeOnboarding(DRAFT);
  await controller.enterKey(DEFAULT_MOCK_KEY, "session");
  return { controller, services, storage, sessionSecrets, otherTabs, restart, log };
}

const state = () => useAppStore.getState();

beforeEach(() => resetAppStore());
afterEach(() => vi.useRealTimers());

describe("the tab that deletes", () => {
  it("tells the other tabs before the deletion starts and after it has finished", async () => {
    const { controller, log } = await tab();
    expect(await controller.deleteAllData()).toEqual({ ok: true });
    expect(log).toEqual(["announce:delete_started", "clearAll", "announce:delete_finished"]);
  });

  it("announces the end even when the deletion cannot be verified", async () => {
    const { controller, storage, log } = await tab();
    storage.clearAll = async () => {
      log.push("clearAll");
      throw new Error("not empty");
    };
    expect(await controller.deleteAllData()).toEqual({ ok: false, code: "not_verified" });
    expect(log).toEqual(["announce:delete_started", "clearAll", "announce:delete_finished"]);
  });

  it("does not restart itself", async () => {
    const { controller, restart } = await tab();
    await controller.deleteAllData();
    expect(restart).not.toHaveBeenCalled();
    expect(state()).toMatchObject({ ready: true, route: "onboarding" });
  });
});

describe("another tab, when it hears delete_started", () => {
  it("stops writing, forgets its session keys and its screen, and waits", async () => {
    const { otherTabs, storage, sessionSecrets, restart } = await tab();
    expect(sessionSecrets.providerIds()).toEqual(["mock"]);
    expect(state().route).toBe("chat");

    otherTabs.hear("delete_started");

    await expect(storage.get("profile", "profile")).rejects.toBeInstanceOf(StorageDetachedError);
    expect(sessionSecrets.providerIds()).toEqual([]);
    expect(state()).toMatchObject({ ready: false, profile: undefined, keyHint: undefined, messages: [], conversations: [] });
    expect(restart).not.toHaveBeenCalled();
  });

  it("aborts an answer in flight, which then writes nothing and leaves the screen reset", async () => {
    const { controller, otherTabs, storage } = await tab({ latencyMs: 20 });
    const sending = controller.send("What is the difference between ser and estar?");
    // The answer is in flight: its placeholder is on screen and the mock is between events.
    await vi.waitFor(() => expect(state().messages.map((m) => m.id)).toContain("pending-reply"));

    otherTabs.hear("delete_started");
    await expect(sending).resolves.toBeUndefined();

    await expect(storage.query("messages")).rejects.toBeInstanceOf(StorageDetachedError);
    expect(state()).toMatchObject({ ready: false, messages: [], conversations: [], streaming: false });
  });

  it("restarts when it hears delete_finished", async () => {
    const { otherTabs, restart } = await tab();
    otherTabs.hear("delete_started");
    otherTabs.hear("delete_finished");
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it(`restarts on its own after ${RESTART_FALLBACK_MS} ms if delete_finished never comes, and only once`, async () => {
    const { otherTabs, restart } = await tab();
    vi.useFakeTimers();
    otherTabs.hear("delete_started");
    vi.advanceTimersByTime(RESTART_FALLBACK_MS - 1);
    expect(restart).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(restart).toHaveBeenCalledTimes(1);
    otherTabs.hear("delete_finished");
    expect(restart).toHaveBeenCalledTimes(1);
  });
});

describe("another tab, when it hears only delete_finished", () => {
  it("stops writing and restarts at once", async () => {
    const { otherTabs, storage, sessionSecrets, restart } = await tab();
    otherTabs.hear("delete_finished");
    await expect(storage.get("profile", "profile")).rejects.toBeInstanceOf(StorageDetachedError);
    expect(sessionSecrets.providerIds()).toEqual([]);
    expect(restart).toHaveBeenCalledTimes(1);
  });
});
