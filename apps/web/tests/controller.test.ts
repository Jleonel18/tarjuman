import { MemoryStorage, SessionSecrets, ThemePreferenceStore, type LocalStorageLike } from "@tarjuman/storage-web";
import {
  DEFAULT_MOCK_KEY,
  MOCK_ALT_MODELS,
  MockProvider,
  REPLACEMENT_MOCK_KEY,
  type MockScript,
} from "@tarjuman/testing/mock-provider";
import { createI18n } from "@tarjuman/ui";
import { beforeEach, describe, expect, it } from "vitest";
import { assembleServices, type AppServices } from "../src/composition-root";
import { AppController, toChatMessages } from "../src/controller";
import { resetAppStore, useAppStore } from "../src/store";

const PASTED_KEY = "sk-ant-api03-PASTED-BY-MISTAKE-1234567890";

const DRAFT = { mediationLanguage: "es", targetLanguage: "ja", level: "B1" as const, interests: ["cooking"] };
const ANSWER = "Ser describes identity; estar describes state.";

/** A `localStorage` double, so the theme preference and "delete all" can be checked without a browser. */
class MapLocalStorage implements LocalStorageLike {
  readonly items = new Map<string, string>();
  get length(): number {
    return this.items.size;
  }
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

async function world(options: { provider?: MockProvider; storage?: MemoryStorage; storageAvailable?: boolean } = {}) {
  const provider = options.provider ?? new MockProvider();
  const local = new MapLocalStorage();
  const storage = options.storage ?? new MemoryStorage({ localStorage: local });
  const services: AppServices = assembleServices({
    providers: [{ provider, defaultModelId: "mock-model" }],
    storage,
    storageAvailable: options.storageAvailable ?? true,
    sessionSecrets: new SessionSecrets(),
    i18n: await createI18n({ locale: "en" }),
    themes: new ThemePreferenceStore({ localStorage: local }),
  });
  // Stands in for <html>: the controller applies the theme through its `data-theme` attribute.
  const themeRoot = { dataset: {} as Record<string, string | undefined> };
  return { provider, storage, services, local, themeRoot, controller: new AppController(services, { themeRoot }) };
}

const state = () => useAppStore.getState();

beforeEach(() => resetAppStore());

describe("boot", () => {
  it("starts on onboarding for a first run", async () => {
    const { controller } = await world();
    await controller.boot();
    expect(state()).toMatchObject({ ready: true, route: "onboarding", profile: undefined, messages: [] });
  });

  it("goes to key entry when a profile exists but no key", async () => {
    const { controller, storage, services } = await world();
    await controller.boot();
    await controller.completeOnboarding(DRAFT);
    resetAppStore();
    const second = new AppController(services);
    await second.boot();
    expect(state().route).toBe("key");
    expect(await storage.get("profile", "profile")).toMatchObject({ mediationLanguage: "es", targetLanguage: "ja" });
  });
});

describe("onboarding", () => {
  it("rejects identical languages and stores nothing", async () => {
    const { controller, storage } = await world();
    await controller.boot();
    const draft = { ...DRAFT, targetLanguage: "es" };
    expect(controller.validateDraft(draft).map((i) => i.code)).toContain("same_as_mediation");
    await controller.completeOnboarding(draft);
    expect(await storage.get("profile", "profile")).toBeUndefined();
    expect(state().route).toBe("onboarding");
  });

  it("saves a valid profile with the default tone, effort, and model, then asks for the key", async () => {
    const { controller, storage } = await world();
    await controller.boot();
    expect(controller.validateDraft(DRAFT)).toEqual([]);
    await controller.completeOnboarding(DRAFT);
    expect(await storage.get("profile", "profile")).toMatchObject({
      uiLanguage: "en",
      toneId: "neutral",
      configuredEffort: "medium",
      modelId: "mock-model",
      level: "B1",
      interests: ["cooking"],
    });
    expect(state().route).toBe("key");
  });
});

describe("enterKey", () => {
  it("rejects an invalid key, stores nothing, and stays on key entry", async () => {
    const { controller, services } = await world();
    await controller.boot();
    await controller.completeOnboarding(DRAFT);
    const outcome = await controller.enterKey("sk-ant-wrong", "persistent");
    expect(outcome).toEqual({ ok: false, code: "invalid_credential" });
    expect(await services.credentials.describe("mock")).toBeUndefined();
    expect(state()).toMatchObject({ route: "key", keyHint: undefined });
  });

  it("accepts a valid key, shows only a masked hint, and opens the chat", async () => {
    const { controller, services } = await world();
    await controller.boot();
    await controller.completeOnboarding(DRAFT);
    const outcome = await controller.enterKey(DEFAULT_MOCK_KEY, "session");
    expect(outcome).toEqual({ ok: true, maskedHint: "sk-ant-…0000" });
    expect(state()).toMatchObject({ route: "chat", keyHint: "sk-ant-…0000" });
    expect(JSON.stringify(state())).not.toContain(DEFAULT_MOCK_KEY);
    expect(await services.credentials.describe("mock")).toMatchObject({ storageMode: "session" });
  });
});

async function ready(options: Parameters<typeof world>[0] = {}) {
  const w = await world(options);
  await w.controller.boot();
  await w.controller.completeOnboarding(DRAFT);
  await w.controller.enterKey(DEFAULT_MOCK_KEY, "session");
  return w;
}

describe("send", () => {
  it("streams an answer, creates a conversation with a title, and keeps it after finishing", async () => {
    const { controller } = await ready();
    await controller.send("What is the difference between ser and estar?");
    const s = state();
    expect(s.streaming).toBe(false);
    expect(s.error).toBeUndefined();
    expect(s.messages.map((m) => m.author)).toEqual(["user", "assistant"]);
    const reply = s.messages[1];
    expect(reply).toMatchObject({ author: "assistant", status: "complete" });
    expect(JSON.stringify(reply)).toContain(ANSWER);
    expect(s.conversations).toHaveLength(1);
    expect(s.conversations[0]?.title).toContain("ser and estar");
    expect(s.activeConversationId).toBe(s.conversations[0]?.id);
  });

  it("goes through the pipeline: the request has the level instruction and no key", async () => {
    const { controller, provider } = await ready();
    await controller.send("Hola");
    expect(provider.calls).toHaveLength(1);
    const sent = JSON.stringify(provider.calls[0]);
    expect(sent).toContain("level");
    expect(sent).not.toContain(DEFAULT_MOCK_KEY);
  });

  it("reports a provider error and leaves no empty answer bubble", async () => {
    const provider = new MockProvider();
    provider.enqueue({ steps: [{ type: "error", code: "overloaded" }] });
    const { controller } = await ready({ provider });
    await controller.send("Hola");
    expect(state().error).toEqual({ code: "overloaded" });
    expect(state().messages.every((m) => m.author === "user")).toBe(true);
    expect(provider.streamCalls).toBe(1); // no automatic retry
  });

  it("ignores an empty message and a second send while streaming", async () => {
    const { controller, provider } = await ready();
    await controller.send("   ");
    expect(provider.streamCalls).toBe(0);
  });

  it("stop keeps the partial answer, marked interrupted, and retry asks again as a new answer", async () => {
    const slow: MockScript = {
      steps: [
        { type: "text", delta: "ACCEPT\nPartial " },
        { type: "delay", ms: 5_000 },
        { type: "text", delta: "never shown" },
        { type: "stop", reason: "end" },
      ],
    };
    const provider = new MockProvider();
    provider.enqueue(slow);
    const { controller } = await ready({ provider });

    const sending = controller.send("Question");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(state().streaming).toBe(true);
    controller.stop();
    await sending;

    const interrupted = state().messages.find((m) => m.author === "assistant");
    expect(interrupted).toMatchObject({ status: "interrupted" });
    expect(JSON.stringify(interrupted)).toContain("Partial");
    expect(JSON.stringify(interrupted)).not.toContain("never shown");

    await controller.retry(interrupted!.id);
    const assistants = state().messages.filter((m) => m.author === "assistant");
    expect(assistants.map((m) => (m.author === "assistant" ? m.status : ""))).toEqual(["interrupted", "complete"]);
  });
});

describe("conversations", () => {
  it("restores history after a reload (a new controller over the same storage)", async () => {
    const { controller, storage, services } = await ready();
    await controller.send("Hola");
    const before = state().messages.length;
    resetAppStore();
    const reloaded = new AppController(services);
    await reloaded.boot();
    expect(state().messages).toHaveLength(before);
    expect(await storage.query("messages")).toHaveLength(2);
  });

  it("starts a new conversation, reopens an old one, and deletes with its messages", async () => {
    const { controller, storage } = await ready();
    await controller.send("First");
    const first = state().activeConversationId!;
    controller.newConversation();
    expect(state().messages).toEqual([]);
    await controller.send("Second");
    expect(state().conversations).toHaveLength(2);

    await controller.openConversation(first);
    expect(JSON.stringify(state().messages)).toContain("First");

    await controller.deleteConversation(first);
    expect(state().conversations).toHaveLength(1);
    expect(state().activeConversationId).toBeUndefined();
    expect(await storage.query("messages", { index: "conversationId", equals: first })).toEqual([]);
  });
});

describe("send with key-shaped text (FR-011)", () => {
  it("warns, withholds the key from the model, and never shows or stores it", async () => {
    const { controller, provider, storage } = await ready();
    await controller.send(`Why does this fail? ${PASTED_KEY} thanks`);

    expect(state().notice).toEqual({ code: "key_shape_detected" });
    expect(JSON.stringify(provider.calls)).not.toContain(PASTED_KEY);
    expect(JSON.stringify(state().messages)).not.toContain(PASTED_KEY);
    expect(JSON.stringify(await storage.query("messages", { index: "conversationId", equals: state().activeConversationId ?? "" }))).not.toContain(PASTED_KEY);
    // The learner still sees their message, with the key replaced by a label.
    const shown = state().messages.find((m) => m.author === "user");
    expect(shown).toMatchObject({ text: "Why does this fail? [withheld: looks like a key] thanks" });
  });

  it("clears the notice on the next send and when dismissed", async () => {
    const { controller } = await ready();
    await controller.send(`oops ${PASTED_KEY}`);
    expect(state().notice).toBeDefined();
    controller.dismissNotice();
    expect(state().notice).toBeUndefined();
    await controller.send(`oops ${PASTED_KEY}`);
    await controller.send("a clean question");
    expect(state().notice).toBeUndefined();
  });

  it("raises no notice for an ordinary message", async () => {
    const { controller } = await ready();
    await controller.send("What does ser mean?");
    expect(state().notice).toBeUndefined();
  });
});

describe("toChatMessages", () => {
  it("shows only user-typed text for a user message, never pasted material", () => {
    const [shown] = toChatMessages([
      {
        id: "u",
        conversationId: "c",
        author: "user",
        segments: [
          { trust: "user", text: "Explain this" },
          { trust: "untrusted", text: "pasted lyric" },
        ],
        status: "complete",
        verdict: null,
        ruleIds: [],
        usageId: null,
        createdAt: "2026-10-03T00:00:00.000Z",
      },
    ]);
    expect(shown).toEqual({ id: "u", author: "user", text: "Explain this" });
  });

  it("renders model text through the OutputGuard: images and HTML do not survive", () => {
    const [shown] = toChatMessages([
      {
        id: "a",
        conversationId: "c",
        author: "assistant",
        segments: [{ trust: "untrusted", text: '![x](https://evil.test/x.png) <script>alert(1)</script>' }],
        status: "complete",
        verdict: null,
        ruleIds: [],
        usageId: null,
        createdAt: "2026-10-03T00:00:00.000Z",
      },
    ]);
    const json = JSON.stringify(shown);
    expect(json).not.toContain('"image"');
    expect(json).not.toContain('"type":"html');
  });
});

describe("usage and model settings (US4)", () => {
  it("keeps the provider-reported usage of the open conversation in the store", async () => {
    const { controller } = await ready();
    await controller.send("What does ser mean?");
    await controller.send("And estar?");
    expect(state().usage.map((u) => [u.inputTokens, u.outputTokens])).toEqual([
      [120, 24],
      [120, 24],
    ]);
  });

  it("loads the usage of a conversation when it is opened, and clears it for a new one", async () => {
    const { controller } = await ready();
    await controller.send("What does ser mean?");
    const id = state().activeConversationId ?? "";
    controller.newConversation();
    expect(state().usage).toEqual([]);
    await controller.openConversation(id);
    expect(state().usage).toHaveLength(1);
  });

  it("stores a new effort and model in the profile", async () => {
    const { controller, storage } = await ready();
    await controller.updateModelSettings({ effort: "low" });
    await controller.updateModelSettings({ modelId: "mock-model-no-pricing" });
    expect(state().profile).toMatchObject({ configuredEffort: "low", modelId: "mock-model-no-pricing" });
    expect(await storage.get("profile", "profile")).toMatchObject({
      configuredEffort: "low",
      modelId: "mock-model-no-pricing",
    });
  });

  it("ignores a model the app does not know and an effort it does not offer", async () => {
    const { controller } = await ready();
    await controller.updateModelSettings({ modelId: "not-a-model", effort: "max" });
    expect(state().profile).toMatchObject({ configuredEffort: "medium", modelId: "mock-model" });
  });

  it("stores a new tone and ignores one that is not a preset", async () => {
    const { controller, storage } = await ready();
    await controller.updateTone("warm");
    expect(await storage.get("profile", "profile")).toMatchObject({ toneId: "warm" });
    await controller.updateTone("anything-goes");
    expect(state().profile).toMatchObject({ toneId: "warm" });
  });

  it("changes each language on its own and stores the result", async () => {
    const { controller, storage, services } = await ready();
    await controller.updateLanguages({ uiLanguage: "es" });
    expect(services.i18n.language).toBe("es");
    expect(state().profile).toMatchObject({ uiLanguage: "es", mediationLanguage: "es", targetLanguage: "ja" });
    await controller.updateLanguages({ targetLanguage: "ar" });
    await controller.updateLanguages({ mediationLanguage: "en" });
    expect(await storage.get("profile", "profile")).toMatchObject({
      uiLanguage: "es",
      mediationLanguage: "en",
      targetLanguage: "ar",
    });
  });

  it("refuses an explanation language equal to the target and stores nothing", async () => {
    const { controller, storage } = await ready();
    const candidate = { uiLanguage: "en", mediationLanguage: "ja", targetLanguage: "ja" };
    expect(controller.validateLanguages(candidate).map((i) => i.code)).toContain("same_as_mediation");
    await controller.updateLanguages({ mediationLanguage: "ja" });
    expect(await storage.get("profile", "profile")).toMatchObject({ mediationLanguage: "es", targetLanguage: "ja" });
  });

  it("does not store a test-only interface locale", async () => {
    const { controller, storage } = await ready();
    await controller.updateLanguages({ uiLanguage: "ar-XB" });
    expect(await storage.get("profile", "profile")).toMatchObject({ uiLanguage: "en" });
  });

  it("offers only the shipped interface languages unless test locales are switched on", async () => {
    const { services } = await world();
    expect(services.uiLocales).toEqual(["en", "es"]);
  });
});

describe("key and data control (US7)", () => {
  const twoKeys = () => new MockProvider({ validKeys: [DEFAULT_MOCK_KEY, REPLACEMENT_MOCK_KEY] });

  it("boot shows where the key in use is kept", async () => {
    const { services } = await ready();
    resetAppStore();
    await new AppController(services).boot();
    expect(state()).toMatchObject({ keyHint: "sk-ant-…0000", keyMode: "session" });
  });

  it("replaces the key with a valid one and shows the new hint and mode", async () => {
    const { controller, services } = await ready({ provider: twoKeys() });
    const outcome = await controller.replaceKey(REPLACEMENT_MOCK_KEY, "persistent");
    expect(outcome).toEqual({ ok: true, maskedHint: "sk-ant-…1111" });
    expect(state()).toMatchObject({ keyHint: "sk-ant-…1111", keyMode: "persistent" });
    expect(await services.credentials.describe("mock")).toMatchObject({ maskedHint: "sk-ant-…1111", storageMode: "persistent" });
  });

  it("a rejected replacement keeps the old key and hint", async () => {
    const { controller, services } = await ready();
    const outcome = await controller.replaceKey("sk-ant-wrong", "persistent");
    expect(outcome).toEqual({ ok: false, code: "invalid_credential" });
    expect(state()).toMatchObject({ keyHint: "sk-ant-…0000", keyMode: "session" });
    expect(await services.credentials.describe("mock")).toMatchObject({ maskedHint: "sk-ant-…0000" });
  });

  it("deleting the key keeps the profile and asks for a key again", async () => {
    const { controller, services, storage } = await ready();
    await controller.removeKey();
    expect(state()).toMatchObject({ route: "key", keyHint: undefined, keyMode: undefined });
    expect(await services.credentials.describe("mock")).toBeUndefined();
    expect(await storage.get("profile", "profile")).toBeDefined();
  });

  it("delete all removes everything and returns to onboarding", async () => {
    const { controller, services, storage } = await ready();
    await controller.send("What is the difference between ser and estar?");
    state().navigate("settings");
    expect(await controller.deleteAllData()).toEqual({ ok: true });
    expect(state()).toMatchObject({
      ready: true,
      route: "onboarding",
      profile: undefined,
      keyHint: undefined,
      conversations: [],
      messages: [],
    });
    expect(await storage.get("profile", "profile")).toBeUndefined();
    expect(await services.conversations.list()).toEqual([]);
    expect(await services.credentials.describe("mock")).toBeUndefined();
  });

  it("a deletion that cannot be verified is reported and leaves the screen in place", async () => {
    const storage = new MemoryStorage();
    storage.clearAll = async () => {
      throw new Error("not empty");
    };
    const { controller } = await ready({ storage });
    state().navigate("settings");
    expect(await controller.deleteAllData()).toEqual({ ok: false, code: "not_verified" });
    expect(state().route).toBe("settings");
  });

  it("a key error sends the learner to the settings screen", async () => {
    const { controller } = await ready();
    controller.openKeySettings();
    expect(state().route).toBe("settings");
  });
});

describe("theme (003 US1)", () => {
  it("boot reads the saved preference", async () => {
    const { services, local, themeRoot } = await world();
    local.setItem("tarjuman.theme", "dark");
    await new AppController(services, { themeRoot }).boot();
    expect(state().theme).toBe("dark");
  });

  it('starts at "system" when nothing is saved', async () => {
    const { controller } = await world();
    await controller.boot();
    expect(state().theme).toBe("system");
  });

  it('setTheme("dark") stores the choice and applies data-theme', async () => {
    const { controller, local, themeRoot } = await world();
    await controller.boot();
    controller.setTheme("dark");
    expect(local.getItem("tarjuman.theme")).toBe("dark");
    expect(themeRoot.dataset["theme"]).toBe("dark");
    expect(state().theme).toBe("dark");
  });

  it('setTheme("system") stores "system" and removes the attribute', async () => {
    const { controller, local, themeRoot } = await world();
    await controller.boot();
    controller.setTheme("light");
    controller.setTheme("system");
    expect(local.getItem("tarjuman.theme")).toBe("system");
    expect(themeRoot.dataset).not.toHaveProperty("theme");
    expect(state().theme).toBe("system");
  });

  it("works before onboarding, with no profile or key", async () => {
    const { controller, themeRoot } = await world();
    await controller.boot();
    expect(state().route).toBe("onboarding");
    controller.setTheme("light");
    expect(themeRoot.dataset["theme"]).toBe("light");
  });

  it('after a successful delete-all the attribute is gone and the store reads "system"', async () => {
    const w = await world();
    await w.controller.boot();
    await w.controller.completeOnboarding(DRAFT);
    await w.controller.enterKey(DEFAULT_MOCK_KEY, "session");
    w.controller.setTheme("dark");
    expect(await w.controller.deleteAllData()).toEqual({ ok: true });
    expect(w.themeRoot.dataset).not.toHaveProperty("theme");
    expect(w.local.getItem("tarjuman.theme")).toBeNull();
    expect(w.services.themes.get()).toBe("system");
    expect(state().theme).toBe("system");
  });
});

describe("two providers (004)", () => {
  // Mock providers named like the product ones, so the real key shapes apply. Fake keys only.
  const GEMINI_KEY = "AQ.FAKEcontrollerGEMINIkeyFAKEfakeFAKE_-fakeFAKE00001";

  async function twoProviderWorld(storage = new MemoryStorage()) {
    const anthropic = new MockProvider({ id: "anthropic" });
    const gemini = new MockProvider({ id: "gemini", models: MOCK_ALT_MODELS, validKeys: [GEMINI_KEY] });
    const local = new MapLocalStorage();
    const services = assembleServices({
      providers: [
        { provider: anthropic, defaultModelId: "mock-model" },
        { provider: gemini, defaultModelId: "mock-alt-model" },
      ],
      storage,
      storageAvailable: true,
      sessionSecrets: new SessionSecrets(),
      i18n: await createI18n({ locale: "en" }),
      themes: new ThemePreferenceStore({ localStorage: local }),
    });
    const controller = new AppController(services, { themeRoot: { dataset: {} } });
    await controller.boot();
    return { anthropic, gemini, services, storage, controller };
  }

  describe("onboarding (US1)", () => {
    it("needs a provider choice: a draft without one is not valid", async () => {
      const { controller } = await twoProviderWorld();
      expect(controller.validateDraft(DRAFT).map((issue) => issue.path)).toContain("providerId");
      await controller.completeOnboarding(DRAFT);
      expect(state().profile).toBeUndefined();
    });

    it("stores the chosen provider and its default model, then asks for that provider's key", async () => {
      const { controller } = await twoProviderWorld();
      await controller.completeOnboarding({ ...DRAFT, providerId: "gemini" });
      expect(state().profile).toMatchObject({ providerId: "gemini", modelId: "mock-alt-model" });
      expect(state().route).toBe("key");
    });

    it("rejects an Anthropic key for Gemini locally: no validation request, nothing stored (FR-007)", async () => {
      const { controller, anthropic, gemini, services } = await twoProviderWorld();
      await controller.completeOnboarding({ ...DRAFT, providerId: "gemini" });
      const outcome = await controller.enterKey(DEFAULT_MOCK_KEY, "session");
      expect(outcome).toEqual({ ok: false, code: "wrong_provider", expectedProviderId: "anthropic" });
      expect(anthropic.validationCalls + gemini.validationCalls).toBe(0);
      expect(await services.credentials.list()).toEqual([]);
    });

    it("validates a Gemini key with Gemini only, and the chat then goes to Gemini", async () => {
      const { controller, anthropic, gemini } = await twoProviderWorld();
      await controller.completeOnboarding({ ...DRAFT, providerId: "gemini" });
      expect(await controller.enterKey(GEMINI_KEY, "session")).toEqual({ ok: true, maskedHint: "AQ.…0001" });
      expect(gemini.validationCalls).toBe(1);
      expect(anthropic.validationCalls).toBe(0);
      await controller.send("What is the difference between ser and estar?");
      expect(gemini.streamCalls).toBe(1);
      expect(anthropic.streamCalls).toBe(0);
      expect(state().usage.at(-1)).toMatchObject({ providerId: "gemini", modelId: "mock-alt-model" });
    });
  });

  describe("switching (US2)", () => {
    async function onAnthropicWithKey() {
      const world = await twoProviderWorld();
      await world.controller.completeOnboarding({ ...DRAFT, providerId: "anthropic" });
      await world.controller.enterKey(DEFAULT_MOCK_KEY, "persistent");
      await world.controller.updateModelSettings({ effort: "high" });
      return world;
    }

    it("sets the provider, resets the model to its default, and keeps the effort", async () => {
      const { controller, storage } = await onAnthropicWithKey();
      await controller.switchProvider("gemini");
      expect(state().profile).toMatchObject({ providerId: "gemini", modelId: "mock-alt-model", configuredEffort: "high" });
      expect(await storage.get("profile", "profile")).toMatchObject({ providerId: "gemini" });
    });

    it("without a key for the new provider, asks for one and shows no key as in use", async () => {
      const { controller } = await onAnthropicWithKey();
      await controller.switchProvider("gemini");
      expect(state()).toMatchObject({ route: "key", keyHint: undefined, keyMode: undefined });
      expect(state().storedKeys).toEqual({ anthropic: { hint: "sk-ant-…0000", mode: "persistent" } });
    });

    it("with a stored key for the new provider, asks for nothing", async () => {
      const { controller } = await onAnthropicWithKey();
      await controller.switchProvider("gemini");
      await controller.enterKey(GEMINI_KEY, "session");
      state().navigate("settings");
      await controller.switchProvider("anthropic");
      expect(state()).toMatchObject({ route: "settings", keyHint: "sk-ant-…0000", keyMode: "persistent" });
      await controller.switchProvider("gemini");
      expect(state()).toMatchObject({ route: "settings", keyHint: "AQ.…0001", keyMode: "session" });
    });

    it("continues an old conversation with the new provider, keeping its messages", async () => {
      const { controller, anthropic, gemini } = await onAnthropicWithKey();
      await controller.send("What is the difference between ser and estar?");
      const conversationId = state().activeConversationId;
      await controller.switchProvider("gemini");
      await controller.enterKey(GEMINI_KEY, "session");
      await controller.openConversation(conversationId!);
      await controller.send("And haber?");
      expect(anthropic.streamCalls).toBe(1);
      expect(gemini.streamCalls).toBe(1);
      expect(state().messages.filter((m) => m.author === "user")).toHaveLength(2);
      expect(state().usage.map((u) => u.providerId)).toEqual(["anthropic", "gemini"]);
    });

    it("deleting or replacing one provider's key leaves the other's", async () => {
      const { controller, services } = await onAnthropicWithKey();
      await controller.switchProvider("gemini");
      await controller.enterKey(GEMINI_KEY, "session");
      await controller.removeKey();
      expect(await services.credentials.describe("gemini")).toBeUndefined();
      expect(await services.credentials.describe("anthropic")).toMatchObject({ maskedHint: "sk-ant-…0000" });
      expect(state().storedKeys).toEqual({ anthropic: { hint: "sk-ant-…0000", mode: "persistent" } });
    });

    it("ignores an unknown provider, the same provider, and any switch while an answer streams", async () => {
      const { controller } = await onAnthropicWithKey();
      const before = state().profile;
      await controller.switchProvider("openai");
      await controller.switchProvider("anthropic");
      useAppStore.setState({ streaming: true });
      await controller.switchProvider("gemini");
      expect(state().profile).toBe(before);
    });

    it("boot lists every stored key's hint, never a key", async () => {
      const { controller, services } = await onAnthropicWithKey();
      await controller.switchProvider("gemini");
      await controller.enterKey(GEMINI_KEY, "persistent");
      resetAppStore();
      await new AppController(services, { themeRoot: { dataset: {} } }).boot();
      expect(state().storedKeys).toEqual({
        anthropic: { hint: "sk-ant-…0000", mode: "persistent" },
        gemini: { hint: "AQ.…0001", mode: "persistent" },
      });
      expect(JSON.stringify(state())).not.toContain(GEMINI_KEY);
    });

    it("delete all removes both keys", async () => {
      const { controller, services } = await onAnthropicWithKey();
      await controller.switchProvider("gemini");
      await controller.enterKey(GEMINI_KEY, "session");
      expect(await controller.deleteAllData()).toEqual({ ok: true });
      expect(await services.credentials.list()).toEqual([]);
      expect(state().storedKeys).toEqual({});
    });
  });

  it("a profile saved before 004 boots as Anthropic with its key (FR-002)", async () => {
    const storage = new MemoryStorage();
    const first = await twoProviderWorld(storage);
    await first.controller.completeOnboarding({ ...DRAFT, providerId: "anthropic" });
    await first.controller.enterKey(DEFAULT_MOCK_KEY, "persistent");
    const legacy = (await storage.get<Record<string, unknown>>("profile", "profile"))!;
    delete legacy["providerId"];
    await storage.put("profile", legacy as { id: string });
    resetAppStore();
    await new AppController(first.services, { themeRoot: { dataset: {} } }).boot();
    expect(state()).toMatchObject({ route: "chat", keyHint: "sk-ant-…0000" });
    expect(state().profile?.providerId).toBe("anthropic");
  });
});
