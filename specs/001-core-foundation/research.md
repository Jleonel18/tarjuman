# Phase 0 Research: Core Foundation

All Technical Context unknowns are resolved here. Stack-level choices (TypeScript, pnpm, React +
Vite, Tauri 2, Cloudflare Workers, Vitest + Playwright) are fixed by the constitution and are not
re-litigated; this document covers the choices the constitution leaves open.

Items marked **[verify at implementation]** rest on provider behavior that must be confirmed
against live documentation in the first implementation task that touches it (T-spike), because
provider APIs drift.

## R1. Browser-to-provider access (BYOK, no proxy)

- **Decision**: The web shell calls the Anthropic Messages API directly from the browser using the
  official `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true`, wrapped entirely inside the
  `AnthropicProvider` adapter. No Tarjuman server sits on the path.
- **Rationale**: FR-014 / Principle V forbid the key from reaching any Tarjuman-operated
  intermediary, so a proxy is excluded by construction. The SDK's flag name is a warning about
  shipping a *developer's* key in a bundle; here each user supplies their own key, which is the
  intended use.
- **Alternatives considered**: (a) Gateway proxy — rejected, violates FR-014. (b) Raw `fetch` —
  rejected, reimplements streaming/retry/error typing the SDK already provides.
- **[verify at implementation]** CORS acceptance for browser origins and the exact header the SDK
  sends.

## R2. Model selection and defaults

- **Decision**: Default model `claude-sonnet-5-5` ($2/$10 per MTok, 1M context); the model list is
  data in the provider adapter (id, display name, context window, pricing, effort support), and
  the user can choose among listed models. `claude-opus-5-5` is offered as the higher-quality
  option, `claude-haiku-4-5` as the cheapest.
- **Rationale**: Users pay with their own key (Principle IX); a conversational language tutor does
  not need the most expensive tier. Sonnet 5.5 is the current Sonnet with a 1M window.
- **Alternatives considered**: Opus 5.5 as default — better quality but 2× cost for chat use;
  Fable 5.1 — exceeds Opus pricing, overkill and has retention requirements unsuitable for
  user-owned keys.
- **Constraints captured in the model table** (drive the adapter, not the core):
  - Thinking cannot be disabled on Opus 5.5 (effort is the only control; default `medium`).
  - Sonnet 5.5 rejects `thinking: {type: "disabled"}`; off-switch is `{type: "between_tools"}`
    at effort ≤ `high`.
  - Forced `tool_choice` (`any`/`tool`) returns 400 on both → the pipeline must use `auto` +
    `strict` tools.
  - Prefill is removed on both → no assistant prefill tricks.
  - `budget_tokens` and sampling params are rejected → never sent.
  - Haiku 4.5 uses `budget_tokens`, 200K window.
- Pricing is app-maintained data with an `asOf` date (spec Assumptions; FR-021).

## R3. Effort mapping and recommendation (FR-020)

- **Decision**: "Configured effort" is a user setting `low | medium | high` (v1 exposes three
  levels; `xhigh`/`max` are not offered) mapped to `output_config.effort` by the adapter, only for
  models that support it. The recommendation is a pure, deterministic heuristic in the core
  (`recommendEffort(requestFeatures)`): short vocabulary/pronunciation lookups → `low`;
  grammar explanation, usage contrasts → `medium`; multi-part analysis, translation-with-
  explanation of long text → `high`. Advisory only; applying it is one action.
- **Rationale**: Spec Assumptions define effort as the provider's reasoning setting and the
  recommendation as an advisory heuristic. Pure function ⇒ trivially unit-testable.
- **Alternatives considered**: Ask the model to self-assess effort — costs tokens and adds an
  injection surface; rejected.

## R4. Usage, context accounting, cost (FR-018 – FR-021)

- **Decision**: Token counts come only from provider-reported `usage` on each response (streamed
  `message_start`/`message_delta`), never estimated locally, to satisfy SC-005 (exact match).
  Context usage = last request's `input_tokens` (+ cache fields when present) ÷ model window.
  Warning at ≥ 80 %. Before sending, the optional `count_tokens` endpoint MAY be used to predict
  whether the next turn will cross the threshold. Cost = tokens × app-maintained price table,
  labeled "estimate"; if the model has no price row, the UI says pricing is unavailable.
- **Rationale**: SC-005 demands exactness; only provider numbers can give that.
- **Alternatives considered**: Local tokenizer (tiktoken-style) — inaccurate for Claude, rejected.

## R5. Key validation (FR-012)

- **Decision**: Validate by issuing a minimal real request through the provider port
  (`validateCredential()`), choosing the cheapest listed model with `max_tokens` small enough to
  cost a negligible amount, and classify failures (401 invalid/revoked, 403 permission,
  429/402-style quota, network) into typed, localizable error codes. The key is stored only after
  success.
- **Rationale**: A models-list call can pass for keys that cannot generate (quota, workspace
  restrictions); a tiny generation proves the real path. Cost is negligible and disclosed.
- **Alternatives considered**: `GET /v1/models` only — cheaper but weaker proof; may be used as a
  first, free pre-check **[verify at implementation]**.

## R6. Key storage — web (FR-013, FR-015, FR-016, FR-017)

- **Decision**: On "remember on this device": generate a non-extractable AES-GCM `CryptoKey` via
  WebCrypto, persist the `CryptoKey` object in IndexedDB (structured clone keeps it
  non-extractable), encrypt the API key with a fresh IV, store `{iv, ciphertext}` in IndexedDB.
  On "session only": hold the key in a module-scoped variable in memory (not `sessionStorage`),
  so reload clears it. Masked hint = provider prefix + last 4 characters, stored separately.
  Strict CSP (`default-src 'self'`, no inline script, `connect-src` limited to the provider
  origin and self), no third-party scripts.
- **Rationale**: Honest threat model: non-extractable keys stop *exfiltration of key material* but
  not use by injected same-origin script — hence the CSP, no third-party scripts, and the
  output-guard (no HTML, no auto-loaded remote resources). Documented in plan Threat Analysis.
- **Alternatives considered**: `localStorage` plaintext — rejected (FR-013). Passphrase-derived
  encryption — better against disk theft, worse UX; deferred as an optional hardening module.

## R7. Storage port and persistence (FR-005, FR-017, SC-007)

- **Decision**: `StoragePort` (async key-value + collections + `clearAll()`), web adapter on
  IndexedDB via the small `idb` wrapper, one database `tarjuman` with stores: `profile`,
  `settings`, `conversations`, `messages`, `credential`, `usage`. `clearAll()` deletes the whole
  database, removes the CryptoKey, and clears Cache Storage / service-worker caches if any, then
  verifies emptiness (SC-007 test).
- **Rationale**: IndexedDB is the only web store that holds `CryptoKey` and structured data.
  Desktop SQLite adapter is future work behind the same port (FR-041).
- **Alternatives considered**: Dexie — heavier, no need; OPFS/SQLite-WASM — premature.

## R8. Pipeline architecture (FR-006 – FR-011)

- **Decision**: A `Pipeline` class in the core owns the only code path to the provider port. Its
  stage order is a fixed tuple in code; capabilities supply data (prompt fragments, rules, tool
  declarations) and *never* receive a handle to the provider or to stage objects. Stages:
  1. **InputGuard** — key-shape detection (regex family for `sk-ant-…` and generic high-entropy
     key patterns), withholds and warns; normalizes Unicode (NFKC, strips zero-width/bidi
     controls) for rule matching only.
  2. **ContextAssembler** — builds layered prompt per precedence: security → domain scope →
     capability → tone → user preferences → conversation; untrusted material is wrapped in
     delimited, labeled blocks (`<untrusted_data source="user_paste">…`), with delimiter-escape
     handling so content cannot close its own block.
  3. **ModelCall** — through `ProviderPort.stream()`.
  4. **OutputGuard** — post-processes the stream: Markdown parsed to a restricted AST; HTML is
     text; images are never auto-loaded; links rendered inert showing destination; tool calls
     checked against capability permissions and the taint flag (FR-010).
  5. **Metrics** — records usage from provider-reported numbers.
- **Rationale**: "Impossible by construction" (US8-3) means capabilities cannot reach the
  provider except via the pipeline object; enforced by module boundaries + a lint rule + a test.
- **Domain-scope enforcement**: a *two-layer* design — (a) declarative rules rendered into the
  domain-scope prompt layer and (b) a cheap pre-classification **in the same model call** (the
  system layer instructs a structured first-line verdict `ACCEPT | REFUSE | CLARIFY`, parsed by
  the OutputGuard; on `REFUSE` the guard replaces the body with the localized refusal template).
  This avoids a second paid call per turn while keeping the refusal text deterministic and
  localized (FR-027).
  - **Refusal language**: Principle VII requires refusals in the mediation language, but only
    `en` and `es` catalogs ship. When the mediation language has a catalog, the template is used.
    When it does not, the scope layer instructs the model to follow a `REFUSE` first line with a
    short courteous refusal in the mediation language stating Tarjuman's purpose and offering an
    in-domain alternative. The OutputGuard renders it through the same restricted AST, and keeps
    the `refused` status. If that body is empty, it falls back to the UI-language template.
  - **Credential validation** (R5) goes through a `CredentialValidator` owned by the pipeline
    module, so no other module holds the provider (contracts/pipeline.md).
- **Alternatives considered**: Separate classifier call per turn — doubles cost on the user's key;
  rejected for v1, can be added as a pipeline stage later without core API change.

## R9. Declarative domain rules (FR-025 – FR-028a)

- **Decision**: Rules are versioned JSON/YAML files validated by a JSON Schema
  (`id`, `version`, `description`, `acceptCases[]`, `refuseCases[]`, `clarifyCases[]`). The core
  loads core rules; each capability contributes its own. A rule without cases fails validation
  (FR-026). Tests execute every case against the live model in a **nightly/pre-release** job
  (cost-bearing, uses a project-owned test key stored as a CI secret) and against a **recorded
  fixture** model in per-PR CI (deterministic, free).
- **Rationale**: SC-003 needs real-model measurement; per-PR determinism needs fixtures. The
  split keeps FR-037 (block merges) practical.
- **Alternatives considered**: Live-model on every PR — flaky and costly.

## R10. Adversarial suite (FR-036 – FR-038, SC-004, SC-009)

- **Decision**: Cases are data (`id`, `category`, `input`, optional `simulatedExternalContent`,
  `expect` with machine-checkable assertions: no key substring in any assembled request or
  rendered output, no network request to non-allowlisted origins, no remote-resource elements in
  rendered DOM, refusal/acceptance outcome). Two execution layers: **structural tests**
  (deterministic, per PR: assert the *assembled request* never contains the key and that the
  OutputGuard neutralizes hostile output fixtures) and **behavioral tests** (live model,
  nightly/pre-release: assert the model did not follow injected instructions). The bypass-to-test
  rule (FR-038) is enforced by a CI check that a "fix" PR labeled `security-fix` adds a file under
  `tests/adversarial/cases/`.
- **Rationale**: Principle V says structure, not model behavior, is the real defense; so the
  per-PR blocking gate is structural, and behavioral results are tracked as a measured rate.
- **Starting corpus**: ≥ 50 cases (SC-009) across the seven categories in FR-036, authored in
  English plus Spanish, Arabic, and encoded variants (base64, homoglyph, zero-width).

## R11. i18n and RTL (FR-031 – FR-035, SC-006)

- **Decision**: `i18next` + `react-i18next` for catalogs (ICU plural via `i18next-icu`), with
  English and Spanish catalogs plus a generated pseudo-RTL test locale (`ar-XB`-style: mirrored
  strings wrapped in RLM/RLE controls, lengthened) used only in tests/dev. CSS uses logical
  properties exclusively (enforced by `stylelint-use-logical`); `dir` is set per UI locale, and
  each message bubble sets `dir="auto"` with `<bdi>` wrapping for inline foreign-script runs.
  CI check: a script fails if any JSX string literal in user-visible position is not a catalog
  key (`eslint-plugin-i18next/no-literal-string`), and if catalogs differ in keys.
- **Rationale**: Mature, framework-agnostic enough to keep the core (which only exposes message
  *keys*) free of React. Pseudo-locale proves RTL without shipping an RTL UI language.
- **Alternatives considered**: FormatJS — equally capable, heavier tooling; Lingui — compile step
  not needed.

## R12. Tone as a separate layer (FR-029, FR-030)

- **Decision**: `TonePort`-free: tone profiles are data (`id`, localized name, `guidance`
  fragment) assembled as its own prompt layer *below* scope and capability. Test: the guardrail
  and adversarial suites run once per tone and results must be identical (matrix in CI, fixture
  layer per PR; live nightly).
- **Rationale**: Directly operationalizes Principle IV and FR-030.

## R13. Capability contract (FR-022 – FR-024)

- **Decision**: A `Capability` is a plain TypeScript object conforming to a versioned schema
  (`id`, `version`, `tools[]`, `permissions[]`, `domainRules[]`, `promptFragments{}`,
  `i18nNamespaces{}`), registered via `registry.register(capability)`. The registry validates the
  declaration (Zod), refuses undeclared permission use at runtime (a `PermissionBroker` mediates
  every tool invocation), and exposes read-only views to the pipeline. The core's package has no
  import of any capability package (dependency-cruiser rule in CI). Two capabilities ship:
  `language-qa` (real) and `dummy` (test-only, lives under `tests/`).
- **Rationale**: SC-008 (adding dummy requires 0 core changes) is verified by a test that
  registers a capability defined entirely inside the test directory.

## R14. Streaming UX and resilience (FR-001, FR-004, edge cases)

- **Decision**: Provider port exposes `stream(request, signal): AsyncIterable<StreamEvent>`.
  Stop = `AbortController`. Partial text is persisted incrementally with status `streaming` and
  finalized as `complete` / `interrupted`; a retry is user-initiated (no automatic retries — the
  SDK's `maxRetries` is set to 0 so cost is never silently multiplied; 429 shows `retry-after`
  info). First-token latency (SC-002) measured in a Playwright test against a local mock
  provider, plus a field metric kept local.
- **Alternatives considered**: SDK default retries — rejected by the "no silent cost" edge case.

## R15. Frontend state and rendering

- **Decision**: React 19 + Vite; state in a small store (Zustand) living in the web shell, *not* in
  the core (core is framework-free). Markdown via `markdown-it` with `html: false`, restricted
  renderer (no `img`, links rendered by our own inert component), sanitized by the OutputGuard
  AST rather than by `dangerouslySetInnerHTML`.
- **Rationale**: No `dangerouslySetInnerHTML` anywhere (lint-banned) removes a whole class of
  exfiltration paths.

## R16. Monorepo layout and tooling

- **Decision**: pnpm workspaces; packages: `core` (pure TS, zero DOM/React/Node deps),
  `provider-anthropic`, `capabilities/language-qa`, `storage-web`, `ui` (React components),
  `apps/web`, and `testing` (fixtures, mock provider, adversarial runner). Tooling: TypeScript
  strict + project references, Vitest, Playwright, ESLint, dependency-cruiser (boundary rules),
  Prettier, Changesets not needed yet. `apps/gateway` (Workers) and `apps/desktop` (Tauri) are
  **not created** in this feature (YAGNI; FR-041 only requires the core to be reusable).
- **Rationale**: Enforces Principle II/FR-041 mechanically through package boundaries.

## R17. Threat analysis (Principle V requires one per capability spec)

Covered in `plan.md` → *Threat Analysis*.

## R18. Telemetry (FR-040)

- **Decision**: No telemetry code ships in this feature. FR-040 is satisfied vacuously and
  guarded by a CI test that fails if any non-provider network origin appears in the bundle's
  `connect-src` or in Playwright network logs.
- **Rationale**: Smallest compliant implementation.

## Spike Results (T018)

Run on **2026-10-02** without a provider key (the owner has none and will not buy one). Evidence
levels, strongest first:

- **LIVE (keyless)**: observed against `api.anthropic.com` with a fake key.
- **SDK**: read from the installed `@anthropic-ai/sdk` 0.131.0 source.
- **DOCS**: read from `platform.claude.com` documentation on 2026-10-02.
- **UNVERIFIED**: needs a valid key; later tasks must treat it as an assumption and keep the code
  tolerant.

### R1. Browser access (CORS)

| Finding | Evidence |
|---------|----------|
| `OPTIONS /v1/messages` from an arbitrary `Origin` returns `200` with `access-control-allow-origin: *` and `access-control-allow-headers` echoing `content-type, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access`; `access-control-allow-methods` includes `POST` | LIVE |
| `POST` with a fake key returns `401` and body `{"type":"error","error":{"type":"authentication_error","message":"API key is invalid."},"request_id":null}`, and the error response **also** carries `access-control-allow-origin: *`, so the browser can read it | LIVE |
| With `dangerouslyAllowBrowser: true` the SDK sends `anthropic-dangerous-direct-browser-access: true`; without it the SDK throws in a browser-like environment | SDK |
| SDK `maxRetries` defaults to **2**; the adapter must set `0` (cost safety, FR edge case) | SDK, DOCS |

Decision R1 stands. `connect-src` for the CSP (T039) is `https://api.anthropic.com`.

### R2. Models, context windows, prices (as of 2026-10-02)

| Model | API id | Context | Max output | Input $/MTok | Output $/MTok | Cache read $/MTok | Default effort |
|-------|--------|---------|------------|--------------|---------------|-------------------|----------------|
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | 1M | 128K | 2 | 10 | 0.20 | `high` |
| Claude Opus 5.5 | `claude-opus-5-5` | 1M | 128K | 4 | 20 | 0.20 | `medium` |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` (alias `claude-haiku-4-5`) | 200K | 64K | 1 | 5 | 0.10 | not supported |

Source: DOCS (models overview and pricing pages). Cache write (5 min): Sonnet 5.5 $2.50, Opus 5.5
$5, Haiku 4.5 $1.25 per MTok. `pricing.asOf` = `2026-10-02`. The pricing page notes the current
tokenizer yields about 30 % more tokens than older ones, so token counts are not comparable
across generations.

Request constraints confirmed by DOCS (error pages):

- Sonnet 5.5 and Opus 5.5: `thinking: {"type":"disabled"}` returns 400; omit `thinking` and the
  request runs adaptive. Forced `tool_choice` (`any`/`tool`) returns 400. Assistant prefill
  returns 400.
- Haiku 4.5: no effort support; extended thinking only. **The adapter must send no `thinking`
  and no `effort` for Haiku.**
- Safest request shape for all three models: **omit `thinking` entirely**.

Free credits: the pricing FAQ states new users receive "a small amount of free credits to test
the API". Amount and availability are **UNVERIFIED** and not relied upon.

### R3. Effort

- Request shape: `output_config: { effort: "low" | "medium" | "high" | "xhigh" | "max" }`, inside
  `output_config`, GA, no beta header. (DOCS; SDK type at `messages.d.ts` agrees.)
- Supported: Sonnet 5.5, Opus 5.5. Not supported: Haiku 4.5 (not in the supported list).
- Setting the model's default level is identical to omitting it. Opus 5.5's default is `medium`,
  Sonnet 5.5's is `high`.
- v1 exposes `low | medium | high` only (R3 unchanged). Because Opus 5.5 defaults to `medium`
  and Sonnet 5.5 to `high`, the adapter **always sends the configured effort explicitly** so the
  user's setting means the same thing on every model.
- Changing top-level effort between requests restarts the prompt cache; irrelevant here (no
  caching in this feature) but noted for later.

### R4. Streaming usage

Source: DOCS (streaming page, JSON examples).

- `message_start` carries `message.usage` with `input_tokens` (and, when present,
  `cache_creation_input_tokens`, `cache_read_input_tokens`) and a small provisional
  `output_tokens`.
- `message_delta` carries top-level `usage`; its values are **cumulative**. The final
  `message_delta` has the final `output_tokens`. In some responses (server tools) it also repeats
  `input_tokens` and the cache fields.
- Total input tokens for a request = `input_tokens + cache_creation_input_tokens +
  cache_read_input_tokens` (SDK doc comment).
- **Rule for the adapter**: keep the latest value seen for each field (overwrite, never sum);
  take input and cache fields from `message_delta` when present, else from `message_start`;
  emit one `usage` event at the end of the stream. Null cache fields map to `0`.
- Mid-stream failure: an SSE `event: error` with `{"type":"error","error":{"type":"overloaded_error",...}}`
  can arrive after a `200`. The adapter maps it to a `StreamEvent` error, not a thrown exception.

### R5. Credential validation

- Error mapping (DOCS errors page):

| HTTP | `error.type` | `ProviderErrorCode` |
|------|--------------|---------------------|
| 401 | `authentication_error` | `invalid_credential` (covers malformed, revoked, expired) |
| 402 | `billing_error` | `quota_exhausted` |
| 403 | `permission_error` | `permission_denied` |
| 429 | `rate_limit_error` | `rate_limited`; a spend-cap 429 has **no** `retry-after` and persists, so `retryAfterSeconds` is optional and the UI must not promise a retry window |
| 400 | `invalid_request_error` | `bad_request`; **also returned when a spend limit is reached** (message-dependent), so a 400 during validation is shown as "request rejected" with the provider message category, not as a key problem |
| 413 | `request_too_large` | `bad_request` |
| 500, 504 | `api_error`, `timeout_error` | `unknown` / `network` |
| 529 | `overloaded_error` | `overloaded` |

- `GET /v1/models` as a free pre-check: **UNVERIFIED** (needs a valid key). T054 must implement
  the generation-based validation first and treat the pre-check as an optional optimization
  behind a flag that defaults to off.
- The fake-key probe proves the failure path: an invalid key yields a readable `401` over CORS,
  which is the main path onboarding must handle.

### Still unverified (needs a valid key)

- Exact `usage` values and event order on a live stream (fixtures are hand-built from the docs).
- Whether the `GET /v1/models` pre-check works for browser origins.
- Real-world 402 vs 400 behavior for an exhausted balance.
- Live behavior of `output_config.effort` on Sonnet 5.5 / Opus 5.5.

Recorded fixtures for T046/T047 must therefore be labelled **synthetic (from documentation)**
until a live capture replaces them. A free dev-provider adapter (see
[specs/002-free-dev-provider/](../002-free-dev-provider/) and
[docs/local-model.md](../../docs/local-model.md)) does not close these gaps because it is not Claude.
