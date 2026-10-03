import type { CapabilityRegistry } from "../capabilities/registry";
import type { ConversationService } from "../conversation/service";
import type { Segment } from "../conversation/types";
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
}

/**
 * The single entry point for every model interaction (contracts/pipeline.md) and, together with
 * `CredentialValidator`, the only holder of a `ProviderPort`.
 *
 * Stage order is fixed here, not configurable and not injectable:
 * InputGuard → ContextAssembler → ModelCall → OutputGuard → Metrics.
 * InputGuard and Metrics are identity stages for now; they get their behavior in US3 and US4
 * without changing the order or the count.
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

    // Stage 2: ContextAssembler.
    const context = this.#assembler.assemble({
      profile,
      capability,
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
    const finish = async (status: "complete" | "interrupted") => {
      finished = true;
      await conversations.finish(reply.id, status);
    };

    try {
      if (signal.aborted) {
        await finish("interrupted");
        yield { type: "done", status: "interrupted" };
        return;
      }

      // Stage 3: ModelCall. Stage 4: OutputGuard on every delta.
      const guard = new OutputGuard();
      let received = false;
      let failure: { code: ProviderErrorCode; retryAfterSeconds?: number } | undefined;
      let ended: "complete" | "interrupted" | undefined;

      try {
        for await (const event of this.#deps.provider.stream(request, secret, signal)) {
          if (signal.aborted) {
            ended = "interrupted";
            break;
          }
          if (event.type === "text") {
            received = true;
            await conversations.appendText(reply.id, event.delta);
            yield { type: "render", blocks: guard.push(event.delta) };
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
      } catch {
        // An adapter fault is reported by code only; its message is never forwarded.
        failure = { code: "unknown" };
      }

      if (failure && !received) {
        await finish("interrupted");
        yield { type: "error", ...failure };
        return;
      }
      const status = failure || ended === undefined ? "interrupted" : ended;
      await finish(status);
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
