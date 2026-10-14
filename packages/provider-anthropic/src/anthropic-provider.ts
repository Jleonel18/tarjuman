import type {
  AbortSignalLike,
  JsonValue,
  ModelInfo,
  ModelRequest,
  ProviderMessage,
  ProviderPort,
  SecretHandle,
  StopReason,
  StreamEvent,
  ValidationResult,
} from "@tarjuman/core";
import { SecretStreamFilter, unsealSecret } from "@tarjuman/core/adapter";
import type { MessageCreateParamsStreaming, MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";
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
 * `tools` goes only when the request carries them (005); no `thinking` means no thinking blocks to echo.
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
    // Defense in depth: the key is never in the prompt, but if it ever came back in the text it
    // would be redacted before it reaches the UI or storage.
    const filter = new SecretStreamFilter(unsealSecret(secret));
    // Tool-use blocks being assembled, by content-block index: the input arrives as JSON fragments.
    const toolBlocks = new Map<number, { id: string; name: string; json: string }>();

    try {
      const events = await createClient(secret, this.#options).messages.create(toParams(req), {
        signal: controller.signal,
      });
      for await (const event of events) {
        if (event.type === "message_start") {
          mergeUsage(usage, event.message.usage);
        } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          const safe = filter.push(event.delta.text);
          if (safe !== "") yield { type: "text", delta: safe };
        } else if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
          toolBlocks.set(event.index, { id: event.content_block.id, name: event.content_block.name, json: "" });
        } else if (event.type === "content_block_delta" && event.delta.type === "input_json_delta") {
          const block = toolBlocks.get(event.index);
          if (block) block.json += event.delta.partial_json;
        } else if (event.type === "content_block_stop" && toolBlocks.has(event.index)) {
          const block = toolBlocks.get(event.index);
          toolBlocks.delete(event.index);
          const input = block ? parseToolInput(block.json) : undefined;
          if (!block || input === undefined) {
            const rest = filter.flush();
            if (rest !== "") yield { type: "text", delta: rest };
            yield { type: "error", code: "bad_request" };
            return;
          }
          yield { type: "tool_call", id: block.id, name: block.name, input };
        } else if (event.type === "message_delta") {
          mergeUsage(usage, event.usage);
          const reason = event.delta.stop_reason;
          if (reason) stopReason = STOP_REASONS[reason] ?? "end";
        }
      }
    } catch (error) {
      const rest = filter.flush();
      if (rest !== "") yield { type: "text", delta: rest };
      if (signal.aborted) {
        yield { type: "stop", reason: "aborted" };
      } else {
        yield { type: "error", ...mapProviderError(error) };
      }
      return;
    } finally {
      signal.removeEventListener("abort", onAbort);
    }

    const rest = filter.flush();
    if (rest !== "") yield { type: "text", delta: rest };

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

/** An empty input is `{}` (a tool with no arguments); anything but a JSON object is unusable. */
function parseToolInput(json: string): JsonValue | undefined {
  if (json.trim() === "") return {};
  try {
    const value = JSON.parse(json) as JsonValue;
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Consecutive `tool` messages (one per call of a step) become one user message of `tool_result`
 * blocks, which is what Anthropic requires right after the assistant's `tool_use` blocks.
 */
function toMessageParams(messages: ProviderMessage[]): MessageParam[] {
  const out: MessageParam[] = [];
  for (const m of messages) {
    if (m.role === "tool") {
      const block = { type: "tool_result" as const, tool_use_id: m.toolCallId, content: m.content };
      const last = out.at(-1);
      if (last && last.role === "user" && Array.isArray(last.content) && last.content.every((b) => b.type === "tool_result")) {
        last.content.push(block);
      } else {
        out.push({ role: "user", content: [block] });
      }
    } else if ("toolCalls" in m) {
      out.push({
        role: "assistant",
        content: [
          ...(m.content === "" ? [] : [{ type: "text" as const, text: m.content }]),
          // `continuation` is Gemini's; Anthropic needs none because no thinking is requested.
          ...m.toolCalls.map((call) => ({ type: "tool_use" as const, id: call.id, name: call.name, input: call.input })),
        ],
      });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

function toTools(tools: ModelRequest["tools"]): Tool[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: { ...tool.inputSchema, type: "object" as const },
  }));
}

function toParams(req: ModelRequest): MessageCreateParamsStreaming {
  const model = ANTHROPIC_MODELS.find((m) => m.id === req.modelId);
  const effort = req.effort && model?.supportsEffort && model.effortLevels.includes(req.effort) ? req.effort : undefined;
  const tools = toTools(req.tools);
  return {
    model: req.modelId,
    max_tokens: req.maxTokens,
    stream: true,
    // One block per layer keeps the precedence order visible to the model.
    system: req.layers.map((layer) => ({ type: "text" as const, text: layer.text })),
    messages: toMessageParams(req.messages),
    ...(tools && { tools }),
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
