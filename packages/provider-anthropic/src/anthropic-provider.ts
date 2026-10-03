import type {
  AbortSignalLike,
  ModelInfo,
  ModelRequest,
  ProviderPort,
  SecretHandle,
  StopReason,
  StreamEvent,
  ValidationResult,
} from "@tarjuman/core";
import type { MessageCreateParamsStreaming } from "@anthropic-ai/sdk/resources/messages";
import { createClient, type AnthropicProviderOptions } from "./client";
import { mapProviderError } from "./errors";
import { ANTHROPIC_MODELS } from "./models";
import { validateCredential } from "./validate-credential";

const STOP_REASONS: Record<string, StopReason> = {
  end_turn: "end",
  stop_sequence: "end",
  max_tokens: "max_tokens",
  tool_use: "tool_use",
  refusal: "refusal",
};

interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * The Anthropic adapter. It is the only code that imports the SDK and the only place a key is
 * unsealed for a request. Features are applied here from `ModelInfo`; callers only state intent.
 *
 * Never sent, on any model (research R2): `thinking`, `budget_tokens`, sampling params, assistant
 * prefill, forced `tool_choice`. Effort goes in `output_config`, and only for models that support it.
 */
export class AnthropicProvider implements ProviderPort {
  readonly id = "anthropic";
  readonly #options: AnthropicProviderOptions;

  constructor(options: AnthropicProviderOptions = {}) {
    this.#options = options;
  }

  listModels(): ModelInfo[] {
    return [...ANTHROPIC_MODELS];
  }

  validateCredential(secret: SecretHandle, signal?: AbortSignalLike): Promise<ValidationResult> {
    return validateCredential(secret, this.#options, signal);
  }

  async *stream(req: ModelRequest, secret: SecretHandle, signal: AbortSignalLike): AsyncGenerator<StreamEvent> {
    if (signal.aborted) {
      yield { type: "stop", reason: "aborted" };
      return;
    }
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort, { once: true });

    // Latest value wins for every field; nothing is summed (research R4).
    const usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    let stopReason: StopReason | undefined;

    try {
      const events = await createClient(secret, this.#options).messages.create(toParams(req), {
        signal: controller.signal,
      });
      for await (const event of events) {
        if (event.type === "message_start") {
          mergeUsage(usage, event.message.usage);
        } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield { type: "text", delta: event.delta.text };
        } else if (event.type === "message_delta") {
          mergeUsage(usage, event.usage);
          const reason = event.delta.stop_reason;
          if (reason) stopReason = STOP_REASONS[reason] ?? "end";
        }
      }
    } catch (error) {
      if (signal.aborted) {
        yield { type: "stop", reason: "aborted" };
      } else {
        yield { type: "error", ...mapProviderError(error) };
      }
      return;
    } finally {
      signal.removeEventListener("abort", onAbort);
    }

    if (signal.aborted) {
      yield { type: "stop", reason: "aborted" };
    } else if (stopReason === undefined) {
      // The connection ended without a stop reason: the answer is incomplete.
      yield { type: "error", code: "network" };
    } else {
      yield { type: "usage", ...usage };
      yield { type: "stop", reason: stopReason };
    }
  }
}

function toParams(req: ModelRequest): MessageCreateParamsStreaming {
  const model = ANTHROPIC_MODELS.find((m) => m.id === req.modelId);
  const effort = req.effort && model?.supportsEffort && model.effortLevels.includes(req.effort) ? req.effort : undefined;
  return {
    model: req.modelId,
    max_tokens: req.maxTokens,
    stream: true,
    // One block per layer keeps the precedence order visible to the model.
    system: req.layers.map((layer) => ({ type: "text" as const, text: layer.text })),
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    ...(effort && { output_config: { effort } }),
  };
}

interface WireUsage {
  input_tokens?: number | null | undefined;
  output_tokens?: number | null | undefined;
  cache_read_input_tokens?: number | null | undefined;
  cache_creation_input_tokens?: number | null | undefined;
}

function mergeUsage(target: Usage, wire: WireUsage): void {
  if (wire.input_tokens != null) target.inputTokens = wire.input_tokens;
  if (wire.output_tokens != null) target.outputTokens = wire.output_tokens;
  if (wire.cache_read_input_tokens != null) target.cacheReadTokens = wire.cache_read_input_tokens;
  if (wire.cache_creation_input_tokens != null) target.cacheWriteTokens = wire.cache_creation_input_tokens;
}
