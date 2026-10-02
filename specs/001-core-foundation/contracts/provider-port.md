# Contract: ProviderPort

The only way the core reaches an AI model. Implemented by `provider-anthropic`; the core and all
capabilities depend only on this interface (FR-002, Principle XI). Only the `Pipeline` holds an
instance; capabilities never receive one.

```ts
interface ProviderPort {
  readonly id: string;                         // "anthropic"
  listModels(): ModelInfo[];                   // static table, app-maintained
  validateCredential(secret: SecretHandle, signal?: AbortSignal): Promise<ValidationResult>;
  stream(req: ModelRequest, secret: SecretHandle, signal: AbortSignal): AsyncIterable<StreamEvent>;
  countTokens?(req: ModelRequest, secret: SecretHandle): Promise<number>;   // optional
}

interface ModelInfo {
  id: string; displayName: string;
  contextWindow: number; maxOutput: number;
  supportsEffort: boolean; effortLevels: Effort[];
  pricing: { inputPerMTok: number; outputPerMTok: number; cacheReadPerMTok?: number; asOf: string } | null;
}

interface ModelRequest {
  modelId: string;
  layers: PromptLayer[];                       // ordered by precedence; adapter maps to system/messages
  messages: ProviderMessage[];                 // conversation turns, segments already trust-wrapped
  maxTokens: number;
  effort?: Effort;                             // adapter ignores if model lacks support
  tools?: ToolDeclaration[];                   // empty in this feature
}

type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "usage"; inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }
  | { type: "stop"; reason: "end" | "max_tokens" | "tool_use" | "refusal" | "aborted" }
  | { type: "error"; code: ProviderErrorCode; retryAfterSeconds?: number };

type ProviderErrorCode =
  | "invalid_credential" | "permission_denied" | "quota_exhausted"
  | "rate_limited" | "overloaded" | "network" | "bad_request" | "unknown";

type ValidationResult = { ok: true } | { ok: false; code: ProviderErrorCode };
```

## Invariants

1. `SecretHandle` is opaque; it can be passed to the adapter but exposes no `toString`/`toJSON`,
   and is **not** serializable into `ModelRequest`. No field of `ModelRequest` can carry the key.
2. The adapter never retries automatically (`maxRetries = 0`); errors surface with codes.
3. Token numbers in `usage` are exactly what the provider reported.
4. Error objects, logs, and thrown messages are scrubbed: any string containing the secret is
   replaced before leaving the adapter (tested).
5. Provider-specific features (effort, thinking mode) are applied inside the adapter from
   `ModelInfo`; callers express intent only. If a feature is unsupported the adapter degrades
   silently and documents the fallback (Principle XI).
6. A `refusal` stop is surfaced as `stop.reason = "refusal"` and shown to the user as a localized
   provider-safety notice, distinct from a Tarjuman domain refusal.

## Test obligations

- Contract test suite (`packages/testing`) run against both the Anthropic adapter (with recorded
  fixtures) and the mock provider: stream ordering, abort, error mapping, secret scrubbing,
  no-retry.
