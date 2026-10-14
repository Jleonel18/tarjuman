import { beforeEach, describe, expect, it } from "vitest";
import { CapabilityRegistry } from "../../src/capabilities/registry";
import { ConversationService } from "../../src/conversation/service";
import { Pipeline } from "../../src/pipeline/pipeline";
import type { TurnEvent } from "../../src/pipeline/types";
import type { ModelInfo } from "../../src/ports/provider";
import { sealSecret } from "../../src/ports/secret-handle";
import type { CredentialStore } from "../../src/ports/storage";
import type { LearnerProfile } from "../../src/profile/types";
import type { UsageRecord } from "../../src/stats/types";
import { makeClock, MemoryStorage } from "../helpers/memory-storage";
import { createTestAbort, ScriptedProvider, type Step } from "../helpers/scripted-provider";

const MODEL: ModelInfo = {
  id: "mock-model",
  displayName: "Mock",
  contextWindow: 10_000,
  maxOutput: 2_000,
  supportsEffort: true,
  effortLevels: ["low", "medium", "high"],
  pricing: { inputPerMTok: 3, outputPerMTok: 15, asOf: "2026-10-01" },
};

const PROFILE: LearnerProfile = {
  id: "profile",
  uiLanguage: "en",
  mediationLanguage: "es",
  targetLanguage: "ja",
  level: "B1",
  interests: [],
  toneId: "neutral",
  configuredEffort: "medium",
  providerId: "scripted",
  modelId: "mock-model",
  createdAt: "2026-10-03T00:00:00.000Z",
  updatedAt: "2026-10-03T00:00:00.000Z",
};

const credentials: CredentialStore = {
  save: async () => {},
  load: async () => sealSecret("sk-ant-api03-FAKE-KEY-FOR-METRICS-TESTS"),
  describe: async () => undefined,
  list: async () => [],
  remove: async () => {},
  removeAll: async () => {},
};

const answer = (inputTokens: number, outputTokens: number, extra: Partial<Step & { type: "usage" }> = {}): Step[] => [
  { type: "text", delta: "ACCEPT\nSer describe identidad." },
  { type: "usage", inputTokens, outputTokens, ...extra } as Step,
  { type: "stop", reason: "end" },
];

let storage: MemoryStorage;
let conversations: ConversationService;
let conversationId: string;

function makePipeline(script: Step[]) {
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
  return new Pipeline({
    providers: [new ScriptedProvider(script, [MODEL])],
    conversations,
    credentials,
    capabilities,
    getProfile: async () => PROFILE,
    refusalTemplate: () => undefined,
  });
}

async function send(script: Step[], userText = "What does ser mean?"): Promise<TurnEvent[]> {
  const events: TurnEvent[] = [];
  const turn = { conversationId, capabilityId: "language-qa", userText };
  for await (const event of makePipeline(script).run(turn, createTestAbort().signal)) events.push(event);
  return events;
}

const stored = () => storage.query<UsageRecord>("usage", { index: "conversationId", equals: conversationId });
const usageEvents = (events: TurnEvent[]) => events.flatMap((e) => (e.type === "usage" ? [e.record] : []));
const notices = (events: TurnEvent[]) => events.flatMap((e) => (e.type === "notice" ? [e.code] : []));

beforeEach(async () => {
  storage = new MemoryStorage();
  conversations = new ConversationService({ storage, ...makeClock() });
  conversationId = (
    await conversations.create({ capabilityId: "language-qa", languageSnapshot: { mediation: "es", target: "ja" } })
  ).id;
});

describe("Metrics stage: persisted usage (SC-005)", () => {
  it("persists a UsageRecord whose tokens equal the provider's report exactly", async () => {
    await send(answer(1234, 56, { cacheReadTokens: 7 }));
    const [record] = await stored();
    expect(record).toMatchObject({
      conversationId,
      modelId: "mock-model",
      inputTokens: 1234,
      outputTokens: 56,
      cacheReadTokens: 7,
      contextWindow: 10_000,
      configuredEffort: "medium",
    });
  });

  it("persists exactly one record per message, each matching its own report", async () => {
    const reports = [
      [100, 10],
      [250, 33],
      [999, 1],
    ] as const;
    for (const [input, output] of reports) await send(answer(input, output));

    const records = (await stored()).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    expect(records.map((r) => [r.inputTokens, r.outputTokens])).toEqual(reports.map((r) => [...r]));
  });

  it("links the assistant message to its record and emits the same record as a usage event", async () => {
    const events = await send(answer(100, 10));
    const [record] = await stored();
    const opened = await conversations.open(conversationId);
    const reply = opened?.messages.find((m) => m.author === "assistant");

    expect(reply?.usageId).toBe(record?.id);
    expect(record?.messageId).toBe(reply?.id);
    expect(usageEvents(events)).toEqual([record]);
  });

  it("emits the usage event before done", async () => {
    const events = await send(answer(100, 10));
    const types = events.map((e) => e.type);
    expect(types.indexOf("usage")).toBeGreaterThan(-1);
    expect(types.indexOf("usage")).toBeLessThan(types.indexOf("done"));
  });

  it("records a recommended effort and a cost estimate from the model's price row", async () => {
    await send(answer(1_000, 500));
    const [record] = await stored();
    expect(["low", "medium", "high"]).toContain(record?.recommendedEffort);
    expect(record?.estimatedCostUsd).toBeCloseTo((1_000 * 3 + 500 * 15) / 1_000_000);
    expect(record?.pricingAsOf).toBe("2026-10-01");
  });

  it("records nothing when the provider reported no usage (nothing is invented)", async () => {
    const events = await send([
      { type: "text", delta: "ACCEPT\nSer describe identidad." },
      { type: "stop", reason: "end" },
    ]);
    expect(await stored()).toEqual([]);
    expect(usageEvents(events)).toEqual([]);
    expect(events.at(-1)).toEqual({ type: "done", status: "complete" });
  });
});

describe("Metrics stage: context_80 notice (FR-019)", () => {
  it("emits no notice below 80% of the window", async () => {
    const events = await send(answer(7_999, 10));
    expect(notices(events)).not.toContain("context_80");
  });

  it("emits context_80 exactly at 80%", async () => {
    const events = await send(answer(8_000, 10));
    expect(notices(events).filter((c) => c === "context_80")).toHaveLength(1);
  });

  it("emits context_80 above 80%, and counts cache reads toward the context", async () => {
    expect(notices(await send(answer(9_500, 10)))).toContain("context_80");
    expect(notices(await send(answer(2_000, 10, { cacheReadTokens: 6_500 })))).toContain("context_80");
  });

  it("still emits done as the last event", async () => {
    const events = await send(answer(9_500, 10));
    expect(events.at(-1)).toEqual({ type: "done", status: "complete" });
  });
});
