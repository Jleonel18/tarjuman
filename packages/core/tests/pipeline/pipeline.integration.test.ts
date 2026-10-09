import { beforeEach, describe, expect, it } from "vitest";
import { CapabilityRegistry } from "../../src/capabilities/registry";
import { ConversationService } from "../../src/conversation/service";
import type { Message } from "../../src/conversation/types";
import { Pipeline } from "../../src/pipeline/pipeline";
import type { TurnEvent } from "../../src/pipeline/types";
import { sealSecret } from "../../src/ports/secret-handle";
import type { CredentialStore } from "../../src/ports/storage";
import type { LearnerProfile } from "../../src/profile/types";
import { makeClock, MemoryStorage } from "../helpers/memory-storage";
import { createTestAbort, ScriptedProvider, type Step } from "../helpers/scripted-provider";

const PROFILE: LearnerProfile = {
  id: "profile",
  uiLanguage: "en",
  mediationLanguage: "es",
  targetLanguage: "ja",
  level: "B1",
  interests: [],
  toneId: "neutral",
  configuredEffort: "medium",
  modelId: "mock-model",
  createdAt: "2026-10-03T00:00:00.000Z",
  updatedAt: "2026-10-03T00:00:00.000Z",
};

const KEY = "sk-ant-api03-FAKE-KEY-FOR-PIPELINE-TESTS";

const credentials: CredentialStore = {
  save: async () => {},
  load: async () => sealSecret(KEY),
  describe: async () => undefined,
  remove: async () => {},
};

const HAPPY: Step[] = [
  { type: "text", delta: "ACCEPT\nSer describe " },
  { type: "text", delta: "identidad." },
  { type: "usage", inputTokens: 100, outputTokens: 10 },
  { type: "stop", reason: "end" },
];

let storage: MemoryStorage;
let conversations: ConversationService;
let conversationId: string;

function makePipeline(script: Step[]) {
  const provider = new ScriptedProvider(script);
  const capabilities = new CapabilityRegistry();
  capabilities.register({
    id: "language-qa",
    version: "1.0.0",
    contractVersion: "1.0.0",
    tools: [],
    permissions: [],
    domainRules: [
      {
        id: "scope.language-learning",
        version: "1.0.0",
        description: "Language learning only.",
        refusalTemplateKey: "refusal.out_of_scope",
        acceptCases: [{ input: "What does ser mean?", locale: "en" }],
        refuseCases: [{ input: "Write me an HTML app", locale: "en" }],
      },
    ],
    promptFragments: { intro: { layer: "capability", text: { en: "Explain clearly." } } },
    i18n: {},
  });
  const pipeline = new Pipeline({
    provider,
    conversations,
    credentials,
    capabilities,
    getProfile: async () => PROFILE,
    refusalTemplate: () => undefined,
  });
  return { provider, pipeline };
}

async function collect(stream: AsyncIterable<TurnEvent>): Promise<TurnEvent[]> {
  const events: TurnEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

function turn(userText = "What does ser mean?") {
  return { conversationId, capabilityId: "language-qa", userText };
}

function terminals(events: TurnEvent[]) {
  return events.filter((e) => e.type === "done" || e.type === "error");
}

async function assistantMessage(): Promise<Message | undefined> {
  const opened = await conversations.open(conversationId);
  return opened?.messages.find((m) => m.author === "assistant");
}

function textOf(message: Message | undefined): string {
  return message?.segments.map((s) => s.text).join("") ?? "";
}

beforeEach(async () => {
  storage = new MemoryStorage();
  conversations = new ConversationService({ storage, ...makeClock() });
  conversationId = (
    await conversations.create({ capabilityId: "language-qa", languageSnapshot: { mediation: "es", target: "ja" } })
  ).id;
});

describe("Pipeline: streamed happy path", () => {
  it("renders progressively, then emits exactly one done(complete)", async () => {
    const { pipeline } = makePipeline(HAPPY);
    const events = await collect(pipeline.run(turn(), createTestAbort().signal));

    const renders = events.filter((e) => e.type === "render");
    expect(renders.length).toBeGreaterThan(0);
    expect(terminals(events)).toEqual([{ type: "done", status: "complete" }]);
    expect(events.at(-1)).toEqual({ type: "done", status: "complete" });
  });

  it("persists the user message and a complete assistant message", async () => {
    const { pipeline } = makePipeline(HAPPY);
    await collect(pipeline.run(turn(), createTestAbort().signal));

    const opened = await conversations.open(conversationId);
    expect(opened?.messages.map((m) => m.author)).toEqual(["user", "assistant"]);
    expect(opened?.messages[0]?.segments).toEqual([{ trust: "user", text: "What does ser mean?" }]);
    const reply = await assistantMessage();
    expect(reply?.status).toBe("complete");
    expect(textOf(reply)).toBe("Ser describe identidad.");
  });

  it("sends one request that carries the layers and the question, never the key", async () => {
    const { pipeline, provider } = makePipeline(HAPPY);
    await collect(pipeline.run(turn(), createTestAbort().signal));

    expect(provider.streamCalls).toBe(1);
    const request = provider.calls[0];
    expect(request?.modelId).toBe("mock-model");
    expect(request?.layers[0]?.id).toBe("security");
    expect(request?.messages.at(-1)?.content).toContain("What does ser mean?");
    expect(JSON.stringify(request)).not.toContain(KEY);
  });

  it("the final render shows the whole answer as safe blocks", async () => {
    const { pipeline } = makePipeline(HAPPY);
    const events = await collect(pipeline.run(turn(), createTestAbort().signal));
    const last = [...events].reverse().find((e) => e.type === "render");
    expect(JSON.stringify(last)).toContain("Ser describe identidad.");
  });
});

describe("Pipeline: abort (FR-004)", () => {
  it("yields done(interrupted) and keeps the partial text", async () => {
    const abort = createTestAbort();
    const { pipeline } = makePipeline([
      { type: "text", delta: "ACCEPT\nPartial answer" },
      { type: "wait_for_abort" },
    ]);

    const events: TurnEvent[] = [];
    for await (const event of pipeline.run(turn(), abort.signal)) {
      events.push(event);
      if (event.type === "render") abort.abort();
    }

    expect(terminals(events)).toEqual([{ type: "done", status: "interrupted" }]);
    const reply = await assistantMessage();
    expect(reply?.status).toBe("interrupted");
    expect(textOf(reply)).toBe("Partial answer");
  });

  it("handles a signal that is already aborted without calling the model twice", async () => {
    const abort = createTestAbort();
    abort.abort();
    const { pipeline, provider } = makePipeline(HAPPY);
    const events = await collect(pipeline.run(turn(), abort.signal));

    expect(terminals(events)).toHaveLength(1);
    expect(terminals(events)[0]).toEqual({ type: "done", status: "interrupted" });
    expect(provider.streamCalls).toBeLessThanOrEqual(1);
  });
});

describe("Pipeline: provider errors", () => {
  it("a network error mid-stream yields done(interrupted) and keeps the partial text", async () => {
    const { pipeline } = makePipeline([
      { type: "text", delta: "ACCEPT\nHalf an ans" },
      { type: "error", code: "network" },
    ]);
    const events = await collect(pipeline.run(turn(), createTestAbort().signal));

    expect(terminals(events)).toEqual([{ type: "done", status: "interrupted" }]);
    expect(events).toContainEqual({ type: "notice", code: "interrupted" });
    const reply = await assistantMessage();
    expect(reply?.status).toBe("interrupted");
    expect(textOf(reply)).toBe("Half an ans");
  });

  it("an error before any text yields exactly one error event with its code", async () => {
    const { pipeline } = makePipeline([{ type: "error", code: "invalid_credential" }]);
    const events = await collect(pipeline.run(turn(), createTestAbort().signal));

    expect(terminals(events)).toEqual([{ type: "error", code: "invalid_credential" }]);
    expect((await assistantMessage())?.status).toBe("interrupted");
  });

  it("passes retryAfterSeconds through on rate limits", async () => {
    const { pipeline } = makePipeline([{ type: "error", code: "rate_limited", retryAfterSeconds: 30 }]);
    const events = await collect(pipeline.run(turn(), createTestAbort().signal));
    expect(terminals(events)).toEqual([{ type: "error", code: "rate_limited", retryAfterSeconds: 30 }]);
  });

  it("never retries: one stream call per error, for every error code", async () => {
    for (const code of ["rate_limited", "overloaded", "network", "unknown", "bad_request"] as const) {
      const { pipeline, provider } = makePipeline([{ type: "error", code }]);
      await collect(pipeline.run(turn(), createTestAbort().signal));
      expect(provider.streamCalls, code).toBe(1);
    }
  });

  it("never retries after a mid-stream failure either", async () => {
    const { pipeline, provider } = makePipeline([
      { type: "text", delta: "ACCEPT\nx" },
      { type: "error", code: "overloaded" },
    ]);
    await collect(pipeline.run(turn(), createTestAbort().signal));
    expect(provider.streamCalls).toBe(1);
  });
});

describe("Pipeline: one terminal event per turn", () => {
  it("holds for every scripted ending", async () => {
    const scripts: Step[][] = [
      HAPPY,
      [{ type: "error", code: "network" }],
      [{ type: "text", delta: "ACCEPT\na" }, { type: "error", code: "unknown" }],
      [{ type: "text", delta: "ACCEPT\na" }, { type: "stop", reason: "max_tokens" }],
      [],
    ];
    for (const script of scripts) {
      const { pipeline } = makePipeline(script);
      const events = await collect(pipeline.run(turn(), createTestAbort().signal));
      expect(terminals(events), JSON.stringify(script)).toHaveLength(1);
      expect(events.at(-1)?.type === "done" || events.at(-1)?.type === "error").toBe(true);
    }
  });

  it("leaves no message stuck in `streaming`", async () => {
    for (const script of [HAPPY, [{ type: "error", code: "network" }] as Step[], [] as Step[]]) {
      const { pipeline } = makePipeline(script);
      await collect(pipeline.run(turn(), createTestAbort().signal));
    }
    const opened = await conversations.open(conversationId);
    expect(opened?.messages.some((m) => m.status === "streaming")).toBe(false);
  });
});
