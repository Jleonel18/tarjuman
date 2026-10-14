# Research: Gemini Provider

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-10-14

Provider facts drift. Every fact below says where it came from: **live** (a call made on 2026-10-14
from the owner's machine, with the owner's key loaded by `node --env-file=.env`, printing statuses
and response shapes only) or **docs** (ai.google.dev, read on 2026-10-14).

## R1. Can the browser call Gemini directly?

- **Decision**: yes. The web app calls `https://generativelanguage.googleapis.com` directly, as it
  does Anthropic. No gateway is involved.
- **Evidence (live)**: a CORS preflight (`OPTIONS …:streamGenerateContent?alt=sse`, origin
  `http://localhost:5173`, requested headers `content-type,x-goog-api-key`) returned `200` with
  `access-control-allow-origin` echoing the origin and `access-control-allow-headers:
  content-type,x-goog-api-key`. Error responses (403 without a key) also carry
  `access-control-allow-origin`, so the adapter can read their status.
- **Consequence**: the spec's open assumption holds; no constitution review is needed.
- **Note (docs)**: Google advises against shipping keys *compiled into* client code. Tarjuman does
  not: the learner's own key is entered at run time and stored encrypted (BYOK), the same model as
  the Anthropic key.

## R2. How the key travels, and which keys exist

- **Decision**: the key goes only in the `x-goog-api-key` request header. The `?key=` query
  parameter is never used (spec FR-008). Both key families are accepted.
- **Evidence**:
  - docs: REST examples use `-H "x-goog-api-key: $GEMINI_API_KEY"`; the reference also documents
    `?key=`, which is rejected here because URLs end up in history, proxies, and error reports.
  - docs and forum: since mid-2026 AI Studio issues **auth keys** with prefix `AQ.`; legacy
    **standard keys** (`AIza…`, 39 characters) are being phased out. Google Cloud Console can
    still issue `AIza` keys.
  - live: the owner's key is an `AQ.` key, 53 characters, alphabet `[A-Za-z0-9_-]` after the
    prefix. It works with the header (`GET models/gemini-3.8-flash` → 200).
  - live: a made-up `AIza…` key → `400 INVALID_ARGUMENT`, `reason: API_KEY_INVALID`; a made-up
    `AQ.…` key → `401 UNAUTHENTICATED`, `reason: ACCESS_TOKEN_TYPE_UNSUPPORTED`.
- **Shapes used by the app** (R12): `AIza[A-Za-z0-9_-]{35}` and `AQ\.[A-Za-z0-9_-]{30,}`.
- **Masked hint**: `AIza…a1b2` or `AQ.…a1b2` (prefix plus last four), as for `sk-ant-…a1b2`.
- **Environment variable for owner tools**: `GEMINI_API_KEY` (the name the owner already uses in
  `.env`; also the name in Google's docs). Added to `.env.example` without a value.

## R3. Wire format

- **Decision**: native `fetch` against
  `POST /v1beta/models/{modelId}:streamGenerateContent?alt=sse`, parsed as server-sent events. No
  SDK and no new npm dependency (the same choice as `provider-ollama`; the constitution's "only
  `provider-anthropic` imports the SDK" stays true).
- **Request mapping**:
  - `layers` → `systemInstruction.parts`: one part per layer, in precedence order (mirrors the
    Anthropic adapter's one block per layer).
  - `messages` → `contents`: role `user` stays `user`; `assistant` becomes `model`; one text part
    each.
  - `maxTokens` → `generationConfig.maxOutputTokens`.
  - `effort` → `generationConfig.thinkingConfig.thinkingLevel`, only for models whose table entry
    supports it (R8).
- **Never sent**: `safetySettings` (Google's defaults stay; loosening them is out of scope and
  tightening them is not needed, since the app's own guardrails decide scope), `tools`,
  `toolConfig`, sampling parameters, `cachedContent`, `includeThoughts`, `thinkingBudget`.
- **Response (live, `gemini-3.5-flash-lite`)**: each `data:` line is a full
  `GenerateContentResponse` with `candidates[0].content.parts[].text`, and the last one carries
  `finishReason`. Parts may also carry `thoughtSignature` (ignored). Any part with `thought: true`
  is skipped: thought text is never shown or stored.
- **Mid-stream errors**: a `data:` line with an `error` object is mapped like an HTTP error (R6).
- **Alternatives considered**: the `@google/genai` SDK (rejected: a new dependency with its own
  retry logic to disable, larger bundle, and nothing the adapter needs); non-streaming
  `generateContent` (rejected: the app streams).

## R4. Usage figures

- **Evidence (live)**: `usageMetadata` arrives on every chunk and is cumulative:
  `promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`, `totalTokenCount`, and
  `cachedContentTokenCount` when implicit caching applied. docs: "response pricing is the sum of
  output tokens and thinking tokens", and `promptTokenCount` includes cached tokens.
- **Decision** (latest value wins, nothing summed across chunks):
  - `inputTokens` = `promptTokenCount − cachedContentTokenCount`
  - `cacheReadTokens` = `cachedContentTokenCount` (0 when absent)
  - `outputTokens` = `candidatesTokenCount + thoughtsTokenCount` (absent counts as 0)
  - `cacheWriteTokens` = 0 (Gemini implicit caching has no write charge)
- **Rationale**: it matches the meaning the core already gives these fields for Anthropic
  (`contextUsedTokens` = input + cache read + cache write; cost = input × input price + cache read
  × cache price + output × output price), so `buildUsageRecord` needs no Gemini branch. These are
  still provider-reported numbers, only regrouped (SC-005 of 001 holds).
- If no `usageMetadata` arrived, no `usage` event is emitted (the core then records nothing, as
  today).

## R5. Finish reasons, safety blocks, and the pipeline

- **Decision (adapter)**:

  | Gemini | `StopReason` |
  |---|---|
  | `STOP` | `end` |
  | `MAX_TOKENS` | `max_tokens` |
  | `SAFETY`, `RECITATION`, `BLOCKLIST`, `PROHIBITED_CONTENT`, `SPII`, `IMAGE_SAFETY`, `LANGUAGE` | `refusal` |
  | `promptFeedback.blockReason` set (any value), no candidate | `refusal` |
  | `OTHER` or anything unknown | `refusal` (fail closed) |
  | stream ended with no finish reason | `error: network` (incomplete) |

- **Finding (pipeline, existing behavior)**: `Pipeline` treats any non-`aborted` stop as a
  complete answer. With no text, the verdict parser fails closed and the learner sees a refusal,
  which is right. But if the model wrote `ACCEPT` and part of an answer before the provider cut it
  off, today the partial text is stored as `complete`. That breaks the spec edge case "never a
  partial answer that looks complete", and the same gap exists for Anthropic's `refusal` stop.
- **Decision (core)**: a `stop` with reason `refusal` makes the turn `refused`: the pipeline keeps
  any text already shown, appends the refusal template, and stores the message with status
  `refused`. It is provider-neutral (no Gemini knowledge in the core) and also fixes the Anthropic
  case. A test for it is added to the pipeline suite before the change (Principle XII).
- **Alternative considered**: an adapter-only fix (emit `error` on safety blocks). Rejected: it
  would show "interrupted" instead of a refusal, and the learner would retry a request the
  provider will block again.

## R6. Error mapping

Only the HTTP status and two allow-listed enum fields of the error body (`error.status`,
`error.details[].reason`) are read. The message text is never read, copied, or logged.

| HTTP | `status` / `reason` | `ProviderErrorCode` |
|---|---|---|
| 400 | `reason: API_KEY_INVALID` | `invalid_credential` |
| 400 | `FAILED_PRECONDITION` (e.g. free tier not available in the region) | `permission_denied` |
| 400 | other | `bad_request` (includes "request too large") |
| 401 | any (e.g. `ACCESS_TOKEN_TYPE_UNSUPPORTED`) | `invalid_credential` |
| 403 | any (`PERMISSION_DENIED`, API not enabled, key restricted) | `permission_denied` |
| 404 | model not found | `bad_request` |
| 429 | `RESOURCE_EXHAUSTED` | `rate_limited`, with `retryAfterSeconds` from a `RetryInfo.retryDelay` detail when present |
| 500 | | `unknown` |
| 503 | `UNAVAILABLE` (live: "high demand") | `overloaded` |
| 504 | `DEADLINE_EXCEEDED` | `overloaded` |
| thrown by `fetch` | | `network` |

- 429 does not say whether the cause is a per-minute rate or a daily quota, so it is
  `rate_limited` (the message tells the learner to wait). `quota_exhausted` is not produced; that
  is acceptable because both codes stop the turn and neither retries.
- **Evidence (live)**: `503 UNAVAILABLE` with body `"This model is currently experiencing high
  demand"` came back on the first streaming call to `gemini-3.8-flash`, with `content-type:
  text/event-stream` but a plain JSON body. The adapter checks the status before parsing events.

## R7. Key validation

- **Decision**: `GET /v1beta/models/{defaultModelId}` with the key in the header. A `200` means the
  key is accepted and can reach the default model. It costs nothing and generates no tokens.
- **Evidence (live)**: `200` with the owner's key; failures as in R2.
- **Alternative considered**: one tiny generation, as the Anthropic adapter does. Rejected: it
  spends quota, and on the free tier it can fail with `429` or `503` for a perfectly good key
  (seen live). Anthropic used a generation only because `GET /v1/models` could not be verified
  without a key; here it was verified.
- **Known limit**: a key that is valid but has no generation quota left passes validation and
  fails on the first message with `rate_limited`. That is shown clearly and not retried.

## R8. Model table

Facts from `models.list` (live) and the pricing page (docs), both 2026-10-14.

| id | Display name | Context | Max output | Effort (`thinkingLevel`) | Input $/MTok | Output $/MTok | Cache read $/MTok | Free tier |
|---|---|---|---|---|---|---|---|---|
| `gemini-3.8-flash` (default) | Gemini 3.8 Flash | 1,048,576 | 65,536 | low, medium, high | 0.75 | 3.75 | 0.075 | yes |
| `gemini-3.5-flash-lite` | Gemini 3.5 Flash-Lite | 1,048,576 | 65,536 | low, medium, high | 0.30 | 2.50 | 0.03 | yes |
| `gemini-4-argon` | Gemini 4 Argon | 1,048,576 | 32,768 | low, medium, high | 2.00 | 10.00 | 0.10 | no |

- **Default**: `gemini-3.8-flash`, the current general model with a free tier, so a learner with a
  free key can start at once.
- **Max output**: `gemini-4-argon` is 32,768 in `models.list` and 65,536 on its docs page; the live
  value is used (the lower one). The pipeline caps requests at 4,096 anyway.
- **Effort**: docs list `minimal` too for some models, and `gemini-3.8-flash` rejects `minimal`.
  The app offers only `low | medium | high` (001 research R3), which every listed model accepts.
- **Scheduled price changes (docs)**: `gemini-4-argon` doubles on 2026-12-01 (to 4 / 20 / 0.20);
  `gemini-3.8-flash` doubles on 2027-01-01 (to 1.50 / 7.50 / 0.15). The table stores today's
  prices with `asOf: 2026-10-14`; updating it before those dates is recorded as a follow-up in
  `plan.md`. Costs are labelled estimates either way (001 FR-021).
- **Not listed**: preview models (they change or vanish without notice), `gemini-3.5/3.6/3.7-flash`
  (superseded, and 3.5/3.7 have no row on the pricing page), image, TTS, and transcription models.
- **Free tier**: the app cannot tell a free key from a paid one. It shows the paid-rate estimate,
  labelled as an estimate (spec Assumptions).

## R9. Choosing the provider at run time

- **Today**: the composition root picks one `ProviderPort` at build time; `Pipeline` and
  `ProviderCredentialValidator` each hold that one instance.
- **Decision**: the pipeline module holds a fixed, frozen **set** of providers, and the profile says
  which one is active.
  - `PipelineDeps.provider: ProviderPort` becomes `providers: readonly ProviderPort[]`. Each turn,
    `Pipeline` picks the entry whose `id` equals `profile.providerId`, loads that provider's key,
    and looks up the model in that provider's table. An unknown id ends the turn with
    `bad_request`; nothing falls back to another provider (FR-003, FR-007).
  - `ProviderCredentialValidator` takes the same set, and `validate(providerId, secret)` calls only
    that provider.
  - `ProviderPort` itself does not change, and no other module gains a provider.
- **Alternatives considered**:
  - A "switching" object that implements `ProviderPort` and forwards to the active adapter.
    Rejected: it would need to read the profile and the right key, which is the pipeline's job,
    and it would be a second thing outside the allowed paths that names `ProviderPort`.
  - Rebuilding all services when the provider changes. Rejected: `Pipeline` is frozen by design,
    in-flight turns would race the rebuild, and it is more code than the set.

## R10. One key per provider (spec FR-004, option A)

- **Decision**: `CredentialStore` methods take a `providerId`: `save(secret, mode, meta)` (already
  carries `meta.providerId`), `load(providerId)`, `describe(providerId)`, `remove(providerId)`, plus
  `removeAll()` and `list()` for "delete all my data" and its check.
- **Web adapter**:
  - IndexedDB credential records are keyed by provider id instead of the fixed id `"current"`. The
    database version goes up by one, and the upgrade moves an existing `"current"` record to the
    key named by its own `providerId` (always `anthropic` today). The AES-GCM additional data is
    already the provider id, so the ciphertext stays valid. This satisfies FR-002 / SC-006 with no
    learner action.
  - `SessionSecrets` keeps one entry per provider. Saving a key in one mode still removes that same
    provider's key in the other mode, as today; it never touches another provider's entries.
- **`KeyManager`**: `enter`, `replace`, and `remove` take the provider id. Before any network call
  it checks the key's shape (R12): if the key clearly belongs to a different known provider, it is
  rejected locally with the new outcome `wrong_provider` and is never sent anywhere (FR-007). A key
  of unknown shape is sent only to the selected provider, as today.
- **`DataController.deleteAll`**: calls `removeAll()` and checks that `list()` is empty and that
  `load()` returns nothing for every known provider id (SC-007).

## R11. Profile and usage records

- `LearnerProfile` gains `providerId`. Profiles stored before this feature have no such field; the
  profile reader treats a missing value as `"anthropic"` (FR-002), and the next save writes it.
- `validateProfile` checks that `modelId` belongs to the selected provider's model list (today it
  checks a flat list of known ids).
- Switching provider sets `modelId` to that provider's default. `configuredEffort` is kept: the
  pipeline already drops effort for a model that does not support it.
- `UsageRecord` gains an optional `providerId`, written for every new record (FR-019). Old records
  without it are shown as before.

## R12. Detecting Gemini keys in chat input

- `guardInput`'s key detection adds `AIza[A-Za-z0-9_-]{35}` and `AQ\.[A-Za-z0-9_-]{30,}`.
  `AIza` keys often match the existing generic high-entropy check already; `AQ.` keys do not,
  because `.` is outside its alphabet. Both get explicit patterns.
- The same table of key shapes (`anthropic`: `sk-ant-…`; `gemini`: `AIza…`, `AQ.…`) is used by
  `KeyManager` for `wrong_provider` (R10) and for masking. It lives in `packages/core` as plain
  data with no provider import.
- New adversarial cases: an `AQ.` key and an `AIza` key pasted in a message, inside wrapping
  punctuation, split by zero-width characters, and inside untrusted material. They are added
  before the pattern change (Principle XII).

## R13. Redacting the key from streamed text

- `SecretStreamFilter` and the key-shape redaction live in `packages/provider-anthropic/src/scrub.ts`.
  Adapters may not import each other (dependency-cruiser `providers-independent`).
- **Decision**: move `SecretStreamFilter` to `@tarjuman/core/adapter` (the adapter-only subpath that
  already exports `unsealSecret`). It is pure string code with no DOM or Node API, so it is allowed
  in the core. The Anthropic adapter keeps its own `scrubSecret` (with its `sk-ant-` pattern) and
  imports the filter from the new place; the Gemini adapter uses the filter with its own key.
- **Alternative considered**: copy the class into the Gemini package. Rejected: two copies of
  security code drift apart.

## R14. Network policy

- `PROVIDER_ORIGINS` in `apps/web/csp.ts` becomes `[ANTHROPIC_API_ORIGIN, GEMINI_API_ORIGIN]`,
  with `GEMINI_API_ORIGIN = "https://generativelanguage.googleapis.com"` exported by the new
  adapter. `apps/web/tests/csp.test.ts` checks both and that nothing else was added (FR-011).

## R15. Dev and test providers

- Product build: providers `[anthropic, gemini]`.
- `VITE_PROVIDER=ollama`: `[ollama]` only, as today.
- `VITE_PROVIDER=mock`: two mock providers with different ids and model tables (`MockProvider`
  gains an optional `id`), so e2e can cover choosing and switching providers without any network.
- Onboarding and settings show the provider choice only when the build offers more than one
  provider.

## R16. Owner tooling

- `tests/support/live-provider.ts` accepts `TARJUMAN_PROVIDER=gemini`, reading `GEMINI_API_KEY`.
  Provenance: `providerId: "gemini"`, the model id, `isClaude: false`, `nonClaudeLabel(modelId)`.
  The error for a missing variable names the variable, never a value.
- New opt-in live test `packages/provider-gemini/tests/gemini.live.test.ts` and script
  `pnpm test:live:gemini` (`node --env-file=.env` + `TARJUMAN_LIVE=1`), printing result and usage
  only. It makes one validation call and one short streamed answer on `gemini-3.5-flash-lite`,
  the cheapest listed model.
- Fixtures recorded with Gemini never count as 001 SC-003 evidence (spec FR-023).

## R17. Learner-facing text

- Key help per provider: Anthropic keeps its text; Gemini adds "get a key at Google AI Studio"
  with a link to `https://aistudio.google.com/apikey`. It is an ordinary link the learner clicks,
  not an auto-loaded resource, so the CSP is unaffected.
- Gemini disclosure (FR-020): "With a free Gemini key, Google may use what you send to improve its
  products. With a paid key, it does not." (Wording follows the pricing page's "used / not used to
  improve our products".)
- `wrong_provider` message: "This looks like a {provider} key. Choose {provider} above, or paste
  a key for the provider you selected."
- All strings go in `en` and `es` catalogs; layout uses logical properties and existing tokens.

## Live results

### 2026-10-14: `pnpm test:live:gemini` (T050, SC-008)

Run by the agent with the owner's key (`GEMINI_API_KEY`, an `AQ.` auth key) loaded by
`node --env-file=.env`. Output was results only; no key or header was printed.

| Check | Result |
|---|---|
| `validateCredential` (`GET models/gemini-3.8-flash`) | `{ ok: true }`, one request |
| `stream` on `gemini-3.5-flash-lite`, effort `low`, "Say hola in Spanish." | text `¡Hola!`; usage `inputTokens 12, outputTokens 3, cacheReadTokens 0`; `stop: end`; one request |

Confirms on the real wire: the key travels in `x-goog-api-key` (the adapter sends no other way), the
`alt=sse` parsing, the usage mapping (R4), and the `STOP` mapping (R5). Not confirmed live: a safety
block, a 429, and an in-stream error object; those stay covered by synthetic fixtures. Earlier the
same day a direct probe of `gemini-3.8-flash` answered `503 UNAVAILABLE` ("high demand"), which is the
`overloaded` row of R6.

### Deviation from R17 (implementation)

The Gemini key help names Google AI Studio as plain text (`aistudio.google.com`) instead of a link.
A link would put a new origin in the production bundle, which `check:bundle-origins` rejects, and the
spec (FR-020) asks only to say where to get a key. The Anthropic help does the same
(`console.anthropic.com`).
