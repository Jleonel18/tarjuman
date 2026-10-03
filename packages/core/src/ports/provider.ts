import type { SecretHandle } from "./secret-handle";

/**
 * Structural stand-in for the web-standard `AbortSignal`. The core has no DOM or Node typings
 * (it must run unchanged in any shell), and a real `AbortSignal` is assignable to this.
 */
export interface AbortSignalLike {
  readonly aborted: boolean;
  addEventListener(type: "abort", listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: "abort", listener: () => void): void;
}

/**
 * ProviderPort: the only way the core reaches an AI model (FR-002, Principle XI).
 * Only the pipeline module holds an instance. See contracts/provider-port.md.
 */

/** Reasoning effort. v1 exposes low/medium/high in the UI; adapters map the rest as needed. */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type ProviderErrorCode =
  | "invalid_credential"
  | "permission_denied"
  | "quota_exhausted"
  | "rate_limited"
  | "overloaded"
  | "network"
  | "bad_request"
  | "unknown";

export type ValidationResult = { ok: true } | { ok: false; code: ProviderErrorCode };

export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok?: number;
  /** ISO date the prices were read from the provider (FR-021: costs are estimates). */
  asOf: string;
}

export interface ModelInfo {
  id: string;
  displayName: string;
  contextWindow: number;
  maxOutput: number;
  supportsEffort: boolean;
  effortLevels: Effort[];
  /** `null` means pricing is unavailable and the UI must say so. */
  pricing: ModelPricing | null;
}

/**
 * Layers in the instruction hierarchy, highest authority first (FR-008). Conversation turns are
 * carried by `ModelRequest.messages`, not by a layer.
 */
export type LayerId = "security" | "domain_scope" | "capability" | "tone" | "user_preferences";

export interface PromptLayer {
  id: LayerId;
  text: string;
}

/** A conversation turn with its trust-labeled segments already rendered into text. */
export interface ProviderMessage {
  role: "user" | "assistant";
  content: string;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonSchema = { [key: string]: JsonValue };

/** What a provider needs to know about a tool; handlers never cross this boundary. */
export interface ModelTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

export interface ModelRequest {
  modelId: string;
  /** Ordered by precedence; the adapter maps them onto the provider's system/messages. */
  layers: PromptLayer[];
  messages: ProviderMessage[];
  maxTokens: number;
  /** Ignored by the adapter when the model does not support effort. */
  effort?: Effort;
  /** Empty in this feature. */
  tools?: ModelTool[];
}

export type StopReason = "end" | "max_tokens" | "tool_use" | "refusal" | "aborted";

export type StreamEvent =
  | { type: "text"; delta: string }
  | {
      type: "usage";
      /** Exactly as reported by the provider (SC-005). */
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
    }
  | { type: "stop"; reason: StopReason }
  | { type: "error"; code: ProviderErrorCode; retryAfterSeconds?: number };

export interface ProviderPort {
  readonly id: string;
  /** Static, app-maintained table. */
  listModels(): ModelInfo[];
  validateCredential(secret: SecretHandle, signal?: AbortSignalLike): Promise<ValidationResult>;
  stream(req: ModelRequest, secret: SecretHandle, signal: AbortSignalLike): AsyncIterable<StreamEvent>;
  countTokens?(req: ModelRequest, secret: SecretHandle): Promise<number>;
}

/**
 * Type-level proof for invariant 1: no field of `ModelRequest`, at any depth, can carry a
 * `SecretHandle`. If someone adds a field typed `unknown`, `object`, `any`, or `SecretHandle`,
 * `tsc` fails here.
 */
type Prev = [never, 0, 1, 2, 3, 4, 5, 6];
type CanCarrySecret<T, D extends number = 6> = [D] extends [never]
  ? false
  : [SecretHandle] extends [T]
    ? true
    : T extends (...args: never[]) => unknown
      ? false
      : T extends readonly (infer E)[]
        ? CanCarrySecret<E, Prev[D]>
        : T extends object
          ? true extends { [K in keyof T]-?: CanCarrySecret<T[K], Prev[D]> }[keyof T]
            ? true
            : false
          : false;

type Assert<T extends true> = T;
export type ModelRequestCannotCarrySecret = Assert<
  CanCarrySecret<ModelRequest> extends false ? true : false
>;
