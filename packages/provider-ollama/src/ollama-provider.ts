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
import { mapStatus, mapThrown, type ErrorContext, type MappedFailure, type OllamaDiagnostic } from "./errors";
import { DEFAULT_OLLAMA_MODEL_ID, OLLAMA_MODELS } from "./models";
import { readSse } from "./sse";

export interface OllamaProviderOptions {
  /** Where the runtime listens. Default `http://localhost:11434`. */
  baseUrl?: string;
  /** Replaces the global `fetch`. Tests use it to run the adapter without a network. */
  fetch?: typeof fetch;
  /** Receives non-secret diagnostics only (research R4). Default: ignored. */
  diagnose?: (diagnostic: OllamaDiagnostic) => void;
  /** The model `validateCredential` checks is installed. */
  defaultModelId?: string;
}

const DEFAULT_BASE_URL = "http://localhost:11434";

/**
 * The development-only adapter for a local Ollama runtime, through its OpenAI-compatible endpoint
 * (specs/002-free-dev-provider). Ollama has no credential, so the `SecretHandle` it is given is
 * never read, and no `Authorization` header is sent. It must never be imported outside the dev-only
 * branch of the composition root and `tests/`.
 *
 * Never sent (research R2): effort, tools, sampling parameters, any credential. One request per
 * call, never retried.
 */
export class OllamaProvider implements ProviderPort {
  readonly id = "ollama";
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #diagnose: (diagnostic: OllamaDiagnostic) => void;
  readonly #defaultModelId: string;

  constructor(options: OllamaProviderOptions = {}) {
    this.#baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    // Not bound to a receiver: calling the global `fetch` as a method of another object throws.
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.#diagnose = options.diagnose ?? (() => undefined);
    this.#defaultModelId = options.defaultModelId ?? DEFAULT_OLLAMA_MODEL_ID;
  }

  listModels(): ModelInfo[] {
    return [...OLLAMA_MODELS];
  }

  async validateCredential(_secret: SecretHandle, signal?: AbortSignalLike): Promise<ValidationResult> {
    if (signal?.aborted) return { ok: false, code: "network" };
    const ctx: ErrorContext = { baseUrl: this.#baseUrl, modelId: this.#defaultModelId };

    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}/v1/models`, signal ? { method: "GET", signal: signal as AbortSignal } : { method: "GET" });
    } catch (error) {
      const failure = mapThrown(error, ctx);
      if (!signal?.aborted) this.#diagnose(failure.diagnostic);
      return { ok: false, code: failure.code };
    }

    if (!response.ok) {
      const failure = mapStatus(response.status, ctx);
      this.#diagnose(failure.diagnostic);
      return { ok: false, code: failure.code };
    }

    // The runtime answered, so it is usable. A missing default model is a hint, not a failure.
    if (!(await listsModel(response, this.#defaultModelId))) {
      this.#diagnose({ kind: "model_not_installed", baseUrl: this.#baseUrl, modelId: this.#defaultModelId });
    }
    return { ok: true };
  }

  async *stream(req: ModelRequest, _secret: SecretHandle, signal: AbortSignalLike): AsyncGenerator<StreamEvent> {
    if (signal.aborted) {
      yield { type: "stop", reason: "aborted" };
      return;
    }
    const ctx: ErrorContext = { baseUrl: this.#baseUrl, modelId: req.modelId };
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort, { once: true });

    let stopReason: StopReason | undefined;
    let usage: { inputTokens: number; outputTokens: number } | undefined;
    let failure: MappedFailure | undefined;

    try {
      const response = await this.#fetch(`${this.#baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toBody(req)),
        signal: controller.signal,
      });
      if (!response.ok) {
        failure = mapStatus(response.status, ctx);
      } else if (!response.body) {
        failure = failed("unknown", ctx);
      } else {
        for await (const raw of readSse(response.body)) {
          const chunk = readChunk(raw);
          if (chunk.failed) {
            failure = failed("unknown", ctx);
            break;
          }
          if (chunk.text) yield { type: "text", delta: chunk.text };
          if (chunk.finishReason) stopReason = STOP_REASONS[chunk.finishReason] ?? "end";
          if (chunk.usage) usage = chunk.usage;
        }
      }
    } catch (error) {
      if (!signal.aborted) {
        // A malformed line is a runtime fault, not an unreachable one.
        failure = error instanceof Error && error.name === "SseParseError" ? failed("unknown", ctx) : mapThrown(error, ctx);
      }
    } finally {
      signal.removeEventListener("abort", onAbort);
    }

    if (signal.aborted) {
      yield { type: "stop", reason: "aborted" };
    } else if (failure) {
      this.#diagnose(failure.diagnostic);
      yield { type: "error", code: failure.code };
    } else if (stopReason === undefined) {
      // The connection ended without a finish reason: the answer is incomplete.
      this.#diagnose({ kind: "failed", baseUrl: this.#baseUrl, modelId: req.modelId });
      yield { type: "error", code: "network" };
    } else {
      if (usage) yield { type: "usage", ...usage };
      yield { type: "stop", reason: stopReason };
    }
  }
}

const STOP_REASONS: Record<string, StopReason> = {
  stop: "end",
  length: "max_tokens",
};

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("OllamaProvider: baseUrl must be an http(s) URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("OllamaProvider: baseUrl must be an http(s) URL.");
  }
  return value.replace(/\/+$/, "");
}

function failed(code: MappedFailure["code"], ctx: ErrorContext): MappedFailure {
  return { code, diagnostic: { kind: "failed", baseUrl: ctx.baseUrl, ...(ctx.modelId ? { modelId: ctx.modelId } : {}) } };
}

function toBody(req: ModelRequest) {
  const system = req.layers.map((layer) => layer.text).join("\n\n");
  return {
    model: req.modelId,
    // One system message is the most portable form across OpenAI-compatible servers (research R2).
    messages: [
      ...(req.layers.length > 0 ? [{ role: "system", content: system }] : []),
      ...req.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    max_tokens: req.maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  };
}

interface ReadChunk {
  failed?: true;
  text?: string;
  finishReason?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

/** Reads only the fields the adapter uses; anything else in the chunk is ignored. */
function readChunk(raw: unknown): ReadChunk {
  if (!isRecord(raw)) return { failed: true };
  if ("error" in raw) return { failed: true };
  const out: ReadChunk = {};
  const choice = Array.isArray(raw["choices"]) ? raw["choices"][0] : undefined;
  if (isRecord(choice)) {
    const delta = choice["delta"];
    if (isRecord(delta) && typeof delta["content"] === "string") out.text = delta["content"];
    if (typeof choice["finish_reason"] === "string") out.finishReason = choice["finish_reason"];
  }
  const usage = raw["usage"];
  if (isRecord(usage) && typeof usage["prompt_tokens"] === "number" && typeof usage["completion_tokens"] === "number") {
    out.usage = { inputTokens: usage["prompt_tokens"], outputTokens: usage["completion_tokens"] };
  }
  return out;
}

async function listsModel(response: Response, modelId: string): Promise<boolean> {
  try {
    const body: unknown = await response.json();
    const data = isRecord(body) ? body["data"] : undefined;
    return Array.isArray(data) && data.some((entry) => isRecord(entry) && entry["id"] === modelId);
  } catch {
    // An unreadable list says nothing about the model, so do not warn about it.
    return true;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
