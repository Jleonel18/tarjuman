import type { CapabilityRegistry } from "../capabilities/registry";
import type { ConversationService, FinishDetails } from "../conversation/service";
import type { Segment, Verdict } from "../conversation/types";
import { CORE_RULES } from "../guardrails/core-rules";
import { resolveRefusal, shippedLocaleOf, type RefusalTemplates } from "../guardrails/refusal";
import { renderScopeLayer, ruleKey } from "../guardrails/scope-layer";
import { VerdictParser, type VerdictParse } from "../guardrails/verdict-parser";
import type { Effort, ModelInfo, ModelRequest, ProviderErrorCode, ProviderPort } from "../ports/provider";
import type { AbortSignalLike } from "../ports/provider";
import type { CredentialStore } from "../ports/storage";
import type { LearnerProfile } from "../profile/types";
import { ContextAssembler } from "./context-assembler";
import { OutputGuard } from "./output-guard";
import type { Pipeline as PipelineContract, TurnEvent, TurnInput } from "./types";

const DEFAULT_MAX_TOKENS = 4096;

export interface PipelineDeps {
  provider: ProviderPort;
  conversations: ConversationService;
  credentials: CredentialStore;
  capabilities: CapabilityRegistry;
  getProfile: () => Promise<LearnerProfile>;
  /** Catalog lookup for refusal templates (FR-027). The app supplies it; the core has no catalogs. */
  refusalTemplate: RefusalTemplates;
}

/**
 * The single entry point for every model interaction (contracts/pipeline.md) and, together with
 * `CredentialValidator`, the only holder of a `ProviderPort`.
 *
 * Stage order is fixed here, not configurable and not injectable:
 * InputGuard → ContextAssembler → ModelCall → OutputGuard → Metrics.
 * InputGuard and Metrics are identity stages for now; they get their behavior in US3 and US4
 * without changing the order or the count. The OutputGuard also reads the first-line verdict
 * (ACCEPT | REFUSE | CLARIFY): a refusal replaces the model's text, and a missing verdict fails
 * closed to a refusal.
 */
export class Pipeline implements PipelineContract {
  readonly #deps: PipelineDeps;
  readonly #assembler = new ContextAssembler();

  constructor(deps: PipelineDeps) {
    this.#deps = deps;
  }

  /** Emits exactly one `done` or `error`. Never retries the provider (cost safety). */
  async *run(turn: TurnInput, signal: AbortSignalLike): AsyncGenerator<TurnEvent> {
    const { conversations, credentials, capabilities } = this.#deps;

    const capability = capabilities.get(turn.capabilityId);
    const opened = await conversations.open(turn.conversationId);
    if (!capability || !opened) {
      yield { type: "error", code: "bad_request" };
      return;
    }
    const secret = await credentials.load();
    if (!secret) {
      yield { type: "error", code: "invalid_credential" };
      return;
    }
    const profile = await this.#deps.getProfile();

    // Stage 1: InputGuard (identity for now).
    const segments: Segment[] = [
      { trust: "user", text: turn.userText },
      ...(turn.untrustedMaterial ?? []).map((m): Segment => ({ trust: "untrusted", text: m.text })),
    ];

    // Stage 2: ContextAssembler. The scope layer holds every loaded rule: the core's, then the
    // capability's. The verdict names all of them, because the one-word verdict line cannot say
    // which rule decided it.
    const rules = [...CORE_RULES, ...capability.domainRules];
    const ruleIds = rules.map(ruleKey);
    const mediationHasCatalog = shippedLocaleOf(profile.mediationLanguage) !== undefined;
    const context = this.#assembler.assemble({
      profile,
      capability,
      domainScope: renderScopeLayer(rules, { mediationLanguage: profile.mediationLanguage, mediationHasCatalog }),
      history: opened.messages,
      turn: { userText: turn.userText, untrustedMaterial: turn.untrustedMaterial },
    });
    const model = this.#deps.provider.listModels().find((m) => m.id === profile.modelId);
    const request: ModelRequest = {
      modelId: profile.modelId,
      layers: context.layers,
      messages: context.messages,
      maxTokens: model ? Math.min(model.maxOutput, DEFAULT_MAX_TOKENS) : DEFAULT_MAX_TOKENS,
      ...effortFor(model, profile.configuredEffort),
    };

    await conversations.addUserMessage(turn.conversationId, segments);
    const reply = await conversations.beginAssistantMessage(turn.conversationId);
    let finished = false;
    const finish = async (status: "complete" | "interrupted" | "refused", details: FinishDetails = {}) => {
      finished = true;
      await conversations.finish(reply.id, status, details);
    };

    try {
      if (signal.aborted) {
        await finish("interrupted");
        yield { type: "done", status: "interrupted" };
        return;
      }

      // Stage 3: ModelCall. Stage 4: OutputGuard on every delta.
      const guard = new OutputGuard();
      const parser = new VerdictParser();
      let verdict: Verdict | undefined;
      let refusalBody = "";
      let received = false;
      let failure: { code: ProviderErrorCode; retryAfterSeconds?: number } | undefined;
      let ended: "complete" | "interrupted" | undefined;

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
        return { type: "render", blocks: guard.push(text) };
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

      try {
        for await (const event of this.#deps.provider.stream(request, secret, signal)) {
          if (signal.aborted) {
            ended = "interrupted";
            break;
          }
          if (event.type === "text") {
            received = true;
            for (const out of await apply(parser.push(event.delta))) yield out;
          } else if (event.type === "stop") {
            ended = event.reason === "aborted" ? "interrupted" : "complete";
            break;
          } else if (event.type === "error") {
            failure = {
              code: event.code,
              ...(event.retryAfterSeconds !== undefined && { retryAfterSeconds: event.retryAfterSeconds }),
            };
            break;
          }
          // `usage` events are consumed by the Metrics stage (US4).
        }
        // A finished stream that never produced a verdict fails closed to a refusal. An interrupted
        // or failed one does not: the learner is told it was interrupted instead.
        if (ended === "complete" && !failure) {
          for (const out of await apply(parser.finish())) yield out;
          if (verdict === "refuse" && !mediationHasCatalog && refusalBody.trim() === "") yield await show(refusal());
        }
      } catch {
        // An adapter fault is reported by code only; its message is never forwarded.
        failure = { code: "unknown" };
      }

      if (failure && !received) {
        await finish("interrupted");
        yield { type: "error", ...failure };
        return;
      }
      let status: "complete" | "interrupted" | "refused" = failure || ended === undefined ? "interrupted" : ended;
      if (status === "complete" && verdict === "refuse") status = "refused";
      await finish(status, verdict === undefined ? {} : { verdict, ruleIds });
      // A user stop is not news; a dropped connection is.
      if (status === "interrupted" && !signal.aborted) yield { type: "notice", code: "interrupted" };
      yield { type: "done", status };
    } finally {
      // The consumer stopped reading early: never leave a message stuck in `streaming`.
      if (!finished) await conversations.finish(reply.id, "interrupted");
    }
  }
}

function effortFor(model: ModelInfo | undefined, effort: Effort): { effort?: Effort } {
  return model?.supportsEffort && model.effortLevels.includes(effort) ? { effort } : {};
}
