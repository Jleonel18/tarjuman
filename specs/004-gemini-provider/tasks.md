---

description: "Task list for 004-gemini-provider"
---

# Tasks: Gemini Provider

**Input**: Design documents from `/specs/004-gemini-provider/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED. The constitution (Principle XII) requires verifiable acceptance criteria, and
CLAUDE.md requires tests before implementation within a story. Write each test task first, run it,
and confirm it fails for the right reason before the implementation task that follows it.

**Organization**: Phase 2 builds multi-provider support in the core, which every story needs. US1
(P1, use Gemini) is the MVP. US2 (P2, switch provider) and US3 (P3, owner live tools) follow.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: User story the task belongs to (US1–US3)
- Every task names the exact file path(s) it creates or edits

## Rules that apply to every task

- Never read, print, or log `.env`. Live tools load it with `node --env-file=.env`.
- No Gemini key, real or realistic, in any committed file. Test keys are obviously fake
  (`AIzaFAKE…`, `AQ.FAKE…`) and still match the shapes in data-model.md → KeyShape.
- No automatic retries. No hard-coded user-facing strings. CSS uses logical properties and tokens.
- Fixtures that imitate Gemini's wire format are synthetic: each one says so and names the live
  shape it follows (research R3).

---

## Phase 1: Setup

**Purpose**: approved spec amendments, the empty adapter package, and the build wiring.

- [ ] T001 Apply the four approved amendments from plan.md → "Spec Amendments" to `specs/004-gemini-provider/spec.md`:
  - US1-5 and FR-013: a safety block is shown as a refusal, not an error category.
  - FR-013: Gemini's 429 maps to `rate_limited` only.
  - Edge case: a key shaped for the other provider is rejected locally, before any request, with a message naming its provider.

  Add a one-line note under FR-003 in `specs/001-core-foundation/spec.md`: "Amended by 004-gemini-provider: Gemini is a second product provider."
- [ ] T002 Create the package `packages/provider-gemini/`, mirroring `packages/provider-ollama/`:
  - `package.json`: name `@tarjuman/provider-gemini`; deps `@tarjuman/core`; devDeps `@tarjuman/testing`.
  - `tsconfig.json`.
  - `src/index.ts` with empty exports.
  - `src/origin.ts` exporting `GEMINI_API_ORIGIN = "https://generativelanguage.googleapis.com"`.

  Wire it in:
  - add a reference in the root `tsconfig.json`;
  - add `"@tarjuman/provider-gemini": "workspace:*"` to the root `package.json` and `apps/web/package.json`;
  - run `pnpm install` (no new npm package).
- [ ] T003 [P] Update `.dependency-cruiser.cjs` to treat `provider-gemini` like the other adapters:
  - add it to the "adapters and apps" path list;
  - extend `provider-impl-only-in-composition-root` to `provider-(anthropic|ollama|gemini)`;
  - add `providers-independent` rules so that `provider-gemini`, `provider-anthropic`, and `provider-ollama` cannot import each other (or `@anthropic-ai/sdk`);
  - add `packages/provider-gemini/` to the paths allowed to import `@tarjuman/core/adapter` (unseal).

  Run `pnpm lint:arch` and confirm it is green.
- [ ] T004 [P] Add `GEMINI_API_KEY=` (empty, with a comment like the existing one: developer tooling only, never how learners provide a key) to `.env.example`.

---

## Phase 2: Foundational (multi-provider core)

**Purpose**: the core, storage, and test doubles learn about more than one provider
(contracts/multi-provider-core.md). Nothing user-visible changes yet, and the app still works with
Anthropic only.

**⚠️ CRITICAL**: no user story can start until this phase is complete.

### Key shapes and secret filter

- [ ] T005 [P] Write tests in `packages/core/tests/credentials/key-shapes.test.ts`:
  - `providerOfKey()` returns `anthropic` for `sk-ant-…`, `gemini` for `AIza` + 35 characters of `[A-Za-z0-9_-]` and for `AQ.` + 30 or more of them, and `undefined` otherwise;
  - `maskKey()` returns `sk-ant-…a1b2`, `AIza…a1b2`, `AQ.…a1b2`, or `…a1b2` for an unknown shape;
  - `findKeyShape(text)` finds a key anywhere in a token.
- [ ] T006 Implement `packages/core/src/credentials/key-shapes.ts`, the KeyShape table from data-model.md, as plain data with no provider imports:
  - `anthropic`: `sk-ant-[A-Za-z0-9_-]{8,}`;
  - `gemini`: `AIza[A-Za-z0-9_-]{35}` and `AQ\.[A-Za-z0-9_-]{30,}`.

  Export it from `packages/core/src/index.ts`, and make `KeyManager`'s private `maskKey` in `packages/core/src/credentials/key-manager.ts` use it.
- [ ] T007 Move `SecretStreamFilter` from `packages/provider-anthropic/src/scrub.ts` to `packages/core/src/credentials/secret-stream-filter.ts`:
  - export it from `packages/core/src/adapter.ts`;
  - move its tests from `packages/provider-anthropic/tests/scrub.test.ts` into `packages/core/tests/credentials/secret-stream-filter.test.ts`;
  - keep `scrubSecret` and its tests in the Anthropic package, and change only the import in `packages/provider-anthropic/src/anthropic-provider.ts` (research R13).

  No behavior change: existing tests stay green.

### Chat input guard (red-team first)

- [ ] T008 [P] Add red-team cases to `tests/adversarial/cases/key-disclosure.json` (fake keys only). Cover a Gemini `AIza…` key and an `AQ.…` key:
  - alone;
  - after `GEMINI_API_KEY=`;
  - in backticks or quotes;
  - split by zero-width characters;
  - inside untrusted material.

  Add matching unit cases to `packages/core/tests/pipeline/input-guard.test.ts`. Run `pnpm test:redteam` and confirm the `AQ.` cases fail.
- [ ] T009 Make `packages/core/src/pipeline/input-guard.ts` detect every KeyShape pattern (FR-010) by replacing the `ANTHROPIC_KEY` constant with the table from T006. The existing generic high-entropy check is unchanged. T008 now passes.

### Credential store per provider

- [ ] T010 [P] Write tests in `packages/storage-web/tests/credential-store.test.ts` for the new `CredentialStore` API (contracts/multi-provider-core.md):
  - save `anthropic` and `gemini` keys side by side, in the same mode and in mixed modes;
  - `load(id)` and `describe(id)` return only that provider's key;
  - `list()` lists both;
  - `remove("gemini")` leaves `anthropic` untouched;
  - saving `gemini` in session mode removes only the persistent `gemini` key;
  - `removeAll()` leaves nothing in either mode;
  - the AES-GCM additional data is the provider id.
- [ ] T011 [P] Write an upgrade test in `packages/storage-web/tests/storage.test.ts` with `fake-indexeddb`:
  - create a version-1 database holding a credential record under the key `"current"` with `providerId: "anthropic"`;
  - open it with the new code;
  - expect the record under `"anthropic"`, no `"current"`, and `load("anthropic")` returning the same key (SC-006).
- [ ] T012 Change `CredentialStore` in `packages/core/src/ports/storage.ts`:
  - `load(providerId)`, `describe(providerId)`, `remove(providerId)`;
  - add `list()` and `removeAll()`;
  - doc comments say "at most one key per provider (FR-004)".
- [ ] T013 Implement the storage side so that T010 and T011 pass:
  - `packages/storage-web/src/indexeddb-storage.ts`:
    - `DB_VERSION = 2`;
    - credential records keyed by `providerId`;
    - the upgrade moves `"current"` to its `providerId`;
    - `CredentialRecordAccess` methods take a provider id, and a new `listCredentialRecords()` is added.
  - `packages/storage-web/src/session-secrets.ts`: a map `providerId → { handle, meta }`.
  - `packages/storage-web/src/credential-store.ts`: the per-provider API.
  - `packages/storage-web/src/memory-storage.ts`, if it implements the same access.

### Key manager, validator, data controller

- [ ] T014 [P] Write tests in `packages/core/tests/credentials/key-manager.test.ts`:
  - `enter("anthropic", <fake AQ. key>, …)` → `{ ok: false, code: "wrong_provider", expectedProviderId: "gemini" }`, and the stub validator was called **zero** times; the reverse case behaves the same way;
  - a key of unknown shape is validated against the given provider only;
  - `replace` and `remove` act on one provider and leave the other provider's stored key untouched;
  - a failed replacement keeps that provider's old key.
- [ ] T015 [P] Update the tests in `packages/core/tests/credentials/data-controller.test.ts`: with keys stored for two providers, `deleteAll` removes both, and the check fails if `list()` is non-empty or any provider's `load()` returns a key (SC-007).
- [ ] T016 Implement the core credential side so that T014 and T015 pass:
  - `packages/core/src/pipeline/credential-validation.ts`: `CredentialValidator.validate(providerId, secret, signal?)`. `ProviderCredentialValidator` takes `readonly ProviderPort[]` and returns `{ ok: false, code: "bad_request" }` for an unknown id.
  - `packages/core/src/credentials/key-manager.ts`:
    - `enter`, `replace`, and `remove` take a provider id; the `providerId` dependency is removed;
    - `wrong_provider` is checked before validation;
    - `EnterKeyOutcome` is as in data-model.md.
  - `packages/core/src/credentials/data-controller.ts`: `removeAll` plus the check over every provider. It takes the list of offered provider ids.

### Profile, usage, pipeline

- [ ] T017 [P] Write tests in `packages/core/tests/profile/validation.test.ts`:
  - `providerId` is required on input;
  - `modelId` must belong to that provider's models (the option `modelsByProvider: Record<string, readonly string[]>` replaces `knownModelIds`);
  - `readStoredProfile()` (or the existing read path) maps a stored profile without `providerId` to `"anthropic"` (FR-002).
- [ ] T018 [P] Write tests in `packages/core/tests/pipeline/pipeline.integration.test.ts`, using two mock providers with different ids:
  - the turn goes to the provider named by `profile.providerId`, with that provider's key;
  - the other provider's `stream` is never called;
  - an unknown `providerId` → `error: bad_request` and no call;
  - a missing key for the active provider → `error: invalid_credential`;
  - the usage record carries `providerId`;
  - the constructor rejects an empty list and duplicate ids.
- [ ] T019 [P] Write tests in `packages/core/tests/pipeline/pipeline.guardrails.test.ts` for `stop: refusal` (research R5):
  - (a) no text → refusal shown, status `refused`;
  - (b) `ACCEPT\n` plus partial text, then `stop: refusal` → partial text kept, refusal template appended, status `refused`, never `complete`.

  Run both cases against a mock provider.
- [ ] T020 Add `providerId` to `LearnerProfile` in `packages/core/src/profile/types.ts` and the rule from T017 in `packages/core/src/profile/validation.ts`. Add optional `providerId` to `UsageRecord` in `packages/core/src/stats/types.ts`, and set it in `buildUsageRecord` in `packages/core/src/stats/usage.ts`. T017 passes.
- [ ] T021 Change `packages/core/src/pipeline/pipeline.ts` so that T018 and T019 pass:
  - `PipelineDeps.providers: readonly ProviderPort[]` (frozen copy; checked non-empty and unique);
  - per-turn selection by `profile.providerId`;
  - `credentials.load(profile.providerId)`;
  - the model is looked up in the selected provider;
  - `providerId` is passed to `runMetrics` in `packages/core/src/pipeline/metrics.ts`;
  - `stop: refusal` → `refused` with the template appended.

  The stage order, freezing, and no-retry rules are unchanged.
- [ ] T022 [P] In `packages/testing/src/mock-provider.ts`, give `MockProvider` an optional `id` (default `"mock"`) and an optional model table. Export a second table `MOCK_ALT_MODELS` (one model, id `mock-alt-model`) for two-provider tests.
- [ ] T023 Update every caller of the changed APIs:
  - `apps/web/src/composition-root.ts`: pass `providers: [provider]` for now; give `DataController` the provider ids; `models` grouped by provider.
  - `apps/web/src/controller.ts`: per-provider key calls with the profile's `providerId`; `validateProfile` with `modelsByProvider`; new profiles get the single provider's id.
  - `apps/web/src/routes.tsx`.
  - `tests/support/*`, `packages/testing/src/*`, and the existing tests.

  Run `pnpm typecheck && pnpm lint && pnpm lint:arch && pnpm test && pnpm test:e2e`. All must be green, with the app behaving exactly as before.

**Checkpoint**: the core supports several providers and keys; the product still offers Anthropic only.

---

## Phase 3: User Story 1 - Use Tarjuman with my own Gemini key (Priority: P1) 🎯 MVP

**Goal**: a learner chooses Gemini in onboarding, enters their key, and chats under the same rules.

**Independent Test**: fresh profile → choose Gemini → valid key → one in-scope answer with usage and
cost, and one out-of-scope refusal (quickstart V1 e2e with mock providers, V2 manually with a real
key).

### Tests for User Story 1 ⚠️ write first, confirm they fail

- [ ] T024 [P] [US1] Write synthetic SSE fixtures in `packages/provider-gemini/tests/fixtures/`, each with a header comment "synthetic; shape from live capture 2026-10-14, research R3":
  - a normal answer in 3 chunks with cumulative `usageMetadata` including `thoughtsTokenCount` and `cachedContentTokenCount`;
  - a part with `thought: true`;
  - `finishReason: SAFETY` after partial text;
  - `promptFeedback.blockReason` with no candidates;
  - `MAX_TOKENS`;
  - a stream that ends with no finish reason;
  - a mid-stream `error` object;
  - a malformed `data:` line;
  - error bodies for 400 `API_KEY_INVALID`, 400 other, 401 `ACCESS_TOKEN_TYPE_UNSUPPORTED`, 403, 404, 429 with `RetryInfo.retryDelay: "17s"`, 500, 503, and 504.
- [ ] T025 [P] [US1] Write `packages/provider-gemini/tests/provider.contract.test.ts`, which runs `@tarjuman/testing`'s provider contract suite against `GeminiProvider` with a stubbed `fetch` (FR-016, SC-002).
- [ ] T026 [P] [US1] Write `packages/provider-gemini/tests/request.test.ts`, checking that:
  - the URL is `${GEMINI_API_ORIGIN}/v1beta/models/{id}:streamGenerateContent?alt=sse`;
  - the key is only in the `x-goog-api-key` header, and no URL ever contains `key=` or the key (FR-008);
  - `systemInstruction.parts` holds one part per layer, in order;
  - the role `assistant` is sent as `model`;
  - `maxOutputTokens` is set;
  - `thinkingConfig.thinkingLevel` is present only when the model supports the effort;
  - `safetySettings`, `tools`, `toolConfig`, `temperature`, `topP`, `topK`, `cachedContent`, `includeThoughts`, and `thinkingBudget` are absent;
  - validation is a `GET` of `models/gemini-3.8-flash`.
- [ ] T027 [P] [US1] Write `packages/provider-gemini/tests/stream.test.ts` with the T024 fixtures, checking that:
  - text arrives in order and thought parts are skipped;
  - usage follows research R4 (`inputTokens = prompt − cached`, `cacheReadTokens = cached`, `outputTokens = candidates + thoughts`, `cacheWriteTokens = 0`, latest chunk wins);
  - every row of the finish table in research R5 holds;
  - abort before and during the stream gives `stop: aborted`;
  - a line split at every byte boundary parses the same;
  - a key echoed in the model text is redacted.
- [ ] T028 [P] [US1] Write `packages/provider-gemini/tests/errors.test.ts`, checking that:
  - every row of the error table in research R6 maps as listed, including `retryAfterSeconds: 17`;
  - no event, returned value, or thrown error contains the key or the server's `message` text (use `assert-no-secret` from `@tarjuman/testing`);
  - `fetch` is called exactly once per call (no retry).
- [ ] T029 [P] [US1] Write `packages/provider-gemini/tests/models.test.ts`, checking the table matches research R8 exactly:
  - three ids, `gemini-3.8-flash` as the default;
  - context, max output, prices, and `asOf: "2026-10-14"`;
  - effort levels `low|medium|high`.
- [ ] T030 [P] [US1] Update `apps/web/tests/csp.test.ts` and `tests/architecture/bundle-origins.test.ts`: `connect-src` is exactly `'self'`, the Anthropic origin, and the Gemini origin; `PROVIDER_ORIGINS` equals `[ANTHROPIC_API_ORIGIN, GEMINI_API_ORIGIN]` (FR-011).
- [ ] T031 [P] [US1] Write `tests/e2e/provider-choice.spec.ts` (mock build with two mock providers). Onboarding:
  - shows a provider choice with nothing preselected, and Next is disabled until one is chosen;
  - choosing the second provider shows its key help;
  - a key shaped for the other provider shows the `wrong_provider` message and makes no request;
  - a valid key leads to a streamed answer.

  Scope positional selectors to `main` (CLAUDE.md gotcha).

### Implementation for User Story 1

- [ ] T032 [US1] Implement `packages/provider-gemini/src/models.ts` (research R8) and `packages/provider-gemini/src/errors.ts` (research R6: status plus allow-listed `error.status`, `details[].reason`, `RetryInfo.retryDelay`; the message is never read). T028 and T029 pass.
- [ ] T033 [US1] Implement `packages/provider-gemini/src/sse.ts`, a `data:` line reader over `ReadableStream<Uint8Array>` that throws a named `SseParseError` on bad JSON. It may follow `packages/provider-ollama/src/sse.ts`, but must not import it.
- [ ] T034 [US1] Implement `packages/provider-gemini/src/gemini-provider.ts` per contracts/gemini-provider.md:
  - `listModels`, `validateCredential`, and `stream`;
  - `unsealSecret` and `SecretStreamFilter` imported from `@tarjuman/core/adapter`;
  - an optional `fetch` for tests;
  - export everything from `packages/provider-gemini/src/index.ts`.

  T025–T027 pass.
- [ ] T035 [US1] Add `GEMINI_API_ORIGIN` to `PROVIDER_ORIGINS` in `apps/web/csp.ts`. T030 passes, and `pnpm check:bundle-origins` passes on a production build.
- [ ] T036 [US1] Update `apps/web/src/composition-root.ts` (research R15):
  - product build: `providers: [new AnthropicProvider(), new GeminiProvider()]`, with models and defaults per provider;
  - `VITE_PROVIDER=mock`: two `MockProvider`s (`mock` and `mock-alt`) with their tables;
  - `ollama`: unchanged, one provider;
  - expose `services.providers: { id, models, defaultModelId }[]` (no `ProviderPort` in the UI).
- [ ] T037 [P] [US1] Add i18n keys to `packages/ui/src/i18n/locales/en.json` and `es.json` (research R17):
  - `provider.legend` and `provider.name.anthropic` / `provider.name.gemini`;
  - `key.help.anthropic` and `key.help.gemini`;
  - `key.link.gemini` (link text for `https://aistudio.google.com/apikey`);
  - `key.disclosure.gemini`: "With a free Gemini key, Google may use what you send to improve its products. With a paid key, it does not.";
  - `key.wrong_provider`: "This looks like a {provider} key. Choose {provider} above, or paste a key for the provider you selected.";
  - names for the mock providers in the test locales, if needed.

  `pnpm lint:i18n` passes.
- [ ] T038 [US1] Create `packages/ui/src/key/ProviderChoice.tsx`:
  - a radio group with a `fieldset`/`legend`, keyboard accessible;
  - rendered only when more than one provider is offered;
  - no default selection.

  Update `packages/ui/src/key/KeyHint.tsx` and `packages/ui/src/key/KeyEntry.tsx`:
  - help, link, and disclosure follow the selected provider;
  - the `wrong_provider` message names `expectedProviderId`'s display name;
  - logical properties and tokens only.
- [ ] T039 [US1] Update `packages/ui/src/onboarding/Onboarding.tsx` and `apps/web/src/controller.ts`:
  - the provider is chosen before the key;
  - the profile is saved with `providerId` and that provider's default model;
  - `enter(providerId, …)` is called.

  Then update `apps/web/src/routes.tsx` so the model settings list only the active provider's models (FR-018). T031 passes.
- [ ] T040 [US1] Run `pnpm typecheck && pnpm lint && pnpm lint:css && pnpm lint:arch && pnpm lint:i18n && pnpm test && pnpm test:redteam && pnpm test:e2e` and fix anything red, without weakening any test (SC-003).

**Checkpoint**: US1 works end to end with mock providers. The owner can try quickstart V2 with a
real key.

---

## Phase 4: User Story 2 - Switch provider later (Priority: P2)

**Goal**: change the active provider in settings, keep both keys, and continue old conversations.

**Independent Test**: profile with an Anthropic (mock) key and one conversation → switch to the
other provider → enter its key → continue the old conversation; the new answer's usage names the
new provider; switching back needs no key.

### Tests for User Story 2 ⚠️ write first, confirm they fail

- [ ] T041 [P] [US2] Add controller tests in `apps/web/tests/controller.test.ts`:
  - switching provider sets `providerId`, resets `modelId` to the new default, and keeps `configuredEffort`;
  - with no key for the new provider, sending is blocked and the key form is shown;
  - with a stored key for the new provider, no key is asked for;
  - deleting or replacing one provider's key leaves the other's.
- [ ] T042 [P] [US2] Extend `tests/e2e/provider-choice.spec.ts`:
  - switch in settings without a key for the new provider (prompted), then with one (not prompted);
  - continue an existing conversation and see the earlier messages kept;
  - "Delete all my data" with keys for both providers leaves no `tarjuman` database or key (poll `indexedDB.databases()`, as `key-and-data-control.spec.ts` does).

### Implementation for User Story 2

- [ ] T043 [US2] Add i18n keys `settings.provider.title`, `settings.provider.key_stored`, `settings.provider.key_missing`, and `settings.provider.switch` to `packages/ui/src/i18n/locales/en.json` and `es.json`.
- [ ] T044 [US2] Create `packages/ui/src/settings/ProviderSettings.tsx`:
  - reuses `ProviderChoice`;
  - shows for each provider whether a key is stored, with its masked hint only.

  Update `packages/ui/src/settings/KeySettings.tsx` so replace and delete act on the active provider. Wire both in `apps/web/src/routes.tsx`.
- [ ] T045 [US2] Implement the switch in `apps/web/src/controller.ts`: profile update, model reset, key-state lookup via `credentials.describe(providerId)`, and the send gate when there is no key. T041 and T042 pass.
- [ ] T046 [US2] Run the full check list from T040.

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 - Owner runs live checks with a Gemini key (Priority: P3)

**Goal**: a live smoke test and the guardrail tools run against Gemini, printing no secret.

**Independent Test**: `pnpm test:live:gemini` streams one answer; recording one rule file with
`TARJUMAN_PROVIDER=gemini` produces fixtures with Gemini provenance and the "not Claude" label.

### Tests for User Story 3 ⚠️ write first, confirm they fail

- [ ] T047 [P] [US3] Add tests to the existing tests of `tests/support/live-provider.ts` (find them with `grep -rl live-provider tests packages`):
  - `TARJUMAN_PROVIDER=gemini` without `GEMINI_API_KEY` throws an error that names the variable and contains no value;
  - with a fake key, it returns a `GeminiProvider`, model `gemini-3.5-flash-lite`, and provenance `{ providerId: "gemini", isClaude: false, label: nonClaudeLabel(...) }`;
  - an unknown value lists `ollama, anthropic, gemini`.

### Implementation for User Story 3

- [ ] T048 [US3] Add the `gemini` choice to `tests/support/live-provider.ts` (research R16). It reads `GEMINI_API_KEY` and never prints it. T047 passes. Update the doc comment of `scripts/record-guardrails.ts` with the `node --env-file=.env --import tsx` command from quickstart.md V5.
- [ ] T049 [US3] Write `packages/provider-gemini/tests/gemini.live.test.ts`:
  - skipped unless `TARJUMAN_LIVE=1` and `GEMINI_API_KEY` are set;
  - one `validateCredential` call and one short stream on `gemini-3.5-flash-lite`;
  - prints only the text, usage, and stop reason;
  - a 429 or 503 is reported, not retried.

  Add `"test:live:gemini": "TARJUMAN_LIVE=1 node --env-file=.env node_modules/vitest/vitest.mjs run --project provider-live packages/provider-gemini"` to the root `package.json`. `.env` is loaded by Node itself, never by code that reads the file.
- [ ] T050 [US3] Ask the owner to run `pnpm test:live:gemini` (the agent may run it too, because it prints no secret) and record the result, date, and model in `specs/004-gemini-provider/research.md` → a new "Live results" section (SC-008).

**Checkpoint**: all three stories work.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T051 [P] Update `ARCHITECTURE.md`:
  - the providers section: two product providers, the provider set in the pipeline, keys per provider, and IndexedDB v2;
  - `SECURITY.md`: the Gemini key travels in a header only; a wrong-provider key is rejected locally; the CSP origin list; the free-tier disclosure.
- [ ] T052 [P] Update `CLAUDE.md`:
  - "Current state" gets a paragraph on feature 004;
  - add gotchas: AI Studio issues `AQ.` keys; the key goes in `x-goog-api-key`, never `?key=`; `GEMINI_API_KEY` in `.env`; credential DB version 2 keyed by provider id; `stop: refusal` → `refused`; the Gemini prices change on 2026-12-01 and 2027-01-01;
  - the repository map lists `packages/provider-gemini`.
- [ ] T053 [P] Write `specs/004-gemini-provider/checklists/validation.md` with each SC-001…SC-008, the test or manual step that proves it, and its status. SC-001 and V2/V3 are left for the owner's manual run.
- [ ] T054 Run quickstart.md V1 in full and record the results in `specs/004-gemini-provider/checklists/validation.md`.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: needs T002 for package wiring only where noted. It blocks all stories.
- **US1 (Phase 3)**: needs Phase 2.
- **US2 (Phase 4)**: needs Phase 2 and US1's `ProviderChoice` (T038) and composition root (T036).
- **US3 (Phase 5)**: needs Phase 2 and the adapter (T034). It does not need US1's UI or US2.
- **Polish (Phase 6)**: after the stories you intend to ship.

### Within Phase 2

T005 → T006 → T009 (with T008); T007 is independent; T010/T011 → T012 → T013; T014/T015 → T016
(needs T006, T012); T017/T018/T019 → T020 → T021 (needs T016); T022 before T018 runs; T023 last.

### Within US1

T024–T031 (tests, parallel) → T032 → T033 → T034 → T035 → T036 → T037 → T038 → T039 → T040.

## Parallel Example: User Story 1

```text
Together (different files, all tests):
  T024 fixtures · T025 contract · T026 request · T027 stream · T028 errors · T029 models · T030 CSP · T031 e2e
Then T032 (models + errors) can run alongside T037 (i18n).
```

## Implementation Strategy

### MVP first

1. Phase 1 and Phase 2. Checkpoint: everything is green, and the app is unchanged for learners.
2. Phase 3 (US1). Checkpoint: Gemini works from onboarding. Stop and validate (quickstart V1, V2).

### Incremental delivery

3. US2 (switching), then US3 (owner live tools), then Polish.

### Review batches (CLAUDE.md working agreement)

Suggested stopping points, each one a commit:

1. T001–T004
2. T005–T009
3. T010–T013
4. T014–T016
5. T017–T023
6. T024–T031 (failing tests)
7. T032–T036
8. T037–T040
9. T041–T046
10. T047–T050
11. T051–T054
