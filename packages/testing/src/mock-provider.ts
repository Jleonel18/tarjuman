import type {
  AbortSignalLike,
  ModelInfo,
  ModelRequest,
  ProviderErrorCode,
  ProviderPort,
  SecretHandle,
  StopReason,
  StreamEvent,
  ValidationResult,
} from "@tarjuman/core";
import { unsealSecret } from "@tarjuman/core/adapter";

/**
 * One scripted step of a mock response. A script is replayed in order; see
 * `fixtures/README.md` for the JSON form.
 */
export type MockStep =
  | { type: "text"; delta: string }
  | { type: "usage"; inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }
  | { type: "stop"; reason: StopReason }
  | { type: "error"; code: ProviderErrorCode; retryAfterSeconds?: number }
  /** Pauses the stream; useful to test abort and latency. */
  | { type: "delay"; ms: number };

export interface MockScript {
  steps: MockStep[];
}

export const DEFAULT_MOCK_KEY = "sk-ant-mock-valid-key-0000";

export const MOCK_MODELS: ModelInfo[] = [
  {
    id: "mock-model",
    displayName: "Mock model",
    contextWindow: 200_000,
    maxOutput: 8_192,
    supportsEffort: true,
    effortLevels: ["low", "medium", "high"],
    pricing: { inputPerMTok: 1, outputPerMTok: 5, asOf: "2026-10-02" },
  },
  {
    id: "mock-model-no-pricing",
    displayName: "Mock model (no pricing)",
    contextWindow: 100_000,
    maxOutput: 4_096,
    supportsEffort: false,
    effortLevels: [],
    pricing: null,
  },
];

export interface MockProviderOptions {
  models?: ModelInfo[];
  /** Raw keys `validateCredential` accepts. Anything else is `invalid_credential`. */
  validKeys?: string[];
  /** Pause inserted before every streamed event, in ms. Default 0. */
  latencyMs?: number;
  /** Scripts consumed one per `stream()` call. When empty, `defaultScript` is used. */
  scripts?: MockScript[];
  defaultScript?: MockScript;
  /** Forces `validateCredential` to fail with this code regardless of the key. */
  validationFailure?: ProviderErrorCode;
}

export const HAPPY_SCRIPT: MockScript = {
  steps: [
    { type: "text", delta: "Hola! " },
    { type: "text", delta: "Ser describes identity; estar describes state." },
    { type: "usage", inputTokens: 120, outputTokens: 24 },
    { type: "stop", reason: "end" },
  ],
};

/**
 * Deterministic stand-in for a real provider. It never touches the network, never retries, and
 * records every request so tests can assert on exactly what the pipeline sent.
 */
export class MockProvider implements ProviderPort {
  readonly id = "mock";

  /** Every request received, in order. Requests cannot contain a secret by construction. */
  readonly calls: ModelRequest[] = [];
  /** Number of `validateCredential` calls. */
  validationCalls = 0;
  /** Number of `stream` calls; used to prove nothing retried. */
  get streamCalls(): number {
    return this.calls.length;
  }

  readonly #models: ModelInfo[];
  readonly #validKeys: Set<string>;
  readonly #queue: MockScript[];
  readonly #latencyMs: number;
  #defaultScript: MockScript;
  #validationFailure: ProviderErrorCode | undefined;

  constructor(options: MockProviderOptions = {}) {
    this.#models = options.models ?? MOCK_MODELS;
    this.#validKeys = new Set(options.validKeys ?? [DEFAULT_MOCK_KEY]);
    this.#queue = [...(options.scripts ?? [])];
    this.#latencyMs = options.latencyMs ?? 0;
    this.#defaultScript = options.defaultScript ?? HAPPY_SCRIPT;
    this.#validationFailure = options.validationFailure;
  }

  /** Queues a script for the next `stream()` call. */
  enqueue(script: MockScript): this {
    this.#queue.push(script);
    return this;
  }

  setDefaultScript(script: MockScript): this {
    this.#defaultScript = script;
    return this;
  }

  setValidationFailure(code: ProviderErrorCode | undefined): this {
    this.#validationFailure = code;
    return this;
  }

  listModels(): ModelInfo[] {
    return this.#models;
  }

  async validateCredential(secret: SecretHandle, signal?: AbortSignalLike): Promise<ValidationResult> {
    this.validationCalls += 1;
    if (signal?.aborted) return { ok: false, code: "network" };
    if (this.#validationFailure) return { ok: false, code: this.#validationFailure };
    return this.#validKeys.has(unsealSecret(secret))
      ? { ok: true }
      : { ok: false, code: "invalid_credential" };
  }

  async *stream(
    req: ModelRequest,
    secret: SecretHandle,
    signal: AbortSignalLike,
  ): AsyncGenerator<StreamEvent> {
    this.calls.push(req);

    if (!this.#validKeys.has(unsealSecret(secret))) {
      yield { type: "error", code: "invalid_credential" };
      return;
    }

    const script = this.#queue.shift() ?? this.#defaultScript;
    for (const step of script.steps) {
      if (signal.aborted) {
        yield { type: "stop", reason: "aborted" };
        return;
      }
      if (step.type === "delay") {
        if (await sleep(step.ms, signal)) {
          yield { type: "stop", reason: "aborted" };
          return;
        }
        continue;
      }
      if (this.#latencyMs > 0 && (await sleep(this.#latencyMs, signal))) {
        yield { type: "stop", reason: "aborted" };
        return;
      }
      yield step satisfies StreamEvent;
      if (step.type === "error") return;
    }
  }
}

/** Resolves true if aborted before the timer fired. */
function sleep(ms: number, signal: AbortSignalLike): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(true);
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(false);
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Validates the JSON fixture format and returns a typed script. Throws on a malformed fixture. */
export function parseFixture(value: unknown): MockScript {
  if (typeof value !== "object" || value === null || !Array.isArray((value as { steps?: unknown }).steps)) {
    throw new Error("Fixture must be an object with a `steps` array");
  }
  const steps = (value as { steps: unknown[] }).steps.map((raw, index) => {
    if (typeof raw !== "object" || raw === null) throw new Error(`steps[${index}] must be an object`);
    const step = raw as Record<string, unknown>;
    switch (step["type"]) {
      case "text":
        if (typeof step["delta"] !== "string") throw new Error(`steps[${index}].delta must be a string`);
        return { type: "text", delta: step["delta"] } as MockStep;
      case "usage":
        if (typeof step["inputTokens"] !== "number" || typeof step["outputTokens"] !== "number") {
          throw new Error(`steps[${index}] usage needs numeric inputTokens and outputTokens`);
        }
        return step as unknown as MockStep;
      case "stop":
        if (typeof step["reason"] !== "string") throw new Error(`steps[${index}].reason must be a string`);
        return step as unknown as MockStep;
      case "error":
        if (typeof step["code"] !== "string") throw new Error(`steps[${index}].code must be a string`);
        return step as unknown as MockStep;
      case "delay":
        if (typeof step["ms"] !== "number") throw new Error(`steps[${index}].ms must be a number`);
        return { type: "delay", ms: step["ms"] } as MockStep;
      default:
        throw new Error(`steps[${index}] has unknown type "${String(step["type"])}"`);
    }
  });
  return { steps };
}
