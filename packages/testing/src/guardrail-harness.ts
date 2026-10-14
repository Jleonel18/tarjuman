import {
  ConversationService,
  Pipeline,
  SearchBroker,
  SearchSettingsStore,
  sealSecret,
  type CapabilityRegistry,
  type CredentialStore,
  type LearnerProfile,
  type ModelRequest,
  type ProviderPort,
  type RefusalTemplates,
  type SearchPort,
  type SafeBlock,
  type SafeInline,
  type SecretHandle,
  type StreamEvent,
  type TurnEvent,
  type UntrustedMaterial,
  type Verdict,
} from "@tarjuman/core";
import { MemoryStorage } from "@tarjuman/storage-web";
import type { MockStep } from "./mock-provider";

export interface HarnessDeps {
  provider: ProviderPort;
  secret: SecretHandle;
  /** Becomes the learner profile's model. */
  modelId: string;
  capabilities: CapabilityRegistry;
  capabilityId: string;
  refusalTemplate: RefusalTemplates;
  /**
   * Search sources for a turn that may use resource tools (005). Consent is recorded for each, so a
   * compromised model's search goes through; `key` is the raw search key the sources are given.
   */
  search?: { ports: readonly SearchPort[]; key: string };
}

/** What one turn needs. A `GuardrailCase` satisfies it; the adversarial runner adds the extras. */
export interface TurnCase {
  input: string;
  mediation: string;
  target: string;
  /** Pasted or external material, sent as untrusted data next to the input. */
  untrustedMaterial?: UntrustedMaterial[] | undefined;
  /** Defaults to `neutral`. */
  toneId?: string | undefined;
}

export interface GuardrailRun {
  events: TurnEvent[];
  verdict: Verdict | undefined;
  ruleIds: string[];
  status: string | undefined;
  /** What the learner saw, as plain text. */
  text: string;
  /** The first request the pipeline sent. A case without tools is one turn with one request. */
  request: ModelRequest | undefined;
  /** Every request, in order: a turn that uses tools makes several (005). */
  requests: ModelRequest[];
  /** The provider's events exactly as streamed, in the mock-provider script form. */
  steps: MockStep[];
}

/**
 * Runs one case through the real pipeline in a fresh conversation. Only the provider differs
 * between the recorder, the live runner and the per-PR suite, so all three exercise the same
 * code. No retries: a case is one provider call.
 */
export async function runGuardrailCase(c: TurnCase, deps: HarnessDeps): Promise<GuardrailRun> {
  const capturing = new CapturingProvider(deps.provider);
  let tick = 0;
  const storage = new MemoryStorage();
  const conversations = new ConversationService({
    storage,
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString(),
    newId: () => `id-${tick++}`,
  });
  const searchIds = new Set((deps.search?.ports ?? []).map((port) => port.id));
  const credentials: CredentialStore = {
    save: async () => {},
    load: async (id) => (searchIds.has(id) && deps.search ? sealSecret(deps.search.key) : deps.secret),
    describe: async (id) =>
      searchIds.has(id)
        ? { providerId: id, maskedHint: "AIza…", storageMode: "session" as const, validatedAt: "2026-01-01T00:00:00.000Z" }
        : undefined,
    list: async () => [],
    remove: async () => {},
    removeAll: async () => {},
  };
  const settings = new SearchSettingsStore({ storage, now: () => "2026-01-01T00:00:00.000Z" });
  for (const port of deps.search?.ports ?? []) await settings.recordConsent(port.id, port.termsVersion);
  const profile: LearnerProfile = {
    id: "profile",
    uiLanguage: "en",
    mediationLanguage: c.mediation,
    targetLanguage: c.target,
    level: "B1",
    interests: [],
    toneId: c.toneId ?? "neutral",
    configuredEffort: "medium",
    providerId: capturing.id,
    modelId: deps.modelId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const pipeline = new Pipeline({
    providers: [capturing],
    conversations,
    credentials,
    capabilities: deps.capabilities,
    getProfile: async () => profile,
    refusalTemplate: deps.refusalTemplate,
    ...(deps.search && { search: new SearchBroker({ ports: deps.search.ports, settings, credentials }) }),
  });
  const conversation = await conversations.create({
    capabilityId: deps.capabilityId,
    languageSnapshot: { mediation: c.mediation, target: c.target },
  });

  const events: TurnEvent[] = [];
  const controller = new AbortController();
  for await (const event of pipeline.run(
    {
      conversationId: conversation.id,
      capabilityId: deps.capabilityId,
      userText: c.input,
      ...(c.untrustedMaterial && { untrustedMaterial: c.untrustedMaterial }),
    },
    controller.signal,
  )) {
    events.push(event);
  }

  const verdict = events.find((e) => e.type === "verdict");
  const done = events.find((e) => e.type === "done");
  const lastRender = events.filter((e) => e.type === "render").at(-1);
  return {
    events,
    verdict: verdict?.type === "verdict" ? verdict.verdict : undefined,
    ruleIds: verdict?.type === "verdict" ? verdict.ruleIds : [],
    status: done?.type === "done" ? done.status : undefined,
    text: lastRender?.type === "render" ? blocksToText(lastRender.blocks) : "",
    request: capturing.requests[0],
    requests: capturing.requests,
    steps: capturing.steps,
  };
}

/** Passes events through unchanged while keeping the request and a copy of every event. */
class CapturingProvider implements ProviderPort {
  readonly requests: ModelRequest[] = [];
  readonly steps: MockStep[] = [];

  constructor(private readonly inner: ProviderPort) {}

  get id(): string {
    return this.inner.id;
  }

  listModels: ProviderPort["listModels"] = () => this.inner.listModels();

  validateCredential: ProviderPort["validateCredential"] = (secret, signal) =>
    this.inner.validateCredential(secret, signal);

  async *stream(req: ModelRequest, secret: SecretHandle, signal: Parameters<ProviderPort["stream"]>[2]): AsyncGenerator<StreamEvent> {
    this.requests.push(req);
    for await (const event of this.inner.stream(req, secret, signal)) {
      this.steps.push(event);
      yield event;
    }
  }
}

export function blocksToText(blocks: SafeBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "paragraph":
        case "heading":
          return inlineText(block.children);
        case "code_block":
          return block.text;
        case "blockquote":
          return blocksToText(block.children);
        case "list":
          return block.items.map(blocksToText).join("\n");
        case "table":
          return [...block.header, ...block.rows.flat()].map(inlineText).join(" ");
      }
    })
    .join("\n")
    .trim();
}

function inlineText(nodes: SafeInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
        case "code":
          return node.text;
        case "break":
          return "\n";
        default:
          return inlineText(node.children);
      }
    })
    .join("");
}
