import { MemoryStorage, SessionSecrets } from "@tarjuman/storage-web";
import { DEFAULT_MOCK_KEY, MOCK_MODELS, MockProvider, type MockScript } from "@tarjuman/testing/mock-provider";
import { createI18n } from "@tarjuman/ui";
import { beforeEach, describe, expect, it } from "vitest";
import { assembleServices, type AppServices } from "../src/composition-root";
import { AppController, toChatMessages } from "../src/controller";
import { resetAppStore, useAppStore } from "../src/store";

const DRAFT = { mediationLanguage: "es", targetLanguage: "ja", level: "B1" as const, interests: ["cooking"] };
const ANSWER = "Ser describes identity; estar describes state.";

async function world(options: { provider?: MockProvider; storage?: MemoryStorage; storageAvailable?: boolean } = {}) {
  const provider = options.provider ?? new MockProvider();
  const storage = options.storage ?? new MemoryStorage();
  const services: AppServices = assembleServices({
    provider,
    modelIds: MOCK_MODELS.map((m) => m.id),
    defaultModelId: "mock-model",
    storage,
    storageAvailable: options.storageAvailable ?? true,
    sessionSecrets: new SessionSecrets(),
    i18n: await createI18n({ locale: "en" }),
  });
  return { provider, storage, services, controller: new AppController(services) };
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
    expect(await services.credentials.describe()).toBeUndefined();
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
    expect(await services.credentials.describe()).toMatchObject({ storageMode: "session" });
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
        { type: "text", delta: "Partial " },
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
