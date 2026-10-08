---

description: "Task list for 002-free-dev-provider"
---

# Tasks: Free Dev Provider

**Input**: Design documents from `specs/002-free-dev-provider/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED. Constitution Principle XII and spec FR-016/SC-004/SC-005 require the shared
provider contract suite, a production-bundle check, and provenance validation. Within each story,
write the tests first and confirm they fail before implementing.

**Organization**: grouped by user story. US1 and US2 are both P1; US1 delivers the adapter, US2
makes the 001 tools use it. US3 (P2) is the setup guide.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: user story the task belongs to (US1–US3)
- Every task names the exact file path(s) it creates or edits

## Path Conventions

pnpm monorepo. All paths are relative to the repository root. The new package mirrors
`packages/provider-anthropic`. `packages/core` and `packages/ui` are **not** edited by this feature.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: create the empty package and wire it into the workspace, tests, and boundary rules.

- [X] T001 Create `packages/provider-ollama/` mirroring `packages/provider-anthropic/`: `package.json` (`"name": "@tarjuman/provider-ollama"`, `private`, `type: module`, `main`/`types`/`exports` → `./src/index.ts`, `dependencies: { "@tarjuman/core": "workspace:*" }`, `devDependencies: { "@tarjuman/testing": "workspace:*" }`, **no other dependency**), `tsconfig.json` copied from the Anthropic package with the same references, and an empty `src/index.ts`
- [X] T002 Register the package: add `{ "path": "packages/provider-ollama" }` to the root `tsconfig.json` references; add `"@tarjuman/provider-ollama": "workspace:*"` to **`devDependencies`** (not `dependencies`) of `apps/web/package.json`; run `pnpm install`; confirm `pnpm typecheck` passes
- [X] T003 [P] In `vitest.config.ts` add `"packages/*/tests/**/*.live.test.ts"` to the `unit` project's `exclude`, and add a `provider-live` project (`include: ["packages/*/tests/**/*.live.test.ts"]`, `environment: "node"`, `testTimeout: 120_000`) inside the same `TARJUMAN_LIVE` gate as `guardrails-live`; add `"test:live:ollama": "TARJUMAN_LIVE=1 vitest run --project provider-live"` to the root `package.json`
- [X] T004 [P] Update `.dependency-cruiser.cjs` per research R11: add `provider-ollama` to both alternations in `core-imports-no-outer-package`; change `provider-impl-only-in-composition-root` to match `^packages/provider-(anthropic|ollama)/` in both `from.pathNot` and `to.path`; add rule `provider-ollama-never-unseals` forbidding `^packages/provider-ollama/` from reaching `^packages/core/src/(ports/secret-(store|unseal)|adapter)\.ts$` and `@tarjuman/core/adapter`. Verify by temporarily adding `import "@tarjuman/core/adapter"` to `packages/provider-ollama/src/index.ts`, confirming `pnpm lint:arch` fails, then removing it

**Checkpoint**: `pnpm typecheck && pnpm lint && pnpm lint:arch && pnpm test` green with an empty package.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the pure pieces every story needs: model table, SSE parser, error mapping.

**⚠️ CRITICAL**: no user story work can begin until this phase is complete.

### Tests (write first, see them fail)

- [X] T005 [P] SSE parser tests in `packages/provider-ollama/tests/sse.test.ts`: parses `data: {json}` lines into objects; handles a JSON line split across two `Uint8Array` chunks and several lines in one chunk; ignores blank lines, `:` comment lines, and non-`data:` fields; `data: [DONE]` ends iteration; a malformed JSON `data:` line throws a parse error that carries **no line content** in its message
- [X] T006 [P] Error-mapping tests in `packages/provider-ollama/tests/errors.test.ts` covering every row of research R4: `TypeError` from fetch → `network` + diagnostic `unreachable`; 404 → `bad_request` + `model_not_installed` with `modelId`; 400/413/422 → `bad_request` + `rejected`; 429 → `rate_limited` + `busy`; 503 → `overloaded` + `busy`; 500 and unknown statuses → `unknown` + `failed`; assert each diagnostic has only the fields `kind`, `baseUrl`, optional `modelId`, optional `httpStatus` (data-model `OllamaDiagnostic`) and that a response body containing a fake secret never appears in the result or diagnostic
- [X] T007 [P] Model-table tests in `packages/provider-ollama/tests/models.test.ts`: exactly `gemma3:4b` (default) and `gemma3:1b`; each has `contextWindow: 32768`, `maxOutput: 8192`, `supportsEffort: false`, `effortLevels: []`, `pricing: { inputPerMTok: 0, outputPerMTok: 0, asOf: "2026-10-04" }`; display names contain "not Claude"; `DEFAULT_OLLAMA_MODEL_ID === "gemma3:4b"`

### Implementation

- [X] T008 [P] Implement `packages/provider-ollama/src/sse.ts`: `async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown>` using `TextDecoder` with `stream: true`, line buffering, and `[DONE]` termination (depends on T005)
- [X] T009 [P] Implement `packages/provider-ollama/src/errors.ts`: `export type OllamaDiagnostic = { kind: "unreachable" | "model_not_installed" | "rejected" | "busy" | "failed"; baseUrl: string; modelId?: string; httpStatus?: number }`; `mapStatus(status, ctx)` and `mapThrown(error, ctx)` returning `{ code: ProviderErrorCode; diagnostic: OllamaDiagnostic }`; never reads or forwards response text (depends on T006)
- [X] T010 [P] Implement `packages/provider-ollama/src/models.ts` with `OLLAMA_MODELS` and `DEFAULT_OLLAMA_MODEL_ID` per data-model.md, with a header comment citing research R5/R6 and stating that `contextWindow` assumes `OLLAMA_CONTEXT_LENGTH=32768` and `maxOutput` is a policy cap, not a published limit (depends on T007)

**Checkpoint**: T005–T007 pass; foundation ready.

---

## Phase 3: User Story 1 - Chat with a free local model while developing (Priority: P1) 🎯 MVP

**Goal**: a working `OllamaProvider` behind the unchanged `ProviderPort`, selectable only in dev builds.

**Independent Test**: with Ollama running and `VITE_PROVIDER=ollama pnpm --filter @tarjuman/web dev`, enter `ollama` on the key screen, send a message, see a streamed answer, token counts, and zero cost (quickstart V3).

### Tests for User Story 1 (write first, see them fail)

- [X] T011 [P] [US1] Build a fake transport in `packages/provider-ollama/tests/helpers/fake-ollama.ts` (stub `fetch` that records requests and replies with JSON, SSE from a fixture, a delayed SSE for abort, or a thrown `TypeError`), and synthetic SSE fixtures in `packages/provider-ollama/tests/fixtures/` (`stream-answer.json`, `stream-length.json`, `stream-truncated.json`, `models-list.json`) with a `README.md` stating **"synthetic (from documentation, 2026-10-04)"** until T020 replaces them
- [X] T012 [P] [US1] Contract suite in `packages/provider-ollama/tests/provider.contract.test.ts`: `runProviderContractSuite("ollama", makeHarness, { errorCodes: ["network", "bad_request", "rate_limited", "overloaded"] })` using T011's fake transport; `fail-leaking-secret` rejects with an error whose message contains the raw secret, and the suite asserts it never escapes (FR-016, SC-004)
- [X] T013 [P] [US1] Adapter-specific tests in `packages/provider-ollama/tests/ollama-provider.test.ts` per contracts/ollama-provider.md: request goes to `{baseUrl}/v1/chat/completions` with **no `Authorization` header**; body has one `system` message equal to the layers' text joined by `"\n\n"` in order, then the turns, plus `max_tokens`, `stream: true`, `stream_options: { include_usage: true }`, and **no** `reasoning_effort`, `tools`, or sampling keys even when `req.effort` is set; `finish_reason` `stop`→`end`, `length`→`max_tokens`; no usage chunk → no `usage` event but still `stop`; stream ends without `finish_reason` → single `error { code: "network" }`; exactly one fetch per `stream()` (no retries); `diagnose` is called once before the `error` event; the `SecretHandle` passed in is never unsealed (use a handle whose unseal throws); `validateCredential` → `GET {baseUrl}/v1/models`, `ok: true` on 200, `model_not_installed` diagnostic but still `ok` when the default model is missing, `{ ok: false, code: "network" }` + `unreachable` on `TypeError`, no request when the signal is already aborted; constructor throws on a non-http(s) or unparsable `baseUrl`, and trims trailing slashes (`http://localhost:11434/` → requests to `http://localhost:11434/v1/...`)
- [X] T014 [P] [US1] Production-bundle check in `apps/web/tests/prod-excludes-dev-provider.test.ts` (SC-005): run Vite's `build()` programmatically for `apps/web` with `mode: "production"`, `VITE_PROVIDER=ollama` set, and `build.outDir` in a temp directory; assert no emitted file contains `localhost:11434`, `/v1/chat/completions`, or the string `[tarjuman dev provider]` (the diagnostic prefix from T017); **positive control**: a second build with the same env plus `define: { "import.meta.env.DEV": "true" }` MUST contain `[tarjuman dev provider]`, so the test fails before T017 exists and proves the check can detect the code; delete the temp directory afterwards. Do **not** duplicate the existing production `connect-src` assertion in `apps/web/tests/csp.test.ts`, which already pins it to `'self'` + the Anthropic origin

### Implementation for User Story 1

- [X] T015 [US1] Implement `packages/provider-ollama/src/ollama-provider.ts`: `export interface OllamaProviderOptions { baseUrl?: string; fetch?: typeof fetch; diagnose?: (d: OllamaDiagnostic) => void; defaultModelId?: string }` with defaults `http://localhost:11434`, global `fetch`, no-op, `DEFAULT_OLLAMA_MODEL_ID`; `class OllamaProvider implements ProviderPort` with `id = "ollama"`, `listModels()`, `validateCredential()`, and `stream()` per contracts/ollama-provider.md and research R2–R4/R8, using `readSse` (T008) and the mappers (T009); abort handling mirrors `packages/provider-anthropic/src/anthropic-provider.ts` (one `stop { reason: "aborted" }`); imports from `@tarjuman/core` only, never `@tarjuman/core/adapter` (depends on T008–T013)
- [X] T016 [US1] Export `OllamaProvider`, `OllamaProviderOptions`, `OllamaDiagnostic`, `OLLAMA_MODELS`, `DEFAULT_OLLAMA_MODEL_ID` from `packages/provider-ollama/src/index.ts` (depends on T015)
- [X] T017 [US1] Add the dev-only branch to `createProvider()` in `apps/web/src/composition-root.ts`: `if (import.meta.env.DEV && import.meta.env.VITE_PROVIDER === "ollama")` → dynamic `import("@tarjuman/provider-ollama")`, construct with `baseUrl: import.meta.env.VITE_OLLAMA_BASE_URL` (when set) and `diagnose: (d) => console.warn("[tarjuman dev provider]", d.kind, d, "see docs/local-model.md#" + d.kind)`, return `modelIds` from `OLLAMA_MODELS` and `defaultModelId: DEFAULT_OLLAMA_MODEL_ID`; update the function's doc comment; the diagnostic logs only the `OllamaDiagnostic` object (no request or message content); add a one-line comment that this English text is developer-only console output, not a user-facing string, so Principle VIII's i18n rule does not apply (depends on T016; makes T014 pass)
- [X] T018 [P] [US1] Opt-in live smoke test in `packages/provider-ollama/tests/ollama.live.test.ts`: reads `OLLAMA_BASE_URL` (default `http://localhost:11434`) and `OLLAMA_MODEL` (default `gemma3:4b`); if `GET /v1/models` fails, `it.skip` with a message naming the `unreachable` diagnostic and `docs/local-model.md`; otherwise streams one short answer ("Say hola.", `maxTokens: 32`) and asserts ≥1 `text`, one `usage` with `outputTokens > 0`, and `stop { reason: "end" | "max_tokens" }` (depends on T016)
- [X] T019 [US1] Run `pnpm test:live:ollama` against a local Ollama. Close every **[verify at implementation]** item of research R2, R3, R4, R8 (missing-model status and body, usage-chunk position, `finish_reason` placement, `/v1/models` contents, overloaded status) and record the outcomes, the Ollama version, and the date under `## Verification Results` in `specs/002-free-dev-provider/research.md`; if a result contradicts the plan, stop and report before changing code (depends on T018)
- [X] T020 [US1] Replace the synthetic fixtures from T011 with real captures from the local Ollama run (raw SSE lines saved as JSON), update `packages/provider-ollama/tests/fixtures/README.md` to **"captured from Ollama <version>, <date>, model <id>"**, and adjust T012/T013 only if the real wire format differs (depends on T019)

**Checkpoint**: quickstart V1, V2, V3 pass. US1 is independently usable for manual chat against a free model.

---

## Phase 4: User Story 2 - Record and run guardrail fixtures without an Anthropic key (Priority: P1)

**Goal**: the 001 recorder (T079) and live runner (T080) can use Ollama by default, and every output carries non-Claude provenance.

**Independent Test**: the selector returns an Ollama provider with no `.env`; provenance schema rejects inconsistent records; the 001 task wording points at both (quickstart V4 is completed later by 001 Phase 4).

### Tests for User Story 2 (write first, see them fail)

- [X] T021 [P] [US2] Provenance tests in `packages/testing/tests/provenance.test.ts` per contracts/fixture-provenance.md: valid records for `ollama`, `anthropic`, `synthetic`; `isClaude` must equal `providerId === "anthropic"` (mismatch rejected); missing provenance rejected; `nonClaudeLabel("gemma3:4b")` returns exactly `"Recorded with a non-Claude model (gemma3:4b). Proves pipeline mechanics only; not evidence for 001 SC-003."`; a record containing extra fields (e.g. `apiKey`, `headers`) is rejected (strict schema)
- [X] T022 [P] [US2] Selector tests in `tests/guardrails/live-provider.test.ts`: with `TARJUMAN_PROVIDER` unset → provider id `ollama`, model `gemma3:4b`, provenance `isClaude: false`, and the returned `SecretHandle` holds the placeholder `ollama`; `OLLAMA_BASE_URL`/`OLLAMA_MODEL` are honored; `TARJUMAN_PROVIDER=anthropic` without `TARJUMAN_TEST_KEY` throws an error whose message names the variable and contains no value; an unknown `TARJUMAN_PROVIDER` throws listing the allowed values; no test reads `.env`

### Implementation for User Story 2

- [X] T023 [US2] Implement `packages/testing/src/provenance.ts` (Zod, strict): `FixtureProvenance` with fields `providerId: "ollama" | "anthropic" | "synthetic"`, `modelId: string`, `runtimeVersion: string | null`, `recordedAt: ISO 8601 date`, `isClaude: boolean`, `label: string`, refinement `isClaude === (providerId === "anthropic")`; `FixtureProvenanceDraft` (the same schema without `recordedAt`, data-model `LiveProviderSelection`); `nonClaudeLabel(modelId)`; `parseProvenance(json)`; export from `packages/testing/src/index.ts` (depends on T021)
- [X] T024 [US2] Implement `tests/support/live-provider.ts`: `selectLiveProvider(env = process.env): Promise<LiveProviderSelection>` per data-model `LiveProviderSelection`; `ollama` (default) builds `OllamaProvider` with `diagnose` printing the diagnostic to stderr and fetches `runtimeVersion` from `GET {baseUrl}/api/version` (null on failure); `anthropic` dynamically imports `AnthropicProvider` and seals `TARJUMAN_TEST_KEY`; never logs env values; add `tests/support` to the relevant tsconfig `include` if `tsc -b` needs it (depends on T022, T023, T016)
- [X] T025 [US2] Edit `specs/001-core-foundation/tasks.md`: rewrite **T079** to say the recorder logic in `packages/testing/src/record-fixtures.ts` receives a `ProviderPort`, `SecretHandle`, and `FixtureProvenance` (never constructs a provider), its entry point uses `selectLiveProvider()` from `tests/support/live-provider.ts` (Ollama by default, `TARJUMAN_PROVIDER=anthropic` with `TARJUMAN_TEST_KEY` optional), it writes `packages/testing/fixtures/guardrails/provenance.json`, and it adds `pnpm record:guardrails`; rewrite **T080** to use the same selector, print the provenance label as the first line, report rates as informational when `isClaude` is false, and end with "001 SC-003: unverified (no Claude run)"; amend **T070** so the per-PR suite loads provenance and asserts SC-003 thresholds only when `isClaude` is true, otherwise mechanics only; reference `specs/002-free-dev-provider/contracts/fixture-provenance.md` in all three (depends on T023, T024)

**Checkpoint**: T021–T022 pass; the 001 task list can proceed into Phase 4 without a key.

---

## Phase 5: User Story 3 - Set up the local model without guessing (Priority: P2)

**Goal**: a guide that takes the owner from nothing to a streamed answer in under 30 minutes.

**Independent Test**: follow `docs/local-model.md` on a machine without Ollama (quickstart V5).

- [ ] T026 [US3] Write `docs/local-model.md` (FR-012): what this is and is not ("dev only, not Claude, never in production"); install Ollama on macOS/Linux/Windows; `ollama pull gemma3:4b` (and `gemma3:1b` for under ~8 GB RAM; `qwen3:4b` mentioned as an alternative with its thinking-mode caveat); set `OLLAMA_CONTEXT_LENGTH=32768` (macOS app: `launchctl setenv` then restart; CLI: env var before `ollama serve`) and why (silent truncation, research R5); origins: `localhost:*` is allowed by default, `OLLAMA_ORIGINS` only when serving the app from another host; run the app with `VITE_PROVIDER=ollama` and enter `ollama` on the key screen; run `pnpm test:live:ollama`; a **Troubleshooting** section with one heading per diagnostic kind whose anchors match T017's links (`#unreachable`, `#model_not_installed`, `#rejected`, `#busy`, `#failed`), including how to tell "not running" from "origin not allowed" (`curl http://localhost:11434/api/version` works → origin problem); all text in English
- [ ] T027 [US3] Link the guide from `CLAUDE.md` (Commands section: `VITE_PROVIDER=ollama pnpm --filter @tarjuman/web dev`, `pnpm test:live:ollama`) and from `specs/001-core-foundation/research.md` Spike Results, replacing "A free dev-provider adapter (see the owner's roadmap)" with a link to `specs/002-free-dev-provider/` and `docs/local-model.md`, keeping the statement that it does not close the Claude gaps

**Checkpoint**: all three stories done.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T028 Update `CLAUDE.md` "Current state": feature 002 adds a dev-only Ollama provider; Anthropic is still the only product provider; non-Claude results never count as 001 SC-003 evidence; add a gotcha line on `VITE_PROVIDER=ollama` being dev-only and stripped from production builds
- [ ] T029 Secret sweep (SC-002): confirm `grep -rE "sk-ant|x-api-key|authorization" packages/provider-ollama packages/testing/fixtures tests/support` finds only test assertions and synthetic constants, never a real value; confirm no file under `packages/provider-ollama` imports `@tarjuman/core/adapter`
- [ ] T030 Run `pnpm typecheck && pnpm lint && pnpm lint:css && pnpm lint:arch && pnpm test` plus quickstart V1–V3 and V5, and record results (pass/fail, Ollama version, timing for V5) in `specs/002-free-dev-provider/checklists/validation.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none. T001 → T002; T003 and T004 can follow in parallel.
- **Foundational (Phase 2)**: depends on Setup; blocks all stories.
- **US1 (Phase 3)**: depends on Foundational.
- **US2 (Phase 4)**: T021 and T023 depend only on Setup; T024 needs `OllamaProvider` (T016) from US1.
- **US3 (Phase 5)**: T026 needs the diagnostic kinds (T009) and the anchors used in T017; best done after US1 so the steps are verified.
- **Polish (Phase 6)**: after all stories.

### Within Each User Story

- Tests first; they must fail before implementation.
- T019 and T020 need a running local Ollama on the owner's machine. They are free but cannot run in CI.

### Parallel Opportunities

- Phase 1: T003, T004
- Phase 2: T005–T007 together, then T008–T010 together
- US1: T011–T014 together; T018 alongside T017
- US2: T021, T022 together

---

## Parallel Example: User Story 1

```bash
# Tests together:
Task: "Fake transport and synthetic fixtures in packages/provider-ollama/tests/helpers/fake-ollama.ts"
Task: "Contract suite in packages/provider-ollama/tests/provider.contract.test.ts"
Task: "Adapter tests in packages/provider-ollama/tests/ollama-provider.test.ts"
Task: "Production-bundle check in apps/web/tests/prod-excludes-dev-provider.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 + Phase 2.
2. Phase 3 (US1). **Stop and validate**: chat against a local model in the dev build (quickstart V3).

### Incremental Delivery

Suggested review batches (one commit each, owner reviews between them):

1. T001–T004: package skeleton and boundary rules
2. T005–T010: SSE parser, error mapping, model table
3. T011–T014: US1 tests (red)
4. T015–T018: adapter and dev-only wiring (green)
5. T019–T020: live verification and real fixtures (owner's machine)
6. T021–T025: provenance, selector, 001 task edits
7. T026–T027: setup guide
8. T028–T030: polish and validation

After batch 8 with green checks: merge `002-free-dev-provider` to `main`, then start 001 Phase 4
on a new branch.
