import { PermissionBroker, type PermissionDenial } from "../capabilities/permission-broker";
import type { CapabilityRegistry } from "../capabilities/registry";
import type { Capability, SearchState, ToolDeclaration, ToolSearchOutcome } from "../capabilities/types";
import type { ConversationService, FinishDetails } from "../conversation/service";
import type { Segment, Verdict } from "../conversation/types";
import { CORE_RULES } from "../guardrails/core-rules";
import { resolveRefusal, shippedLocaleOf, type RefusalTemplates } from "../guardrails/refusal";
import { renderScopeLayer, ruleKey } from "../guardrails/scope-layer";
import { VerdictParser, verdictLineOf, type VerdictParse } from "../guardrails/verdict-parser";
import type {
  Effort,
  JsonValue,
  ModelInfo,
  ModelRequest,
  ModelTool,
  ProviderErrorCode,
  ProviderMessage,
  ProviderPort,
  ToolCallRecord,
} from "../ports/provider";
import type { AbortSignalLike } from "../ports/provider";
import type { CredentialStore } from "../ports/storage";
import type { LearnerProfile } from "../profile/types";
import type { ResourceCard } from "../search/resource-card";
import { buildResourceCards, parseShowResources } from "../search/resource-cards";
import type { SearchBroker } from "../search/search-broker";
import { TurnSearchSession } from "../search/turn-search-session";
import { recommendEffort, extractRequestFeatures } from "../stats/recommend-effort";
import { addUsage, type ReportedUsage } from "../stats/usage";
import { ContextAssembler } from "./context-assembler";
import { guardInput } from "./input-guard";
import { runMetrics } from "./metrics";
import { OutputGuard } from "./output-guard";
import type { NoticeCode, Pipeline as PipelineContract, TurnEvent, TurnInput } from "./types";
import { wrapUntrusted } from "./untrusted-block";

const DEFAULT_MAX_TOKENS = 4096;
/** Model calls per turn; the last one is offered no tools, so it has to answer (provider-tool-calls.md). */
const MAX_STEPS = 4;
const MAX_SEARCH_CALLS = 2;
const MAX_PRESENTATION_CALLS = 1;

export interface PipelineDeps {
  /**
   * Every provider the build offers (004 FR-001). The profile names the active one; a turn goes to
   * that provider only, with that provider's key, and never falls back to another (FR-003, FR-007).
   */
  providers: readonly ProviderPort[];
  conversations: ConversationService;
  credentials: CredentialStore;
  capabilities: CapabilityRegistry;
  getProfile: () => Promise<LearnerProfile>;
  /** Catalog lookup for refusal templates (FR-027). The app supplies it; the core has no catalogs. */
  refusalTemplate: RefusalTemplates;
  /** Search sources (005). Without it no turn offers search tools. */
  search?: SearchBroker;
}

/**
 * The single entry point for every model interaction (contracts/pipeline.md) and, together with
 * `CredentialValidator`, the only holder of a `ProviderPort`.
 *
 * Stage order is fixed here, not configurable and not injectable:
 * InputGuard → ContextAssembler → ModelCall → OutputGuard → Metrics.
 * Metrics runs once the answer is finished and persists the provider-reported usage. The OutputGuard also reads the first-line verdict
 * (ACCEPT | REFUSE | CLARIFY): a refusal replaces the model's text, and a missing verdict fails
 * closed to a refusal.
 */
export class Pipeline implements PipelineContract {
  readonly #deps: PipelineDeps;
  readonly #assembler = new ContextAssembler();

  constructor(deps: PipelineDeps) {
    const providers = Object.freeze([...(deps.providers ?? [])]);
    if (providers.length === 0) throw new Error("Pipeline needs at least one provider.");
    if (new Set(providers.map((p) => p.id)).size !== providers.length) throw new Error("Provider ids must be unique.");
    this.#deps = Object.freeze({ ...deps, providers });
    // Nothing on the instance or the prototype can be replaced, so the stage order above holds (US8-3).
    Object.freeze(this);
  }

  /** Emits exactly one `done` or `error`. Never retries the provider (cost safety). */
  async *run(turn: TurnInput, signal: AbortSignalLike): AsyncGenerator<TurnEvent> {
    const { conversations, credentials, capabilities, search } = this.#deps;

    const capability = capabilities.get(turn.capabilityId);
    const opened = await conversations.open(turn.conversationId);
    if (!capability || !opened) {
      yield { type: "error", code: "bad_request" };
      return;
    }
    const profile = await this.#deps.getProfile();
    const provider = this.#deps.providers.find((p) => p.id === profile.providerId);
    if (!provider) {
      yield { type: "error", code: "bad_request" };
      return;
    }
    const secret = await credentials.load(provider.id);
    if (!secret) {
      yield { type: "error", code: "invalid_credential" };
      return;
    }

    // Stage 1: InputGuard. Key-shaped text is withheld from the model and from storage; only the
    // guarded text goes any further.
    const guarded = guardInput(turn);
    if (guarded.keyShapeDetected) yield { type: "guard_warning", code: "key_shape_detected" };

    // Stage 2: ContextAssembler. The scope layer holds every loaded rule: the core's, then those of
    // the conversation's capability and of the one shared by all conversations. The verdict names
    // all of them, because the one-word verdict line cannot say which rule decided it.
    const turnCapabilities = capabilities.forTurn(turn.capabilityId);
    const sharedCapabilities = turnCapabilities.filter((c) => c.id !== capability.id);
    const rules = [...CORE_RULES, ...turnCapabilities.flatMap((c) => c.domainRules)];
    const ruleIds = rules.map(ruleKey);
    const mediationHasCatalog = shippedLocaleOf(profile.mediationLanguage) !== undefined;
    const model = provider.listModels().find((m) => m.id === profile.modelId);

    const searchState = await this.#searchState(turnCapabilities, model);
    const offered = offeredTools(turnCapabilities, model, searchState, profile.mediationLanguage);
    const context = this.#assembler.assemble({
      profile,
      capability,
      sharedCapabilities,
      searchState,
      domainScope: renderScopeLayer(rules, { mediationLanguage: profile.mediationLanguage, mediationHasCatalog, toolsOffered: offered.length > 0 }),
      history: opened.messages,
      turn: { userText: guarded.userText, untrustedMaterial: guarded.untrustedMaterial },
    });
    const baseRequest = {
      modelId: profile.modelId,
      layers: context.layers,
      maxTokens: model ? Math.min(model.maxOutput, DEFAULT_MAX_TOKENS) : DEFAULT_MAX_TOKENS,
      ...effortFor(model, profile.configuredEffort),
    };

    const recommendedEffort = recommendEffort(
      extractRequestFeatures({ userText: guarded.userText, untrustedMaterial: guarded.untrustedMaterial }),
    );

    const userMessage = await conversations.addUserMessage(turn.conversationId, guarded.segments);
    const reply = await conversations.beginAssistantMessage(turn.conversationId);
    let finished = false;
    const finish = async (status: "complete" | "interrupted" | "refused", details: FinishDetails = {}) => {
      finished = true;
      await conversations.finish(reply.id, status, details);
    };

    // The turn's search state: results numbered for the model, cards chosen, and what happened.
    const session = new TurnSearchSession();
    let pendingCards: ResourceCard[] = [];
    const searchRuns: { sourceId: string; ok: boolean; code?: string }[] = [];
    const denials: PermissionDenial[] = [];
    const brokers = new Map<string, PermissionBroker>();
    const brokerOf = (owner: Readonly<Capability>): PermissionBroker => {
      let broker = brokers.get(owner.id);
      if (!broker) {
        broker = new PermissionBroker({
          capability: owner,
          onDenial: (denial) => denials.push(denial),
          services: {
            targetLanguage: profile.targetLanguage,
            ...(search && {
              search: async (sourceId, req): Promise<ToolSearchOutcome> => {
                const outcome = await search.run(sourceId, req, signal);
                searchRuns.push({ sourceId, ok: outcome.ok, ...(!outcome.ok && { code: outcome.code }) });
                if (!outcome.ok) return { ok: false, error: outcome.code };
                return { ok: true, results: session.add(outcome.results) };
              },
            }),
          },
        });
        brokers.set(owner.id, broker);
      }
      return broker;
    };
    const toolGuard = new OutputGuard();
    /** Every segment of the turn so far; tool results join it as untrusted (FR-010). */
    const turnSegments: Segment[] = [...guarded.segments];

    try {
      if (signal.aborted) {
        await finish("interrupted");
        yield { type: "done", status: "interrupted" };
        return;
      }

      // Stage 3: ModelCall, in as many steps as the model needs tools. Stage 4: OutputGuard on the
      // text of the last step only.
      let guard: OutputGuard | undefined;
      const guardFor = (): OutputGuard => {
        guard ??= new OutputGuard(
          searchRuns.length > 0 ? { allowedLinks: new Set(pendingCards.map((c) => c.link)) } : {},
        );
        return guard;
      };
      // Rebuilt for each step: only the final step's text reaches it (tool steps are buffered and
      // dropped), with the verdict of the most recent tool step as its fallback (research R15).
      let parser = new VerdictParser();
      let carriedVerdict: Verdict | undefined;
      let verdict: Verdict | undefined;
      let refusalBody = "";
      let received = false;
      let failure: { code: ProviderErrorCode; retryAfterSeconds?: number } | undefined;
      let ended: "complete" | "interrupted" | undefined;
      // The provider itself declined to answer (a safety filter, 004 research R5).
      let providerRefused = false;
      let usage: ReportedUsage | undefined;
      let steps = 0;
      let searchCalls = 0;
      let presentationCalls = 0;
      const messages: ProviderMessage[] = [...context.messages];

      const refusal = () =>
        resolveRefusal({
          templates: this.#deps.refusalTemplate,
          templateKey: rules[0]?.refusalTemplateKey ?? "",
          mediationLanguage: profile.mediationLanguage,
          uiLanguage: profile.uiLanguage,
          modelBody: refusalBody,
        });
      /** Persists and renders text the learner is allowed to see. */
      const show = async (text: string): Promise<TurnEvent> => {
        await conversations.appendText(reply.id, text);
        return { type: "render", blocks: guardFor().push(text) };
      };
      /** Applies one parser result and returns the events it produces. */
      const apply = async (parsed: VerdictParse): Promise<TurnEvent[]> => {
        const out: TurnEvent[] = [];
        if (parsed.verdict === null) return out;
        if (verdict === undefined) {
          verdict = parsed.verdict;
          out.push({ type: "verdict", verdict, ruleIds });
          // A shipped language gets the template at once; whatever the model adds is dropped.
          if (verdict === "refuse" && mediationHasCatalog) out.push(await show(refusal()));
        }
        if (parsed.text === "") return out;
        if (verdict !== "refuse") out.push(await show(parsed.text));
        else if (!mediationHasCatalog) {
          refusalBody += parsed.text;
          out.push(await show(parsed.text));
        }
        return out;
      };
      const searchSummary = () => {
        const counted = searchRuns.filter((r) => !["disabled", "no_consent", "bad_request"].includes(r.code ?? ""));
        const bySource = new Map<string, number>();
        for (const r of counted) bySource.set(r.sourceId, (bySource.get(r.sourceId) ?? 0) + 1);
        return [...bySource].map(([sourceId, count]) => ({ sourceId, count }));
      };
      const flushDenials = function* (): Generator<TurnEvent> {
        for (const denial of denials.splice(0)) yield { type: "permission_denied", denial };
      };

      try {
        for (let step = 1; step <= MAX_STEPS; step++) {
          // The last step is offered no tools, so the model has to answer.
          const tools: ModelTool[] = step < MAX_STEPS ? offered.map((o) => o.modelTool) : [];
          const request: ModelRequest = { ...baseRequest, messages: [...messages], ...(tools.length > 0 && { tools }) };
          // With tools on offer a step may turn out to be a tool step, whose text is never shown:
          // its text waits until the step ends.
          const buffering = tools.length > 0;
          const buffered: string[] = [];
          const calls: ToolCallRecord[] = [];
          steps += 1;
          parser = new VerdictParser({ fallback: carriedVerdict });

          for await (const event of provider.stream(request, secret, signal)) {
            if (signal.aborted) {
              ended = "interrupted";
              break;
            }
            if (event.type === "text") {
              if (buffering) buffered.push(event.delta);
              else {
                received = true;
                for (const out of await apply(parser.push(event.delta))) yield out;
              }
            } else if (event.type === "tool_call") {
              calls.push({
                id: event.id,
                name: event.name,
                input: event.input,
                ...(event.continuation !== undefined && { continuation: event.continuation }),
              });
            } else if (event.type === "stop") {
              ended = event.reason === "aborted" ? "interrupted" : "complete";
              providerRefused = event.reason === "refusal";
              break;
            } else if (event.type === "error") {
              failure = {
                code: event.code,
                ...(event.retryAfterSeconds !== undefined && { retryAfterSeconds: event.retryAfterSeconds }),
              };
              break;
            } else if (event.type === "usage") {
              usage = addUsage(usage, {
                inputTokens: event.inputTokens,
                outputTokens: event.outputTokens,
                cacheReadTokens: event.cacheReadTokens,
                cacheWriteTokens: event.cacheWriteTokens,
              });
            }
          }

          const toolStep = buffering && calls.length > 0 && ended === "complete" && !failure && !providerRefused;
          if (!toolStep) {
            // The final step: whatever it said is the answer. Buffered text is shown now.
            for (const delta of buffered) {
              received = true;
              for (const out of await apply(parser.push(delta))) yield out;
            }
            break;
          }

          // A step with tool calls: its text is dropped, its calls are judged and run in order. Its
          // verdict line, if well formed, stands in for a final step that opens without one.
          const stepText = buffered.join("");
          carriedVerdict = verdictLineOf(stepText) ?? carriedVerdict;
          const results: ProviderMessage[] = [];
          for (const toolCall of calls) {
            const owner = turnCapabilities.find((c) => c.tools.some((t) => t.name === toolCall.name)) ?? capability;
            const entry = offered.find((o) => o.tool.name === toolCall.name && o.owner.id === owner.id);
            const broker = brokerOf(owner);
            let payload: { ok: boolean; output?: JsonValue; error?: string };

            const decision = toolGuard.checkToolCall({ broker, toolName: toolCall.name }, turnSegments);
            if (decision.outcome === "denied" || !entry) {
              payload = { ok: false, error: "permission_denied" };
            } else if (decision.outcome === "needs_confirmation") {
              payload = { ok: false, error: "needs_confirmation" };
            } else if (entry.tool.presentation !== undefined) {
              if (presentationCalls >= MAX_PRESENTATION_CALLS) payload = { ok: false, error: "limit_reached" };
              else {
                presentationCalls += 1;
                const items = parseShowResources(toolCall.input);
                const built = items
                  ? buildResourceCards({ session, items, interests: profile.interests, requestText: guarded.userText })
                  : undefined;
                if (!built || built.cards.length === 0) payload = { ok: false, error: "no_valid_items" };
                else {
                  pendingCards = built.cards;
                  payload = { ok: true, output: { shown: built.cards.length } };
                }
              }
            } else {
              const sources = searchSourcesOf(entry.tool);
              if (sources.length > 0 && searchCalls >= MAX_SEARCH_CALLS) {
                payload = { ok: false, error: "limit_reached" };
              } else {
                let missing: string | undefined;
                for (const source of sources) if (!(await search?.hasConsent(source))) missing ??= source;
                if (missing !== undefined) {
                  // Nothing is sent and nothing is kept: the app asks, then the learner sends it again.
                  await finish("interrupted");
                  await runMetrics({
                    conversations,
                    conversationId: turn.conversationId,
                    messageId: reply.id,
                    providerId: provider.id,
                    usage,
                    model,
                    configuredEffort: profile.configuredEffort,
                    recommendedEffort,
                    steps,
                  });
                  await conversations.discard(reply.id);
                  await conversations.discard(userMessage.id);
                  yield* flushDenials();
                  yield { type: "done", status: "consent_required", sourceId: missing };
                  return;
                }
                if (sources.length > 0) {
                  searchCalls += 1;
                  yield { type: "status", code: "searching" };
                }
                const ran = await decision.run(toolCall.input);
                payload = ran.ok ? { ok: true, output: ran.output } : { ok: false, error: ran.error };
              }
            }
            yield* flushDenials();
            // Whatever a tool returned came from outside: it reaches the model fenced as data, and
            // later segments of the turn count as untrusted.
            const content = wrapUntrusted("external", JSON.stringify(payload));
            turnSegments.push({ trust: "untrusted", text: content });
            results.push({ role: "tool", toolCallId: toolCall.id, name: toolCall.name, content });
            if (signal.aborted) break;
          }

          if (signal.aborted) {
            ended = "interrupted";
            break;
          }
          messages.push({ role: "assistant", content: stepText, toolCalls: calls }, ...results);
          // Only the last step is read.
          ended = undefined;
        }
        // A finished stream that never produced a verdict fails closed to a refusal. An interrupted
        // or failed one does not: the learner is told it was interrupted instead.
        if (ended === "complete" && !failure) {
          for (const out of await apply(parser.finish())) yield out;
          if (verdict === "refuse" && !mediationHasCatalog && refusalBody.trim() === "") yield await show(refusal());
          // The model had started an answer and the provider cut it off: what was shown stays, the
          // refusal follows, and the message is never stored as complete.
          else if (providerRefused && verdict !== "refuse") yield await show(`\n\n${refusal()}`);
        }
      } catch {
        // An adapter fault is reported by code only; its message is never forwarded.
        failure = { code: "unknown" };
      }

      if (failure && !received) {
        await finish("interrupted");
        yield* flushDenials();
        yield { type: "error", ...failure };
        return;
      }
      let status: "complete" | "interrupted" | "refused" = failure || ended === undefined ? "interrupted" : ended;
      if (status === "complete" && (verdict === "refuse" || providerRefused)) status = "refused";
      const cards = verdict === "accept" && status === "complete" ? pendingCards : [];
      const summary = searchSummary();
      const searchCount = summary.reduce((total, s) => total + s.count, 0);
      await finish(status, {
        ...(verdict !== undefined && { verdict, ruleIds }),
        ...(cards.length > 0 && { resources: cards }),
        ...(searchCount > 0 && { searchCount }),
      });
      yield* flushDenials();
      if (cards.length > 0) yield { type: "resources", cards };
      // Stage 5: Metrics. Whatever the provider reported is kept, even for a partial answer.
      for (const out of await runMetrics({
        conversations,
        conversationId: turn.conversationId,
        messageId: reply.id,
        providerId: provider.id,
        usage,
        model,
        configuredEffort: profile.configuredEffort,
        recommendedEffort,
        steps,
        searches: summary,
      })) {
        yield out;
      }
      for (const code of searchNotices(searchRuns)) yield { type: "notice", code };
      // A user stop is not news; a dropped connection is.
      if (status === "interrupted" && !signal.aborted) yield { type: "notice", code: "interrupted" };
      yield { type: "done", status };
    } finally {
      // The consumer stopped reading early: never leave a message stuck in `streaming`.
      if (!finished) await conversations.finish(reply.id, "interrupted");
    }
  }

  /** What the turn can do with search, decided by the app and told to the model (FR-009). */
  async #searchState(
    turnCapabilities: readonly Readonly<Capability>[],
    model: ModelInfo | undefined,
  ): Promise<SearchState> {
    if (!model?.supportsTools) return "model_cannot_search";
    const sources = new Set(turnCapabilities.flatMap((c) => c.tools.flatMap(searchSourcesOf)));
    if (sources.size === 0) return "available";
    if (!this.#deps.search) return "off";
    for (const source of sources) {
      const state = await this.#deps.search.availability(source);
      if (state !== "ready") return state;
    }
    return "available";
  }
}

Object.freeze(Pipeline.prototype);

function effortFor(model: ModelInfo | undefined, effort: Effort): { effort?: Effort } {
  return model?.supportsEffort && model.effortLevels.includes(effort) ? { effort } : {};
}

interface OfferedTool {
  owner: Readonly<Capability>;
  tool: Readonly<ToolDeclaration>;
  modelTool: ModelTool;
}

/** Sources a tool may search, from its declared permissions. */
function searchSourcesOf(tool: Readonly<ToolDeclaration>): string[] {
  return tool.requiredPermissions.flatMap((p) => (p.kind === "search" ? p.sources : []));
}

/** Search-bound tools are offered only when search is available; the rest whenever the model can use tools. */
function offeredTools(
  capabilities: readonly Readonly<Capability>[],
  model: ModelInfo | undefined,
  searchState: SearchState,
  mediation: string,
): OfferedTool[] {
  if (!model?.supportsTools) return [];
  const base = mediation.split("-")[0] ?? mediation;
  const out: OfferedTool[] = [];
  const names = new Set<string>();
  for (const owner of capabilities) {
    for (const tool of owner.tools) {
      const searchBound = tool.presentation !== undefined || searchSourcesOf(tool).length > 0;
      if ((searchBound && searchState !== "available") || names.has(tool.name)) continue;
      names.add(tool.name);
      const description =
        tool.description[mediation] ?? tool.description[base] ?? tool.description["en"] ?? Object.values(tool.description)[0] ?? "";
      out.push({
        owner,
        tool,
        modelTool: { name: tool.name, description, inputSchema: tool.inputSchema as ModelTool["inputSchema"] },
      });
    }
  }
  return out;
}

/** Notices for what went wrong with searches in a turn (005 FR-010). */
function searchNotices(runs: readonly { ok: boolean; code?: string }[]): NoticeCode[] {
  const notices: NoticeCode[] = [];
  const failed = runs.filter((r) => !r.ok);
  if (failed.length > 0 && runs.some((r) => r.ok)) notices.push("search_incomplete");
  if (failed.some((r) => r.code === "invalid_credential" || r.code === "not_enabled")) notices.push("search_key_error");
  if (failed.some((r) => r.code === "quota_exhausted")) notices.push("search_quota");
  return notices;
}
