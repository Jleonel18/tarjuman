# Implementation Plan: Resource Curation

**Branch**: `005-resource-curation` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-resource-curation/spec.md`

## Summary

Learners ask in the chat for material in their target language; the model searches YouTube through a
tool, picks the results that fit, and the app shows them as cards built from YouTube's own data, with
a link, labels, and a short note on why each one fits. The learner can save cards on the device.

Three pieces of groundwork come first, because the app has never let a model call a tool:

1. **Tool calls through the provider port** (core amendment): a `tool_call` stream event with opaque
   `continuation` data (Gemini's thought signature, required, research R8), tool messages, and a
   bounded step loop in the pipeline that uses the existing permission broker, taint gate, and
   tool-call guard. Gemini and Anthropic adapters map it; Ollama gets no tools.
2. **A search port** next to the provider port, with a YouTube adapter (native `fetch`, key in a
   header, free daily allowance) and a `SearchBroker` that alone holds it. The YouTube key is stored
   like an AI key, under the credential id `youtube`.
3. **Capability contract 1.1.0**: a `search` permission, a brokered `ctx.search`, presentation tools,
   and capabilities available in every conversation. All optional, so `language-qa` is unchanged.

Then the `resource-curation` capability, its UI (cards, consent, settings, saved list), and the
30-day retention rule from YouTube's terms.

## Technical Context

**Language/Version**: TypeScript (strict), Node 22/24 for tools, evergreen browsers for the app

**Primary Dependencies**: none new. Native `fetch`, existing Zod, React, i18next, Vitest,
Playwright, dependency-cruiser

**Storage**: IndexedDB, no version change for credentials (record key reinterpreted as credential
id); new collection `saved_resources` (needs a `DB_VERSION` 2 → 3 upgrade that only creates the
store); `settings` gains a `search` record; messages gain optional `resources` and `searchCount`;
usage gains optional `steps` and `searches` (data-model.md)

**Testing**: Vitest (adapter tool-call mapping, YouTube adapter with stubbed `fetch`, pipeline loop,
registry 1.1.0, broker, storage, retention), red-team with a hostile mock search, Playwright e2e with
mock provider and mock search, opt-in live tests (YouTube search; Gemini tool call)

**Target Platform**: web app (production and dev builds); Node tools for the owner

**Project Type**: pnpm monorepo; two new packages (`search-youtube`, `capabilities/resource-curation`)
plus edits in core, both product adapters, storage-web, ui, testing, apps/web

**Performance Goals**: a resource answer in under 30 s in 9 of 10 attempts (SC-001); searching
status shown within one second of the tool call

**Constraints**: no retries; ≤ 4 model steps, ≤ 2 searches, ≤ 1 `show_resources` per turn; keys
only in headers; CSP grows by exactly one origin; no remote images, no embedded players; YouTube
order kept; YouTube data kept ≤ 30 days

**Scale/Scope**: about 15 new source files, about 25 edited files, 3 new i18n groups (en/es)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Comprehensible Input First | Recommends target-language input matched to interests and level; no courses, levels, streaks. Saved list is a bookmark, not progress tracking. | Pass |
| II. Stable Core, Modular Capabilities | Curation is a capability module. The core changes (tool path, search port, contract 1.1.0) are generic and stated as amendments. **Process**: the constitution wants the contract amended "first through its own specification"; see Spec Amendments 1. | Pass, conditional on owner approval |
| III. Mandatory Pipeline | Every step of the loop goes through the pipeline; search runs only through the broker inside a turn (or a learner's explicit refresh click, which makes no model call). | Pass |
| IV. Instruction Hierarchy | Results enter as `tool` messages inside `untrusted_data` blocks with zero authority; the fragment sits in the capability layer. | Pass |
| V. Security by Structure | Results untrusted and labeled; egress allowlist (CSP + `search` permission); taint gate active; cards from search data only; prose links checked; no auto-loaded images; YouTube key never in model context; threat analysis in spec; red-team cases. | Pass |
| VI. User Sovereignty | Search key stays on device, goes only to Google's API host; consent before first search; search can be turned off; "delete all" removes key, saved list, settings. | Pass |
| VII. Declarative Guardrails | New versioned rule `curation.resource-requests@1.0.0` with accept/refuse/clarify cases; guardrail fixtures re-recorded. | Pass |
| VIII. Global by Design | en/es catalogs; logical properties; `dir="auto"` titles. | Pass |
| IX. Transparency | Steps and searches counted; cost summed over steps; labels for price, sponsored, affiliate; no commercial ranking (source order kept). | Pass |
| X. Copyright & ToS | Links only; no downloads; no page fetching; YouTube terms followed (R7); lyrics limited to two lines. | Pass (see Complexity Tracking for one interpretation) |
| XI. Provider Independence | Search sits behind `SearchPort`; tool calls are a provider-neutral port feature with per-adapter mapping; models without tools get the defined fallback. | Pass |
| XII. Tests as Contract | Contract tests, loop tests, red-team cases, and e2e come before code in each story. | Pass |
| Constraint: gateway holds no keys | No gateway: the browser calls YouTube directly (R6). | Pass |
| Workflow: no unrequested packages | Two workspace packages, both named by the spec (FR-001, FR-009); no npm dependency. | Pass |

Post-design re-check: all pass, with Spec Amendment 1 pending owner approval.

## Spec Amendments (need owner approval)

1. **Core and contract amendments inside this feature** (Principle II, 001 capability contract
   "amending requires its own specification"): `ProviderPort` tool calls
   ([contracts/provider-tool-calls.md](contracts/provider-tool-calls.md)), `SearchPort`
   ([contracts/search-port.md](contracts/search-port.md)), and capability contract 1.1.0
   ([contracts/capability-contract-1.1.md](contracts/capability-contract-1.1.md)) are specified here,
   in their own contract files, and built in a foundational phase before any capability code. If the
   owner prefers, they can move to a separate feature that lands first; the design does not change.
2. **FR-010 changed to option B** (done in spec.md, owner decision 2026-10-14). Anthropic web search
   and other sources are out of scope.
3. **FR-006**: for YouTube, the source order is kept (YouTube terms); added to spec.md.
4. **FR-021 / US4-4**: 30-day retention for YouTube data, with refresh on demand; added to spec.md.
5. **Ollama** (dev only) gets no tools in this feature, so resource requests there show the
   fallback. Guardrail recording with Ollama still works for non-search cases.

## Follow-ups outside this feature

- Anthropic web search as a second search adapter (needs only an adapter once this port exists).
- Music catalogs and podcasts (each needs a terms check: lyrics, previews, keys).
- Embedded players (would add a frame origin to the CSP).
- Gemini prices (004 follow-up) still due 2026-12-01 and 2027-01-01.

## Project Structure

### Documentation (this feature)

```text
specs/005-resource-curation/
├── spec.md
├── plan.md                                   # This file
├── research.md                               # Phase 0 (R1–R12)
├── data-model.md                             # Phase 1
├── quickstart.md                             # Phase 1
├── contracts/
│   ├── provider-tool-calls.md
│   ├── search-port.md
│   ├── capability-contract-1.1.md
│   └── resource-curation-capability.md
├── checklists/requirements.md
└── tasks.md                                  # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/core/src/
├── ports/provider.ts                         # EDIT: tool_call event, ToolCallRecord, message union, ModelInfo.supportsTools, secret proof
├── ports/search.ts                           # NEW: SearchPort, SearchRequest, SearchResult, SearchOutcome
├── ports/storage.ts                          # EDIT: Collection += saved_resources
├── search/search-broker.ts                   # NEW: only holder of SearchPort; enabled + consent + key load
├── search/search-settings.ts                 # NEW: SearchSettings read/write, termsVersion check
├── search/resource-cards.ts                  # NEW: build cards from results + show_resources; 30-day expiry
├── search/saved-resources.ts                 # NEW: save, list, remove, refresh
├── capabilities/types.ts                     # EDIT: contract 1.1.0 additions
├── capabilities/registry.ts, schema.ts       # EDIT: validate 1.1.0, availability, presentation tools
├── capabilities/permission-broker.ts         # EDIT: search permission, ctx.search
├── pipeline/pipeline.ts                      # EDIT: tools offered, step loop, limits, status, resources event
├── pipeline/types.ts                         # EDIT: TurnEvent status/resources
├── pipeline/output-guard.ts                  # EDIT: prose links vs card links
├── pipeline/context-assembler.ts             # EDIT: tool messages, all_conversations fragments, unavailable reason
├── credentials/key-shapes.ts, key-manager.ts # EDIT: shape → set of credential ids
├── credentials/data-controller.ts            # EDIT: delete saved resources + search settings; check youtube key
├── conversation/types.ts                     # EDIT: Message.resources, searchCount
└── stats/types.ts, usage.ts                  # EDIT: steps, searches

packages/provider-anthropic/src/              # EDIT: tools, tool_use stream, tool_result messages, supportsTools
packages/provider-gemini/src/                 # EDIT: functionDeclarations, functionCall + thoughtSignature, functionResponse
packages/provider-ollama/src/                 # EDIT: supportsTools: false

packages/search-youtube/                      # NEW: @tarjuman/search-youtube
├── src/{index,origin,youtube-search,errors,parse,entities,duration}.ts
└── tests/{contract,request,errors,parse,live}.test.ts + fixtures/ (synthetic, labelled)

packages/capabilities/resource-curation/      # NEW: @tarjuman/capability-resource-curation
├── src/{index,tools,fragments,rules}.ts, src/i18n/{en,es}.json
└── tests/

packages/storage-web/src/indexeddb-storage.ts # EDIT: DB_VERSION 3, saved_resources store
packages/testing/src/                         # EDIT: mock provider tool calls; NEW mock-search.ts, hostile fixtures

packages/ui/src/
├── chat/ResourceCards.tsx                    # NEW
├── chat/SearchConsentDialog.tsx              # NEW
├── chat/…                                    # EDIT: searching status, footer counts
├── settings/SearchSettings.tsx               # NEW: on/off, YouTube key
├── resources/SavedResources.tsx              # NEW
└── i18n/locales/en.json, es.json             # EDIT

apps/web/
├── csp.ts, tests/csp.test.ts                 # EDIT: + https://www.googleapis.com
├── src/composition-root.ts                   # EDIT: search ports per build, register capability
├── src/controller.ts, routes.tsx, store/     # EDIT: consent, settings, saved list, refresh

tests/
├── adversarial/…                             # NEW: FR-023 cases with hostile mock search
├── guardrails/…                              # EDIT: curation rule cases; re-record
├── architecture/…                            # EDIT: SearchPort holders, may-unseal list
└── e2e/resource-curation.spec.ts             # NEW

.dependency-cruiser.cjs, scripts/provider-port-imports.ts  # EDIT: new package rules, SearchPort name check
package.json                                  # EDIT: test:live:youtube
.env.example                                  # EDIT: YOUTUBE_API_KEY=
ARCHITECTURE.md, SECURITY.md, CLAUDE.md, README.md          # EDIT
specs/001-core-foundation/contracts/capability-contract.md, provider-port.md  # EDIT: note pointing to the 005 amendments
```

**Structure Decision**: the search port mirrors the provider port (port in core, adapter package,
mock in testing, only the composition root constructs adapters). The tool loop lives in the
pipeline module because it already owns stage order and the provider handle.

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| Core port and contract amendments in a capability feature | The capability cannot work without a tool path and a brokered search | A separate prior spec is possible (Amendment 1) but adds a review cycle with no design difference |
| `continuation` field on tool calls | Gemini rejects a follow-up without the thought signature (live, R8) | Dropping it breaks every Gemini tool call |
| Omitting YouTube results from the shown list | Showing only fitting results is the feature | Showing all results unfiltered loses fit; our reading of the terms (R7) allows selection without modification; recorded as a residual risk (R12) |
| `DB_VERSION` 3 | A new object store needs an upgrade | Storing saved resources in `settings` would mix concerns and break the per-record 30-day purge |
