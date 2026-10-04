# Research: Free Dev Provider

Facts about Ollama were read from its documentation and source on **2026-10-04**:

- <https://docs.ollama.com/api/openai-compatibility>
- <https://docs.ollama.com/faq>
- `envconfig/config.go` on the `main` branch of `github.com/ollama/ollama`
- <https://ollama.com/library/gemma3> and <https://ollama.com/library/qwen3>

Items marked **[verify at implementation]** must be checked against a running local Ollama during
implementation. That check is free, so unlike the Anthropic spike they can and must be closed, and
the results must be recorded below under "Verification Results".

## R1. Wire protocol: OpenAI-compatible chat completions over native `fetch`

- **Decision**: call `POST {baseUrl}/v1/chat/completions` with `stream: true` and
  `stream_options: { include_usage: true }`, and parse the server-sent events by hand with
  `fetch` and a `ReadableStream` reader. No SDK.
- **Rationale**: the documentation lists `model`, `messages`, `stream`, `stream_options`
  (`include_usage`), `max_tokens`, and `stop` as supported. The OpenAI SSE format is small
  (`data: {json}` lines, ending with `data: [DONE]`). Writing a parser by hand adds no package
  (CLAUDE.md: no packages the spec does not call for), runs in both browser and Node 22+, and keeps
  the adapter small enough to review.
- **Alternatives considered**: the `openai` npm SDK, rejected because it is a new runtime dependency
  for a dev-only tool and its retry default would need overriding (cost-safety rule, even if
  Ollama is free). The native `/api/chat` endpoint (NDJSON) was also rejected: the OpenAI-compatible
  shape is what other free runtimes (LM Studio, llama.cpp server) also expose, so the adapter stays
  useful if the owner switches runtimes.

## R2. Request mapping

- **Decision**:
  - The prompt layers are joined, in precedence order, into **one** `system` message, separated by
    a blank line. Conversation turns follow as `user`/`assistant` messages.
  - `max_tokens` is sent from `ModelRequest.maxTokens`.
  - `effort` is never sent: all local models are listed with `supportsEffort: false`.
  - `tools` is never sent: `001-core-foundation` sends none.
  - No `Authorization` header is sent. Ollama documents the key as "required but ignored", and
    that applies to OpenAI client libraries, not to raw HTTP.
  - No sampling parameters are sent, so Ollama's model defaults apply. This matches the Anthropic
    adapter, which also sends none.
- **Rationale**: one system message is the most portable form across OpenAI-compatible servers.
  Several system messages are accepted by some servers and silently merged or dropped by others.
- **[verify at implementation]**: that Ollama keeps the full system message (no silent truncation)
  for a prompt of realistic size with the context length from R5.

## R3. Response mapping

- **Decision**:
  - Every chunk's `choices[0].delta.content` (when non-empty) → `{ type: "text" }`.
  - `finish_reason`: `"stop"` → `"end"`, `"length"` → `"max_tokens"`, any other non-null value →
    `"end"`.
  - The final chunk carrying `usage` (`prompt_tokens`, `completion_tokens`) → one `usage` event
    with `inputTokens`/`outputTokens` exactly as reported; no cache fields.
  - `data: [DONE]` ends the stream. After it, the adapter emits `usage` (if reported) then `stop`.
  - The stream ends without a `finish_reason` → `{ type: "error", code: "network" }` (incomplete
    answer), the same rule as the Anthropic adapter.
  - No usage reported → no `usage` event. The pipeline already forwards `usage` events to the
    metrics stage without requiring them, and the app shows "unavailable" rather than inventing
    numbers (spec edge case).
- **[verify at implementation]**: that the usage chunk arrives with `choices: []` before
  `[DONE]`, and whether `finish_reason` arrives on the same chunk as the last text or on its own.
  The parser must handle both.

## R4. Error mapping and diagnostics

- **Decision**: map failures to existing `ProviderErrorCode` values. No new code is added to the
  port (spec FR-001).

  | Failure | Code | Developer diagnostic |
  |---|---|---|
  | `fetch` throws (`TypeError`) | `network` | `unreachable`: not running, wrong address, or origin not allowed |
  | HTTP 404 (documented for a missing model) | `bad_request` | `model_not_installed`, with the model name and the pull command |
  | HTTP 400, 413, 422 | `bad_request` | `rejected` |
  | HTTP 429 | `rate_limited` | `busy` |
  | HTTP 503 | `overloaded` | `busy` |
  | HTTP 500 and anything else | `unknown` | `failed` |
  | SSE `error` payload mid-stream | `unknown` | `failed` |

  Only the code leaves the adapter, so no raw message ever reaches the UI. The diagnostic is a
  fixed, non-secret enum plus the model name and the base URL. It goes to a `diagnose` callback
  passed to the adapter's constructor. The composition root wires it to `console.warn` in
  development builds, and the tools wire it to their output.
- **Rationale**: a browser reports "connection refused" and "blocked by CORS" as the same
  `TypeError` with no detail, by design, so the two cannot be told apart in the app. The guide
  covers how to tell them apart (`curl` to the runtime works → origin problem). There is no
  retry: Ollama is free, but the no-retries rule stays uniform.
- **[verify at implementation]**: the exact HTTP status and body for a missing model on the
  OpenAI-compatible endpoint (documented as 404), and the status Ollama returns when it is
  overloaded.

## R5. Default model and context length

- **Decision**: the model table lists:
  - `gemma3:4b`, the default: 3.3 GB download, 128K native context, 140+ languages, no thinking mode.
  - `gemma3:1b`, a fallback for weak hardware: 815 MB, 32K native context.

  The `contextWindow` listed for both is **32 768**, because that is what the setup guide
  configures (`OLLAMA_CONTEXT_LENGTH=32768`). The source shows the runtime default is 0, meaning
  "4k/32k/256k based on VRAM". So without that setting the effective window depends on the
  machine and can be as low as 4 096. `maxOutput` is set to 8 192 by policy, a conservative cap
  for small models, not a published limit.
- **Rationale**: Gemma 3 4B is small enough for a laptop, broadly multilingual (the app mediates
  in English and Spanish and teaches other languages), and has no thinking mode. Qwen3 also covers
  100+ languages, but its thinking mode adds output that arrives outside `content` and makes small
  machines slower, which complicates the first-line verdict test of Phase 4.
- **Known limitation**: Ollama silently truncates a prompt longer than its context window. It does
  not return an error. The adapter cannot detect this. The guide makes the setting explicit, and
  the model table states the assumption. This only partly meets the spec edge case "fail with a
  clear message rather than silently truncating" and is recorded as a known gap of a dev-only tool.
- **Alternatives considered**: `qwen3:4b`, kept as a documented alternative in the guide but not
  in the table. Llama 3.2 3B was not chosen because of its narrower official language list.

## R6. Pricing

- **Decision**: local models carry `pricing: { inputPerMTok: 0, outputPerMTok: 0, asOf: "2026-10-04" }`.
- **Rationale**: the cost of a local call is truly zero to the user, so a zero estimate is
  accurate and shows as free (FR-006) with no UI change. `pricing: null` would mean "unknown" and
  would show "unavailable", which is the wrong message.

## R7. Development-only availability

- **Decision**: three layers.
  1. **Build-time removal**: the composition root reaches the Ollama adapter only inside
     `if (import.meta.env.DEV && import.meta.env.VITE_PROVIDER === "ollama")`, through a dynamic
     `import()`. Vite replaces `import.meta.env.DEV` with `false` in `vite build`, so the branch
     and the chunk are dropped from production bundles.
  2. **CSP**: the production `connect-src` already allows only `'self'` and the Anthropic origin.
     The development CSP already allows `http://localhost:*`. So no CSP change is needed, and none
     is made.
  3. **Automated check (SC-005)**: a test builds the app in production mode with
     `VITE_PROVIDER=ollama` set and asserts that the output contains neither the adapter's
     identifier nor the default runtime address. A second assertion confirms that the production
     CSP has no `localhost` source. The existing CSP test may already cover this; if so, it is
     reused, not duplicated.
- **Rationale**: removing the code at build time is stronger than hiding a menu option. The CSP
  is an independent second barrier.
- **Alternatives considered**: a runtime feature flag, rejected because it would ship the code.
  A separate dev entry point (`index.dev.html`), rejected as more moving parts for the same result.

## R8. Credential handling

- **Decision**: the adapter ignores the `SecretHandle` entirely and never imports
  `@tarjuman/core/adapter`. A dependency-cruiser rule enforces this. In the app, the developer
  enters the placeholder `ollama` in the existing key screen. `validateCredential` performs a
  reachability check, `GET {baseUrl}/v1/models`, and returns `{ ok: true }` when the runtime
  answers. When the runtime is unreachable it returns `{ ok: false, code: "network" }` and emits
  the `unreachable` diagnostic. When the default model is missing from the list, it emits the
  `model_not_installed` diagnostic but still returns `ok`, so the developer can pick another
  installed model.
- **Rationale**: the onboarding flow and `KeyManager` require a non-empty key before the first
  conversation. Skipping that step for one dev-only provider would change core and UI code. A
  placeholder that is never transmitted keeps both untouched. This required amending spec FR-007
  (see plan.md, Spec Amendments).
- **[verify at implementation]**: that `GET /v1/models` exists on the OpenAI-compatible surface
  and lists locally pulled models by their tag names.

## R9. Tools: recorder (T079) and live runner (T080)

- **Decision**:
  - The recorder logic in `packages/testing/src/record-fixtures.ts` (T079) receives a
    `ProviderPort` and a `FixtureProvenance` as arguments. It never constructs a provider, because
    dependency-cruiser allows a concrete provider only in the composition root and in `tests/`.
  - A small selector, `tests/support/live-provider.ts`, built in this feature, picks the provider
    from `TARJUMAN_PROVIDER`:
    - `ollama` (default when unset) constructs `OllamaProvider` with `OLLAMA_BASE_URL` (default
      `http://localhost:11434`) and `OLLAMA_MODEL` (default `gemma3:4b`).
    - `anthropic` constructs `AnthropicProvider` and seals `TARJUMAN_TEST_KEY`. It is loaded only
      through `node --env-file=.env`, never printed.

    It returns `{ provider, secret, modelId, provenance }`.
  - Fixtures carry a `provenance` block (data-model.md). The per-PR guardrail suite (T070) prints
    the provenance label in its summary and never presents Ollama fixtures as SC-003 evidence. The
    live runner (T080) prints the label before the rates.
  - This feature edits the wording of T079 and T080 in `specs/001-core-foundation/tasks.md` to
    reference the selector and provenance, and drops "needs `TARJUMAN_TEST_KEY`" as a hard
    requirement. Both tasks are still implemented in Phase 4 of 001, not here.
- **Rationale**: it respects the existing boundary rules, keeps the Anthropic path intact for the
  day a key exists, and makes the default path free.

## R10. Contract testing and a live smoke test

- **Decision**:
  - The shared `runProviderContractSuite` runs against `OllamaProvider` with a stubbed `fetch`
    that replays SSE fixtures. Error codes are restricted to those the adapter can produce
    (`network`, `bad_request`, `rate_limited`, `overloaded`).
  - Fixtures start as **synthetic (from documentation)**. During implementation they are replaced
    by **captured from a local Ollama run** and labeled with the Ollama version and the date.
    Capturing is free.
  - An opt-in live smoke test, `packages/provider-ollama/tests/ollama.live.test.ts`, run by `pnpm test:live:ollama` in a
    `provider-live` Vitest project gated by `TARJUMAN_LIVE=1` like the existing live projects (and excluded from `unit`), streams one short answer from a running
    local Ollama through the adapter. When the runtime is unreachable it skips with a clear
    message, so CI never needs Ollama.
- **Rationale**: FR-016 and SC-004 ask for the same contract suite. A real capture closes the
  "synthetic fixture" gap for this adapter, which is impossible for Anthropic without a key.

## R11. Dependency boundaries

- **Decision**: new package `packages/provider-ollama` (`@tarjuman/provider-ollama`), depending
  only on `@tarjuman/core` (types), with `@tarjuman/testing` as a dev dependency.
  dependency-cruiser changes:
  - Add `provider-ollama` to `core-imports-no-outer-package`.
  - Generalize `provider-impl-only-in-composition-root` to `packages/provider-(anthropic|ollama)/`.
  - New rule: `provider-ollama-never-unseals`, which forbids `packages/provider-ollama/` from
    importing `@tarjuman/core/adapter` or the secret store and unseal ports.
  - New rule: `provider-ollama-not-in-prod-paths`, which allows `apps/web/src` to reach it only
    from `composition-root.ts`. The existing rule already covers this; it is kept explicit if
    the generalized rule does not.
- **Rationale**: this mirrors the Anthropic adapter's layout, so the two can be compared side by
  side, and boundaries are enforced mechanically, as for every other package.

## Verification Results

*(To be filled during implementation against a running Ollama, with its version and the date.)*
