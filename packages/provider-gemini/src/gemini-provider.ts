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
import { SecretStreamFilter, unsealSecret } from "@tarjuman/core/adapter";
import { mapErrorBody, type MappedError } from "./errors";
import { DEFAULT_GEMINI_MODEL_ID, GEMINI_MODELS } from "./models";
import { GEMINI_API_ORIGIN } from "./origin";
import { readSse, SseParseError } from "./sse";
import { readFunctionCall, toContents, toToolDeclarations, type ReadCall } from "./tools";

export interface GeminiProviderOptions {
  /** Replaces the global `fetch`. Tests use it to run the adapter without a network. */
  fetch?: typeof fetch;
}

const API_BASE = `${GEMINI_API_ORIGIN}/v1beta/models`;

/** `STOP` ends normally and `MAX_TOKENS` is cut by length. Every other reason is a refusal (research R5). */
const STOP_REASONS: Readonly<Record<string, StopReason>> = {
  STOP: "end",
  MAX_TOKENS: "max_tokens",
};

interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Google Gemini, the second product provider (specs/004-gemini-provider, contracts/gemini-provider.md).
 * It calls Gemini's REST API directly from the browser with native `fetch`; no SDK.
 *
 * The key is unsealed only here, only to set the `x-goog-api-key` header. It is never put in a URL
 * (FR-008), a body, a log, an error, or an event. One request per call, never retried. Never sent
 * (research R3): safety settings, sampling parameters, cached content, thought options. Tools are
 * sent only when the request carries them (005).
 */
export class GeminiProvider implements ProviderPort {
  readonly id = "gemini";
  readonly #fetch: typeof fetch;

  constructor(options: GeminiProviderOptions = {}) {
    // Not bound to a receiver: calling the global `fetch` as a method of another object throws.
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init));
  }

  listModels(): ModelInfo[] {
    return [...GEMINI_MODELS];
  }

  /**
   * One `GET` of the default model (research R7): it proves the key is accepted and can reach the
   * model, and it generates nothing, so it costs nothing and spends no free-tier quota.
   */
  async validateCredential(secret: SecretHandle, signal?: AbortSignalLike): Promise<ValidationResult> {
    if (signal?.aborted) return { ok: false, code: "network" };
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await this.#fetch(`${API_BASE}/${encodeURIComponent(DEFAULT_GEMINI_MODEL_ID)}`, {
        method: "GET",
        headers: { "x-goog-api-key": unsealSecret(secret) },
        signal: controller.signal,
      });
      if (response.ok) return { ok: true };
      return { ok: false, code: mapErrorBody(response.status, await readJson(response)).code };
    } catch {
      // Whatever `fetch` threw is dropped: its message could hold anything.
      return { ok: false, code: "network" };
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }

  async *stream(req: ModelRequest, secret: SecretHandle, signal: AbortSignalLike): AsyncGenerator<StreamEvent> {
    if (signal.aborted) {
      yield { type: "stop", reason: "aborted" };
      return;
    }
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort, { once: true });

    const key = unsealSecret(secret);
    // Defense in depth: the key is never in the prompt, but if it ever came back in the text it
    // would be redacted before it reaches the UI or storage.
    const filter = new SecretStreamFilter(key);
    let usage: Usage | undefined;
    let stopReason: StopReason | undefined;
    let failure: MappedError | undefined;
    let sawCall = false;

    try {
      const response = await this.#fetch(`${API_BASE}/${encodeURIComponent(req.modelId)}:streamGenerateContent?alt=sse`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(toBody(req)),
        signal: controller.signal,
      });
      // Checked before reading events: an error can arrive with an event-stream content type (seen live).
      if (!response.ok) {
        failure = mapErrorBody(response.status, await readJson(response));
      } else if (!response.body) {
        failure = { code: "unknown" };
      } else {
        for await (const raw of readSse(response.body)) {
          const chunk = readChunk(raw);
          if (chunk.error) {
            failure = chunk.error;
            break;
          }
          for (const text of chunk.texts) {
            const safe = filter.push(text);
            if (safe !== "") yield { type: "text", delta: safe };
          }
          for (const call of chunk.calls) {
            sawCall = true;
            yield { type: "tool_call", ...call };
          }
          if (chunk.usage) usage = chunk.usage;
          if (chunk.stopReason) stopReason = chunk.stopReason;
        }
      }
    } catch (error) {
      // A malformed line is a provider fault; anything else thrown is the connection.
      if (!signal.aborted) failure = { code: error instanceof SseParseError ? "unknown" : "network" };
    } finally {
      signal.removeEventListener("abort", onAbort);
    }

    const rest = filter.flush();
    if (rest !== "") yield { type: "text", delta: rest };

    if (signal.aborted) {
      yield { type: "stop", reason: "aborted" };
    } else if (failure) {
      yield { type: "error", ...failure };
    } else if (stopReason === undefined) {
      // The connection ended without a finish reason: the answer is incomplete.
      yield { type: "error", code: "network" };
    } else {
      if (usage) yield { type: "usage", ...usage };
      // A step that ended after function calls waits for their results (contracts/provider-tool-calls.md).
      yield { type: "stop", reason: sawCall && stopReason === "end" ? "tool_use" : stopReason };
    }
  }
}

function toBody(req: ModelRequest) {
  const model = GEMINI_MODELS.find((m) => m.id === req.modelId);
  const effort = req.effort && model?.supportsEffort && model.effortLevels.includes(req.effort) ? req.effort : undefined;
  const tools = toToolDeclarations(req.tools);
  return {
    // One part per layer keeps the precedence order visible to the model.
    ...(req.layers.length > 0 && { systemInstruction: { parts: req.layers.map((layer) => ({ text: layer.text })) } }),
    contents: toContents(req.messages),
    ...(tools && { tools }),
    generationConfig: {
      maxOutputTokens: req.maxTokens,
      ...(effort && { thinkingConfig: { thinkingLevel: effort } }),
    },
  };
}

interface ReadChunk {
  texts: string[];
  calls: ReadCall[];
  usage?: Usage;
  stopReason?: StopReason;
  error?: MappedError;
}

/** Reads only the fields the adapter uses; anything else in the chunk is ignored. */
function readChunk(raw: unknown): ReadChunk {
  if (!isRecord(raw)) return { texts: [], calls: [], error: { code: "unknown" } };
  const error = raw["error"];
  if (error !== undefined) {
    const status = isRecord(error) && typeof error["code"] === "number" ? error["code"] : 500;
    return { texts: [], calls: [], error: mapErrorBody(status, raw) };
  }

  const out: ReadChunk = { texts: [], calls: [] };
  const candidate = Array.isArray(raw["candidates"]) ? raw["candidates"][0] : undefined;
  if (isRecord(candidate)) {
    const content = candidate["content"];
    const parts = isRecord(content) && Array.isArray(content["parts"]) ? content["parts"] : [];
    for (const part of parts) {
      // A thought part is the model's reasoning: never shown or stored (research R3).
      if (!isRecord(part)) continue;
      if (part["functionCall"] !== undefined) {
        const call = readFunctionCall(part, out.calls.length);
        if (call) out.calls.push(call);
        else out.error = { code: "bad_request" };
      } else if (part["thought"] !== true && typeof part["text"] === "string" && part["text"] !== "") {
        out.texts.push(part["text"]);
      }
    }
    const finish = candidate["finishReason"];
    // Anything but a normal end or a length cut is a refusal, unknown reasons included (fail closed).
    if (typeof finish === "string") out.stopReason = STOP_REASONS[finish] ?? "refusal";
  }
  const feedback = raw["promptFeedback"];
  if (isRecord(feedback) && typeof feedback["blockReason"] === "string") out.stopReason = "refusal";

  const usage = readUsage(raw["usageMetadata"]);
  if (usage) out.usage = usage;
  return out;
}

/**
 * Regroups Gemini's usage into the core's meaning (research R4): `promptTokenCount` includes cached
 * tokens, and thought tokens are billed as output. Each chunk carries the running totals.
 */
function readUsage(metadata: unknown): Usage | undefined {
  if (!isRecord(metadata) || typeof metadata["promptTokenCount"] !== "number") return undefined;
  const count = (name: string) => (typeof metadata[name] === "number" ? (metadata[name] as number) : 0);
  const cached = count("cachedContentTokenCount");
  return {
    inputTokens: Math.max(0, count("promptTokenCount") - cached),
    outputTokens: count("candidatesTokenCount") + count("thoughtsTokenCount"),
    cacheReadTokens: cached,
    cacheWriteTokens: 0,
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
