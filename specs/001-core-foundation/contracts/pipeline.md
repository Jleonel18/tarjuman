# Contract: Pipeline

The single entry point for every model interaction (FR-006 – FR-011, Principles III–V).

```ts
interface Pipeline {
  run(turn: TurnInput, signal: AbortSignal): AsyncIterable<TurnEvent>;
}

interface TurnInput {
  conversationId: string;
  capabilityId: string;
  userText: string;
  untrustedMaterial?: { source: "user_paste" | "external"; text: string }[];
}

type TurnEvent =
  | { type: "guard_warning"; code: "key_shape_detected" }       // input guard, text withheld
  | { type: "verdict"; verdict: "accept" | "refuse" | "clarify"; ruleIds: string[] }
  | { type: "render"; blocks: SafeBlock[] }                     // already passed OutputGuard
  | { type: "usage"; record: UsageRecord }
  | { type: "notice"; code: NoticeCode }                        // e.g. context_80, interrupted
  | { type: "done"; status: "complete" | "interrupted" | "refused" }
  | { type: "error"; code: ProviderErrorCode };
```

## Stage order (fixed in code, not configurable)

1. **InputGuard** → detect/withhold key-shaped strings; Unicode-normalize for rule matching.
2. **ContextAssembler** → layers in precedence order:
   `security > domain scope > capability > tone > user preferences > conversation`; untrusted
   material wrapped as labeled, delimiter-safe data blocks; the key is not an input to this stage.
3. **ModelCall** → `ProviderPort.stream`.
4. **OutputGuard** → verdict parse; restricted-AST rendering; tool-call permission + taint check.
5. **Metrics** → persist `UsageRecord` from provider-reported usage; evaluate 80 % context notice.

## Credential validation entry point

Key validation (FR-012) needs a minimal real generation (research R5), so it must not give any
other module a provider handle. The pipeline module owns it:

```ts
interface CredentialValidator {
  validate(secret: SecretHandle, signal?: AbortSignal): Promise<ValidationResult>;
}
```

- Implemented in `packages/core/src/pipeline/credential-validation.ts`, which wraps
  `ProviderPort.validateCredential`. `KeyManager` depends on `CredentialValidator`, never on
  `ProviderPort`.
- The request is a fixed, trusted prompt with no user content, no capability, and no tools, so
  the input guard, context assembly, and output guard have nothing to act on. It still lives
  inside the pipeline module, so it stays the only code that can reach the provider.

## Output rendering contract (`SafeBlock`)

Allowed: paragraph, heading, list, emphasis, inline code, code block (as text), blockquote, table,
and `link` nodes carrying `{ text, destinationDisplay, destination }` rendered inert until explicit
user action. **Not representable**: `image`, raw HTML, script, iframe, style, event handlers. HTML
in model output is emitted as literal text. Remote resources are never auto-loaded.

## Invariants (each has a test)

1. No code path to `ProviderPort` exists outside the pipeline module, i.e. `Pipeline` and
   `CredentialValidator` (architecture test + lint rule).
2. Stage order cannot be changed by capabilities (stages are not exposed or injectable).
3. The assembled `ModelRequest` never contains the API key (structural assertion over every
   adversarial case).
4. Tone text appears only in the tone layer; guardrail results are identical across tones.
5. Every turn emits exactly one `done` or `error`.
6. A side-effecting tool call in a turn with any `untrusted` segment is blocked or requires
   confirmation (exercised with the dummy capability).
