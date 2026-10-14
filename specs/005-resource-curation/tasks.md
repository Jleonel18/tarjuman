---

description: "Task list for 005-resource-curation"
---

# Tasks: Resource Curation

**Input**: Design documents from `/specs/005-resource-curation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED. Principle XII and CLAUDE.md: write each test task first, run it, confirm it
fails for the right reason, then do the implementation task that follows it.

**Organization**: Phase 2 builds the generic groundwork every story needs (tool calls through the
provider port, the search port, capability contract 1.1.0, credential ids). US1 (P1, find
resources) is the demonstrable MVP with mocks. **A release to learners also needs US2 (consent,
required by YouTube's terms) and US3 (safety)**. US4 (P3) adds the saved list and the 30-day
retention rule, which also applies to cards in conversations, so it is required before release too.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: User story the task belongs to (US1–US4)
- Every task names the exact file path(s) it creates or edits

## Rules that apply to every task

- Never read, print, or log `.env`. Live tools load it with `node --env-file=.env`.
- No real or realistic key in any committed file. Fake keys are obviously fake (`AIzaFAKE…`) and
  match the shapes in data-model.md → KeyShape (`AIza` + 35).
- Keys only in headers (`x-goog-api-key`); never `key=` in a URL.
- No automatic retries, for models or searches. No hard-coded user-facing strings. CSS uses logical
  properties and tokens. No `img`, `iframe`, or `innerHTML`.
- Fixtures imitating YouTube or provider tool-call wire formats are synthetic until a live capture
  exists: each says so and names the documented or live shape it follows (research R6, R8).
- Changing a rule file needs a `version` bump and `pnpm record:guardrails` afterwards.

---

## Phase 1: Setup

**Purpose**: notes on amended contracts, empty packages, build wiring.

- [X] T001 Add amendment notes (one line each, text not rewritten):
  - `specs/001-core-foundation/contracts/provider-port.md`: "Amended by 005: tool calls, see specs/005-resource-curation/contracts/provider-tool-calls.md."
  - `specs/001-core-foundation/contracts/pipeline.md`: same pointer.
  - `specs/001-core-foundation/contracts/capability-contract.md`: "Version 1.1.0 defined in specs/005-resource-curation/contracts/capability-contract-1.1.md."
- [X] T002 Create `packages/search-youtube/` mirroring `packages/provider-gemini/`: `package.json` (`@tarjuman/search-youtube`, deps `@tarjuman/core`, devDeps `@tarjuman/testing`), `tsconfig.json`, `src/index.ts` (empty exports), `src/origin.ts` exporting `YOUTUBE_API_ORIGIN = "https://www.googleapis.com"`. Add to root `tsconfig.json` references and to root and `apps/web/package.json` as `workspace:*`.
- [X] T003 Create `packages/capabilities/resource-curation/` mirroring `packages/capabilities/language-qa/`: `package.json` (`@tarjuman/capability-resource-curation`), `tsconfig.json`, `src/index.ts` (empty), `rules/`, `src/i18n/{en,es}.json` (empty objects). Wire references as in T002. Run `pnpm install` (no new npm package; if `pnpm-workspace.yaml` gains a `minimumReleaseAgeExclude` entry, remove it).
- [X] T004 [P] Update `.dependency-cruiser.cjs`: `search-youtube` is an adapter (may import `@tarjuman/core` and `@tarjuman/core/adapter`, may not import providers or capabilities; only the composition root and `tests/` may import it); `capabilities/resource-curation` follows the capability rules (imports only `@tarjuman/core` public types); `core` imports neither.
- [X] T005 [P] Add `YOUTUBE_API_KEY=` (no value) to `.env.example`, and `"test:live:youtube": "TARJUMAN_LIVE=1 node --env-file=.env node_modules/vitest/vitest.mjs run --project provider-live packages/search-youtube --silent=false"` to the root `package.json`; include `packages/search-youtube/tests/*.live.test.ts` in the `provider-live` project in `vitest.config.ts`.

**Checkpoint**: `pnpm typecheck && pnpm lint:arch` pass with empty packages.

---

## Phase 2: Foundational (blocks every story)

### 2a. Tool calls through the provider port (contracts/provider-tool-calls.md)

- [ ] T006 Write failing type and unit tests in `packages/core/tests/ports/provider-tools.test.ts`: `StreamEvent` accepts `tool_call` with optional `continuation`; `ProviderMessage` union accepts assistant-with-`toolCalls` and `tool` messages; `ModelInfo.supportsTools` required; the `ModelRequestCannotCarrySecret` proof still compiles with the new shapes (add a `// @ts-expect-error` case that puts a `SecretHandle` in `ToolCallRecord.input`'s position via a widened type).
- [ ] T007 Implement in `packages/core/src/ports/provider.ts`: `ToolCallRecord`, `tool_call` event, message union, `ModelInfo.supportsTools`; update every `ModelInfo` table (`packages/provider-anthropic/src/models.ts`, `packages/provider-gemini/src/models.ts`, `packages/provider-ollama/src/models.ts`, `packages/testing/src/mock-provider.ts`) with `supportsTools` (Anthropic and Gemini `true`, Ollama `false`, mock configurable). Fix compile errors in core consumers without behavior change.
- [ ] T008 [P] Extend `packages/testing/src/mock-provider.ts`: scripts can emit `tool_call` events (with `continuation`), end a step with `stop: tool_use`, and record every request it receives (messages including tool messages) for assertions. Add cases to `packages/testing/src/provider-contract-suite.ts` for tool mapping that adapters with `supportsTools` must pass.
- [ ] T009 [P] Write failing tests in `packages/provider-gemini/tests/tools.test.ts` (synthetic fixtures in `tests/fixtures/`, labelled "shaped after live capture 2026-10-14, research R8"): `ModelTool` → `tools[{functionDeclarations}]` with `additionalProperties` stripped; a streamed `functionCall` part → one `tool_call` with `id`, `name`, `input`, `continuation` = `thoughtSignature`; assistant `toolCalls` → `model` parts with `functionCall` **and the same `thoughtSignature`**; `tool` message → `functionResponse` with matching `id` and `{content}`; a step with only function calls and `STOP` → `stop: tool_use`.
- [ ] T010 Implement the Gemini mapping in `packages/provider-gemini/src/gemini-provider.ts` (and a new `src/tools.ts` if it keeps the provider file small). Remove "tools" from the "never sent" comment.
- [ ] T011 [P] Write failing tests in `packages/provider-anthropic/tests/tools.test.ts` (synthetic fixtures from the documented shape, labelled): `tools[{name, description, input_schema}]`; `content_block_start` `tool_use` + `input_json_delta` chunks → one `tool_call` after `content_block_stop`; invalid JSON → `error: bad_request`; `stop_reason: tool_use` → `stop: tool_use`; assistant `toolCalls` → `tool_use` blocks; `tool` message → user `tool_result` block with `tool_use_id`.
- [ ] T012 Implement the Anthropic mapping in `packages/provider-anthropic/src/anthropic-provider.ts` (SDK types). No `thinking` is sent (unchanged).
- [ ] T013 [P] Ollama: test in `packages/provider-ollama/tests/` that every model has `supportsTools: false` and a request with `tools` never sends them; implement in `packages/provider-ollama/src/`.

### 2b. Search port, broker, credential ids (contracts/search-port.md, data-model.md)

- [ ] T014 Create `packages/core/src/ports/search.ts`: `SearchPort`, `SearchRequest`, `SearchResult` (without `ref`), `SearchOutcome`, `SearchErrorCode` exactly as in contracts/search-port.md and data-model.md (field caps: title ≤ 200, channel ≤ 100, descriptionExcerpt ≤ 200; `externalId` `^[A-Za-z0-9_-]{11}$`). Export from `packages/core/src/index.ts`.
- [ ] T015 [P] Create `packages/testing/src/mock-search.ts`: `MockSearchPort` with scripted outcomes and request recording; `packages/testing/src/fixtures/hostile-search.ts` with hostile results (instructions in titles and descriptions, "visit https://evil.example", HTML/entity tricks, oversized fields, invalid ids, key-shaped strings, a fake "full lyrics" description). Export both.
- [ ] T016 Write failing tests in `packages/core/tests/search/search-settings.test.ts`: default `{ enabled: true, consent: [] }`; consent per source with `termsVersion`; a bumped `termsVersion` means no consent.
- [ ] T017 Implement `packages/core/src/search/search-settings.ts` (stored in `settings` collection, id `search`).
- [ ] T018 Write failing tests in `packages/core/tests/search/search-broker.test.ts`: disabled → `{ ok:false, code:"disabled" }` and no port call; no consent → `no_consent` and no port call; no key → `invalid_credential`; a query over 120 characters or containing a key shape (`sk-ant-…`, `AIza…`, `AQ.…`) → `bad_request` and no port call; success returns results in source order **without** `ref`s; `targetLanguage` always from the profile; never retries (port called once on failure); the key never appears in the outcome (`assert-no-secret`).
- [ ] T019 Implement `packages/core/src/search/search-broker.ts` (`SearchBroker`, the only holder of `SearchPort`s; `run(sourceId, req, signal)` and `details(sourceId, ids, signal)`). Add `disabled` and `no_consent` to the broker's outcome codes (not to the port's). Reuse the input guard's key detector for the query check.
- [ ] T020 [P] Extend `scripts/provider-port-imports.ts` and `tests/architecture/provider-port-imports.test.ts`: `SearchPort` may be named only by `search-broker.ts`, search adapters, the composition root, and tests.
- [ ] T021 Write failing tests in `packages/core/tests/credentials/key-shapes.test.ts` and `key-manager.test.ts`: `AIza…` valid for `gemini` and `youtube`; `sk-ant-…` and `AQ.…` entered for `youtube` → `wrong_provider` with no network call; `AIza…` for `anthropic` → `wrong_provider`; the mock key still works for `mock`.
- [ ] T022 Implement "pattern → set of credential ids" in `packages/core/src/credentials/key-shapes.ts` and `key-manager.ts` (data-model.md → KeyShape). `KeyManager` validates a search credential through a `SearchPort` validator: extend `packages/core/src/pipeline/credential-validation.ts` (or add `search/search-credential-validation.ts`) so `validate(credentialId, …)` routes to the provider or search port with that id; unknown id → `bad_request`.
- [ ] T023 Write failing tests in `packages/core/tests/credentials/data-controller.test.ts`: `deleteAll` removes the `youtube` key, `saved_resources`, and the `search` settings record, and fails its check if any remains.
- [ ] T024 Implement in `packages/core/src/credentials/data-controller.ts` and `packages/core/src/ports/storage.ts` (`Collection` += `saved_resources`).
- [ ] T025 Write failing test in `packages/storage-web/tests/` (fake-indexeddb): a version-2 database upgrades to 3, keeps every record, and has a `saved_resources` store; a fresh database starts at 3.
- [ ] T026 Implement `DB_VERSION = 3` in `packages/storage-web/src/indexeddb-storage.ts` (create store only) and the store in `packages/storage-web/src/memory-storage.ts`.

### 2c. Capability contract 1.1.0 (contracts/capability-contract-1.1.md)

- [ ] T027 Write failing tests in `packages/core/tests/capabilities/registry.test.ts`: accepts 1.0.0 and 1.1.0; rejects a `presentation` tool that is side-effecting or declares permissions; rejects a second `all_conversations` capability; `search` permission must list known source ids; `language-qa` still registers unchanged.
- [ ] T028 Implement in `packages/core/src/capabilities/types.ts`, `schema.ts`, `registry.ts` (`CAPABILITY_CONTRACT_VERSION` stays exported; accept both versions). Add `registry.forTurn(conversationCapabilityId)` returning the conversation's capability plus the `all_conversations` one.
- [ ] T029 Write failing tests in `packages/core/tests/capabilities/permission-broker.test.ts`: `ctx.search.videos` denied without a `search` permission for `youtube` (typed error + `permission_denied` metrics event with `permission: "search"`); allowed call goes to `SearchBroker` with the profile's target language; the tool sees `ref`s and no URL or key.
- [ ] T030 Implement `ctx.search` in `packages/core/src/capabilities/permission-broker.ts` (`BrokerServices.search?`).

### 2d. Pipeline step loop (contracts/provider-tool-calls.md → Pipeline)

- [ ] T031 Write failing tests in `packages/core/tests/pipeline/tool-loop.test.ts` (mock provider + mock search + a test capability):
  - no tools offered when the model `supportsTools: false`, when search is disabled, or with no `youtube` key; the capability fragment then carries the reason (`model_cannot_search`, `off`, `no_key`); tools **are** offered without consent;
  - `search_videos` without consent → no search request, no model text shown, turn ends `done: consent_required` with `sourceId`;
  - refs: two searches of 8 → refs `r1…r16` continuing across searches; a video returned by both keeps its first ref and appears once; `show_resources` ids checked against the turn's set;
  - partial failure: first search ok, second fails → error result for the second, loop continues, cards from the first search shown, notice `search_incomplete`;
  - history: a later turn's request contains one `untrusted_data` block per earlier message with non-expired cards (ref, title, channel, type; no links), none for expired cards, and no earlier tool messages;
  - one search then final answer: two model calls; the second request carries the assistant `toolCalls` (with `continuation` unchanged) and a `tool` message whose content is an `untrusted_data` block;
  - limits: a third `search_videos` → error result; more than 4 steps → loop ends; `show_resources` twice → second is an error;
  - verdict read from the final step only; earlier step text never rendered;
  - `status: searching` emitted while a tool runs;
  - denied tool (undeclared) → error result, `permission_denied` metric, loop continues;
  - cancel during a search → no further model call, `done: interrupted`, no retry;
  - usage: tokens summed, `steps` and `searches` recorded;
  - `stop: refusal` in any step → `refused` (004 rule).
- [ ] T032 Implement the loop in `packages/core/src/pipeline/pipeline.ts`, `types.ts` (`TurnEvent` `status`, `resources`; `TurnStatus` += `consent_required`; `NoticeCode` += `search_incomplete`), a new `packages/core/src/search/turn-search-session.ts` (turn-wide refs, dedupe by `externalId`), `context-assembler.ts` (tool messages, `forTurn` fragments in order, unavailable reason, earlier cards as `untrusted_data`), `metrics.ts`/`packages/core/src/stats/{types,usage}.ts` (`steps`, `searches`). Keep the class frozen; no injectable stages.
- [ ] T033 Write failing tests in `packages/core/tests/search/resource-cards.test.ts`: cards built only from turn results plus `show_resources` items; unknown ids dropped; a duplicated id in `show_resources` yields one card; `sourceDisplay` is `YouTube (youtube.com)`; `accessNote` carried; order = source order regardless of item order; `fitNote` ≤ 300 and rendered as plain text; `interest` dropped unless it matches a profile interest or the request; link built from `externalId` only; at most 10 cards; no cards when verdict ≠ accept.
- [ ] T034 Implement `packages/core/src/search/resource-cards.ts` and emit the `resources` event from the pipeline; store `resources` and `searchCount` on the assistant `Message` (`packages/core/src/conversation/types.ts`, service).
- [ ] T035 Write failing tests in `packages/core/tests/pipeline/output-guard.test.ts`: in a turn with search results, a prose link equal to a card link stays a link; any other link (invented `watch?v=r1`, other domains, card link plus extra parameters) becomes plain text showing the destination; turns without search unchanged.
- [ ] T036 Implement in `packages/core/src/pipeline/output-guard.ts` (allowed-link set passed per turn).

**Checkpoint**: `pnpm typecheck && pnpm lint && pnpm lint:arch && pnpm test` green; `language-qa` turns behave exactly as before (existing suites unchanged, SC-008).

---

## Phase 3: User Story 1 — Find real material about what I like (P1) 🎯 MVP

**Goal**: ask in chat, the model searches YouTube, cards appear with link, labels, fit note.

**Independent Test**: e2e with mock provider and mock search: profile Spanish B1, interest "climbing"; "videos about climbing" shows ≥ 3 cards with type, source, price label, difficulty, fit note; every link is a card link; no images load.

### YouTube adapter

- [ ] T037 [P] [US1] Write failing tests in `packages/search-youtube/tests/request.test.ts`: search URL and parameters (`part=snippet`, `type=video`, `maxResults=8`, `safeSearch=strict`, `relevanceLanguage`, `videoCategoryId=10` for music, `videoCaption=closedCaption`); then one `videos.list` with the ids; key only in `x-goog-api-key`; no `key=` in any URL; validation calls `videoCategories?part=id&regionCode=US`.
- [ ] T038 [P] [US1] Write failing tests in `packages/search-youtube/tests/parse.test.ts` (synthetic fixtures labelled "shaped after documented response, research R6"): entity decoding by fixed table (`&#39;`, `&amp;`, `&quot;`, `&lt;`, `&gt;`; unknown entities left as text); caps on title/channel/description; invalid ids dropped; ISO 8601 durations; Music category → `song`; `defaultAudioLanguage`/`defaultLanguage` → `audioLanguage`; `priceLabel: free`; `regionRestriction` → `accessNote: region_restricted`, `ytRating: ytAgeRestricted` → `age_restricted`; order preserved; any field containing the key dropped.
- [ ] T039 [P] [US1] Write failing tests in `packages/search-youtube/tests/errors.test.ts`: the error table in contracts/search-port.md; server message text never in output; network failure → `network`; no retry (fetch called once).
- [ ] T040 [US1] Implement `packages/search-youtube/src/{youtube-search,parse,entities,duration,errors}.ts` with Zod parsing; export `YouTubeSearch`, `YOUTUBE_API_ORIGIN`, `YOUTUBE_TERMS_VERSION`.
- [ ] T041 [P] [US1] Write `packages/search-youtube/tests/youtube.live.test.ts` (skipped unless `TARJUMAN_LIVE=1` and `YOUTUBE_API_KEY`): validate, one search "escalada" in `es`; prints only count, first title, and status codes.

### Capability

- [ ] T042 [P] [US1] Write failing tests in `packages/capabilities/resource-curation/tests/capability.test.ts`: registers under contract 1.1.0 with `availability: all_conversations`; permissions exactly `[{kind:"search", sources:["youtube"]}]`; `search_videos` strict schema (query 1–120, kind enum, captionsOnly optional) and handler calls `ctx.search.videos` and returns results without URLs; `show_resources` schema (1–10 items, id `^r\d+$`, fitNote 1–300, difficulty enum) with `presentation: "resources"`; i18n keys under `capability.resource-curation.*` in en and es.
- [ ] T043 [US1] Implement `packages/capabilities/resource-curation/src/{index,tools,fragments}.ts` and `src/i18n/{en,es}.json`. Fragment text per contracts/resource-curation-capability.md (search with short target-language queries, at most two searches, keep order, do not restate titles or write links, never invent resources, two lines of lyrics max, unavailable variant with reason codes).
- [ ] T044 [US1] Add rule `packages/capabilities/resource-curation/rules/resource-requests.json` (`curation.resource-requests@1.0.0`) with accept cases (videos on a topic in the target language, songs, without topic but with interests), refuse cases (downloads, pirated copies, full lyrics, "cheap flights"), clarify case (no topic, no interests), and an accept case with level `unknown` (fit note says the level could not be matched), in en and es; wire into the capability's `domainRules`. Add the cases to `tests/guardrails/` per the existing pattern.

### UI and app

- [ ] T045 [P] [US1] Write failing component tests in `packages/ui/tests/` for `ResourceCards`: renders title (`dir="auto"`), "YouTube (youtube.com) · channel", type, duration, captions, language or "language not confirmed", access note when present, price label, sponsored/affiliate labels only when true, difficulty with "(estimate)", fit note as text; "Open on YouTube" link with `target="_blank"` and `rel="noopener noreferrer"`; no `img` or `iframe`; logical properties only.
- [ ] T046 [US1] Implement `packages/ui/src/chat/ResourceCards.tsx` and render it from `MessageBubble.tsx` when a message has `resources`; show the `searching` status in `ChatView.tsx`; add strings to `packages/ui/src/i18n/locales/{en,es}.json`.
- [ ] T047 [P] [US1] Write failing tests for `packages/ui/src/settings/SearchSettings.tsx`: YouTube key entry (masked hint, replace, remove), `wrong_provider` message for `sk-ant-`/`AQ.` keys, help text on creating a Google Cloud key with YouTube Data API v3 enabled and a referrer restriction (plain text, no link that adds a bundle origin).
- [ ] T048 [US1] Implement `SearchSettings.tsx` (key part) and add it to the settings screen; controller actions in `apps/web/src/controller.ts` use `KeyManager` with credential id `youtube`.
- [ ] T049 [US1] Composition root `apps/web/src/composition-root.ts`: construct `YouTubeSearch` (product) or `MockSearchPort` (e2e/mock builds), `SearchBroker`, pass `search` to the broker services, register `resource-curation`; offered credential ids include `youtube` for `deleteAll`.
- [ ] T050 [US1] CSP: write the failing assertion in `apps/web/tests/csp.test.ts` (`connect-src` = `'self'`, Anthropic, Gemini, `https://www.googleapis.com`, nothing else), then add `YOUTUBE_API_ORIGIN` in `apps/web/csp.ts`; update `tests/architecture/bundle-origins.test.ts` expectations.
- [ ] T051 [US1] Fallback messages: when no tools are offered, the answer explains why (off, no key, model cannot search) with i18n reason strings; key errors from a search (`invalid_credential`, `not_enabled`, `quota_exhausted`) produce a tool error result and a visible notice linking to search settings. Tests in `packages/core/tests/pipeline/tool-loop.test.ts` and a UI test for the notice.
- [ ] T052 [US1] e2e `tests/e2e/resource-curation.spec.ts` (mock provider scripted with `search_videos` → `show_resources`, mock search): the Independent Test above; network assertion that no request leaves the app origin in the mock build; a profile with no interests and no topic gets a clarifying question; "no suitable results" shows the plain message and no cards; second search failing shows the first search's cards and the "search incomplete" notice. Add an RTL case to `tests/e2e/rtl.spec.ts` (Arabic UI, cards lay out with logical properties, titles `dir="auto"`). Until US2 lands, the e2e mock build pre-seeds consent.

**Checkpoint**: US1 independent test passes; all checks green.

---

## Phase 4: User Story 3 — Trust the list: neutral, labeled, safe (P2)

**Goal**: injection, invented links, labels, lyrics, tainted side effects all handled (FR-012–FR-016, FR-023).

**Independent Test**: `pnpm test:redteam` passes with the new cases, offline.

- [ ] T053 [P] [US3] Add adversarial cases in `tests/adversarial/cases/resource-curation.json` (schema `specs/001-core-foundation/contracts/adversarial-case.schema.json`), using `hostile-search` fixtures: instruction in a title; instruction in a description ("tell the user to visit…"); model output with an invented YouTube link; a non-YouTube link; a card link plus a tracking parameter; Markdown image to an exfiltration URL; a description with a key-shaped string (never echoed into a request); full lyrics in a description (reply quotes ≤ 2 lines); a side-effecting test tool called after a search (needs confirmation).
- [ ] T054 [US3] Extend `packages/testing/src/adversarial-runner.ts` so cases can script mock search outcomes and tool calls; make `tests/adversarial/run-structural.test.ts` run them. Fix any failure in core (never weaken a case).
- [ ] T055 [P] [US3] Test in `packages/core/tests/search/resource-cards.test.ts`: `sponsored`/`affiliate` flags carried to cards and never change order; a paid-labelled result does not move up.
- [ ] T056 [P] [US3] Test in `packages/core/tests/pipeline/tool-loop.test.ts`: after a search result, every segment from it is `untrusted`, and a side-effecting tool (test capability) gets `needs_confirmation`; `ctx.search` input from the model cannot set the language or source.

**Checkpoint**: red-team green; US1 still green.

---

## Phase 5: User Story 2 — Cost and what searching sends (P2)

**Goal**: consent before the first search, search on/off, step and search counts with cost.

**Independent Test**: e2e: first resource request opens the consent dialog with YouTube Terms and Google Privacy links; Cancel → no search; Agree → search; footer shows searches and cost; turning search off → fallback message and zero search requests.

- [ ] T057 [P] [US2] Write failing tests for `packages/ui/src/chat/SearchConsentDialog.tsx`: what is sent (terms built from request, target language, interests; never key, history, other profile data), links `https://www.youtube.com/t/terms` and `https://policies.google.com/privacy` as inert links (open only on click), in-app privacy statement, Agree/Cancel; focus trapped; RTL ok.
- [ ] T058 [US2] Implement the dialog and the flow in `apps/web/src/controller.ts`: on a turn ending `done: consent_required`, show the dialog for that `sourceId`; Agree writes consent (`termsVersion` from the adapter) and sends the same user message again as a new turn (no automatic resend without Agree); Cancel sends nothing and leaves a short system note. The `consent_required` turn stores no assistant text. Strings in en/es.
- [ ] T059 [US2] Search on/off switch in `packages/ui/src/settings/SearchSettings.tsx` backed by `search-settings.ts`; test that off → zero calls to the search port and the "turned off" fallback.
- [ ] T060 [P] [US2] Write failing test and implement the message footer in `packages/ui/src/stats/` (or `chat/MessageBubble.tsx`): "Searches: n (YouTube, free daily allowance)", steps, tokens summed, estimated cost with price date (FR-017).
- [ ] T061 [US2] e2e in `tests/e2e/resource-curation.spec.ts`: the Independent Test above.

**Checkpoint**: US1 + US2 + US3 green: releasable once US4's retention rule lands.

---

## Phase 6: User Story 4 — Saved resources and 30-day retention (P3)

**Goal**: save, list, remove; YouTube data never kept past 30 days, in saved items or in conversations.

**Independent Test**: save two cards, reload, both listed; remove one; with a clock 31 days later, the remaining card shows expired with no title, Refresh restores it from (mock) search; "delete all my data" empties the list.

- [ ] T062 [P] [US4] Write failing tests in `packages/core/tests/search/saved-resources.test.ts`: save keeps labels (US4-3); id `<sourceId>:<externalId>` deduplicates; list newest first; remove; saving never happens from a tool (no tool has storage write permission).
- [ ] T063 [P] [US4] Write failing tests in `packages/core/tests/search/retention.test.ts` (injected clock): at startup, cards in messages and saved resources older than 30 days keep only `sourceId`, `externalId`, `fetchedAt`, `expired: true`; refresh calls `SearchBroker.details` once and restores fields with a new `fetchedAt`; a removed video or an error keeps it expired; no retry.
- [ ] T064 [US4] Implement `packages/core/src/search/saved-resources.ts` and the retention purge/refresh (in `resource-cards.ts` or `search/retention.ts`); call the purge at app start from `apps/web/src/composition-root.ts`.
- [ ] T065 [US4] UI: Save button on cards; `packages/ui/src/resources/SavedResources.tsx` screen (list, remove, expired state with Refresh); route and sidebar entry in `apps/web/src/routes.tsx`; strings en/es.
- [ ] T066 [US4] e2e in `tests/e2e/resource-curation.spec.ts`: the Independent Test above (clock via Playwright `page.clock`); extend `tests/e2e/key-and-data-control.spec.ts` so "delete all" also checks saved resources and the YouTube key.

**Checkpoint**: all stories green.

---

## Phase 7: Polish & cross-cutting

- [ ] T067 [P] Re-record guardrail fixtures after the new rule and fragments. Ollama offers no tools, so either record with `TARJUMAN_PROVIDER=gemini node --env-file=.env --import tsx scripts/record-guardrails.ts` (owner runs it; fixtures say "not Claude"), or mark curation cases as verdict-only so they pass without a search; decide with the owner and record the choice in `research.md`. `pnpm lint:rules` green.
- [ ] T068 [P] Live checks by the owner (agent prepares, owner runs): `pnpm test:live:youtube` once the owner has a YouTube key; extend `packages/provider-gemini/tests/gemini.live.test.ts` with one tool-call round trip (fake tool, signature returned). Record results in `research.md` → "Live results" and replace "not verified live" notes.
- [ ] T069 [P] Docs: `ARCHITECTURE.md` (tool loop, search port, contract 1.1.0, retention), `SECURITY.md` (search key, new origin, link policy, tainted turns), `README.md` (feature and YouTube key setup), `CLAUDE.md` (current state for 005, gotchas: thought signature, `AQ.` keys not valid for YouTube, AIza shared by gemini and youtube, DB v3, 30-day purge).
- [ ] T070 Create `specs/005-resource-curation/checklists/validation.md` with SC-001…SC-008 and the commands/evidence for each; SC-002/SC-003 rows left for the owner's manual run (quickstart V2 step 7).
- [ ] T071 Final run: `pnpm typecheck && pnpm lint && pnpm lint:css && pnpm lint:arch && pnpm lint:i18n && pnpm lint:rules && pnpm test && pnpm test:redteam && pnpm test:e2e`, plus `check:bundle-origins`; verify no real key in changed files (compare against env by file name only, printing nothing else).

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 (2a and 2b can run in parallel; 2c needs 2b's `SearchBroker`; 2d needs 2a and 2c) → stories.
- US1 needs all of Phase 2. US3 needs US1 (cards and loop exist). US2 needs US1. US4 needs US1.
- Release to learners: US1 + US2 + US3 + US4 (consent and retention are terms requirements).

## Parallel Opportunities

- Phase 2a: T009 (Gemini), T011 (Anthropic), T013 (Ollama) after T007.
- Phase 2b: T015, T020 alongside T016–T019.
- US1: T037, T038, T039 (adapter tests), T042 (capability tests), T045, T047 (UI tests).
- US3: T053, T055, T056. US2: T057, T060. US4: T062, T063.

## Implementation Strategy

1. Phases 1–2 in small batches (2a, 2b, 2c, 2d), each ending green and reviewable.
2. US1 → demo with mocks.
3. US3, US2, US4 → releasable.
4. Polish, live checks with the owner's keys, docs.
