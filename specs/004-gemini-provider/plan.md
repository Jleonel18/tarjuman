# Implementation Plan: Gemini Provider

**Branch**: `004-gemini-provider` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-gemini-provider/spec.md`

## Summary

Add `@tarjuman/provider-gemini`, a product `ProviderPort` adapter that calls Google's Gemini API
directly from the browser with native `fetch` and server-sent events. The key goes only in the
`x-goog-api-key` header. CORS, both key families (`AIza…`, `AQ.…`), the stream shape, and usage
fields were confirmed live on 2026-10-14 (research R1–R4).

To let learners choose between Anthropic and Gemini at run time, the core changes in four places,
and `ProviderPort` stays as it is:

1. The pipeline holds a fixed set of providers and uses the one named by `profile.providerId`.
2. The credential store keeps one key per provider, with an IndexedDB upgrade that keeps existing
   Anthropic keys.
3. `KeyManager` rejects a key shaped for the other provider before any network call.
4. A provider-side `refusal` stop now always ends the turn as `refused`.

The UI adds a provider choice to onboarding and settings, per-provider key help, and the free-tier
disclosure. The owner gets `pnpm test:live:gemini` and a `gemini` option for the guardrail tools.

## Technical Context

**Language/Version**: TypeScript (strict), Node 22/24 for tools, evergreen browsers for the app

**Primary Dependencies**: none new. Native `fetch`/`ReadableStream`, existing Zod, React, i18next,
Vitest, Playwright, dependency-cruiser

**Storage**: IndexedDB `DB_VERSION` 1 → 2 (credential records keyed by provider id); profile gains
`providerId`; usage records gain optional `providerId` (data-model.md)

**Testing**: Vitest (adapter contract suite with stubbed `fetch`, core unit tests, storage upgrade
test with `fake-indexeddb`, red-team cases), Playwright e2e with two mock providers, opt-in live test
against Gemini

**Target Platform**: web app (production and dev builds); Node tools for the owner

**Project Type**: pnpm monorepo; one new adapter package plus edits in core, storage-web, ui, testing,
apps/web

**Performance Goals**: stream text as it arrives; validation is one `GET` with no generation

**Constraints**: no retries; the key never leaves the header; CSP grows by exactly one origin;
`ProviderPort` unchanged; no SDK

**Scale/Scope**: about 6 new source files in the adapter, about 12 edited files elsewhere, 2 new
i18n groups (en/es)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Comprehensible Input First | No engagement mechanics; a provider choice only. | Pass |
| II. Stable Core, Modular Capabilities | The core changes, but still imports no adapter, SDK, DOM, or Node API. Provider ids stay plain strings in the core; key shapes are plain data. | Pass |
| III. Mandatory Pipeline | Gemini is reachable only as an entry in the pipeline's provider set and the validator's set. There is no other path (FR-012). | Pass |
| IV. Instruction Hierarchy | Layers map to `systemInstruction` parts in precedence order; the adapter adds no text. | Pass |
| V. Security by Structure | The key is in the header only and is redacted from the stream. A wrong-provider key is never sent. Error text is never read. CSP adds exactly one origin. Gemini keys in chat are detected. The threat analysis is in the spec. | Pass |
| VI. User Sovereignty | Each key goes only to its own provider (FR-007). "Delete all" removes every provider's key and checks it. The free-tier data use is disclosed. | Pass |
| VII. Declarative Guardrails | Rules unchanged. Gemini fixtures carry provenance and never count for 001 SC-003. | Pass |
| VIII. Global by Design | New strings in en/es catalogs; logical properties; existing tokens. | Pass |
| IX. Transparency | Usage as reported, regrouped to the core's meaning (R4); costs are labelled estimates with a price date. | Pass |
| X. Copyright | `RECITATION` blocks become refusals. | Pass |
| XI. Provider Independence | A second product adapter behind the unchanged port. No capability sees which provider is active. | Pass |
| XII. Tests as Contract | Contract suite, error and finish tables, red-team cases, and the upgrade test come before code. | Pass |
| Constraint: "First provider: Anthropic" | Anthropic stays first and stays the default for existing profiles. Gemini is the second. | Pass |
| Constraint: gateway holds no keys | No gateway is used: the browser calls Gemini directly (R1). | Pass |
| Workflow: no unrequested packages | The new workspace package is the feature itself (FR-001). No npm dependency added. | Pass |

Post-design re-check (after Phase 1): all pass. The one core behavior change (R5, `stop: refusal`
→ `refused`) tightens an existing rule and applies to every provider.

## Spec Amendments (made during planning, need owner approval)

1. **US1-5 / FR-013, safety blocks**: a Gemini safety block is shown as a **refusal** (the refusal
   template, message status `refused`), not as an error category. Text already shown is kept.
   Reason: the error categories mean "try again", and a blocked request would be blocked again
   (research R5).
2. **FR-013, quota**: Gemini's `429` does not say whether a rate or a daily quota ran out, so it maps
   to `rate_limited` only; `quota_exhausted` is not produced for Gemini (research R6).
3. **Edge case "Gemini key while Anthropic is selected"**: refined to "rejected locally before any
   request, with a message naming the provider the key belongs to". Keys of unknown shape are still
   validated against the selected provider (research R10, R12).
4. **`001-core-foundation` FR-003** ("one provider (Anthropic)"): gets a note that feature 004 adds
   Gemini as a second product provider. The text is not rewritten.

## Follow-ups outside this feature

- **Prices**: `gemini-4-argon` prices double on 2026-12-01 and `gemini-3.8-flash` prices on
  2027-01-01 (research R8). The model table must be updated before those dates.
- Low-severity items from `specs/001-core-foundation/security-review.md` stay open; this feature
  does not touch them.

## Project Structure

### Documentation (this feature)

```text
specs/004-gemini-provider/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── gemini-provider.md
│   └── multi-provider-core.md
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/provider-gemini/                    # NEW: @tarjuman/provider-gemini
├── package.json                             # deps: @tarjuman/core; devDeps: @tarjuman/testing
├── tsconfig.json
├── src/
│   ├── index.ts                             # GeminiProvider, GEMINI_MODELS, DEFAULT_GEMINI_MODEL_ID, GEMINI_API_ORIGIN
│   ├── origin.ts
│   ├── gemini-provider.ts                   # ProviderPort: listModels, validateCredential, stream
│   ├── sse.ts                               # data: line reader
│   ├── errors.ts                            # status + allow-listed enums → ProviderErrorCode (R6)
│   └── models.ts                            # model table (R8)
└── tests/
    ├── provider.contract.test.ts
    ├── request.test.ts                      # URL, header, body, forbidden fields, no key= anywhere
    ├── stream.test.ts                       # SSE, usage mapping, finish table, thought parts skipped
    ├── errors.test.ts                       # error table, no secret or server text in output
    ├── models.test.ts
    ├── gemini.live.test.ts                  # opt-in (TARJUMAN_LIVE=1 + GEMINI_API_KEY)
    └── fixtures/                            # synthetic, shaped after the live capture (labelled)

packages/core/src/
├── adapter.ts                               # EDIT: also export SecretStreamFilter (R13)
├── credentials/secret-stream-filter.ts      # NEW: moved from provider-anthropic/src/scrub.ts
├── credentials/key-shapes.ts                # NEW: KeyShape table, shape lookup, masking (R12)
├── credentials/key-manager.ts               # EDIT: per-provider methods, wrong_provider
├── credentials/data-controller.ts           # EDIT: removeAll + check every provider
├── ports/storage.ts                         # EDIT: CredentialStore per provider
├── pipeline/pipeline.ts                     # EDIT: provider set, per-provider key, refusal stop → refused
├── pipeline/credential-validation.ts        # EDIT: validate(providerId, …)
├── pipeline/input-guard.ts                  # EDIT: use KeyShape patterns
├── profile/types.ts, profile/validation.ts  # EDIT: providerId, model belongs to provider
└── stats/types.ts, stats/usage.ts           # EDIT: optional providerId

packages/provider-anthropic/src/
├── scrub.ts                                 # EDIT: keep scrubSecret; import SecretStreamFilter from core/adapter
└── anthropic-provider.ts                    # EDIT: import path only

packages/storage-web/src/
├── indexeddb-storage.ts                     # EDIT: DB_VERSION 2, records by providerId, upgrade from "current"
├── credential-store.ts                      # EDIT: per-provider API
└── session-secrets.ts                       # EDIT: map by providerId

packages/testing/src/
├── mock-provider.ts                         # EDIT: optional id and model table
└── provider-contract-suite.ts               # EDIT only if a case assumes Anthropic

packages/ui/src/
├── key/ProviderChoice.tsx                   # NEW: radio group, shown when >1 provider
├── key/KeyEntry.tsx, key/KeyHint.tsx        # EDIT: per-provider help, link, disclosure, wrong_provider message
├── onboarding/Onboarding.tsx                # EDIT: provider choice before the key
├── settings/ProviderSettings.tsx            # NEW: switch provider, shows which keys are stored
├── settings/KeySettings.tsx                 # EDIT: acts on the active provider's key
└── i18n/locales/en.json, es.json            # EDIT: provider.*, key.gemini.*, key.wrong_provider

apps/web/
├── csp.ts                                   # EDIT: PROVIDER_ORIGINS + GEMINI_API_ORIGIN (R14)
├── tests/csp.test.ts                        # EDIT
├── src/composition-root.ts                  # EDIT: provider set per build mode (R15)
├── src/controller.ts                        # EDIT: provider choice, per-provider key actions
└── src/routes.tsx                           # EDIT: models of the active provider

tests/
├── adversarial/…                            # NEW cases: AIza / AQ. keys in chat (R12)
├── support/live-provider.ts                 # EDIT: TARJUMAN_PROVIDER=gemini (R16)
├── architecture/…                           # EDIT if a test lists provider packages
└── e2e/provider-choice.spec.ts              # NEW: onboarding choice, switch, delete all

.dependency-cruiser.cjs                      # EDIT: add provider-gemini to adapter rules, independence, may-unseal
vitest.config.ts                             # EDIT: gemini live test in provider-live project
package.json                                 # EDIT: test:live:gemini
.env.example                                 # EDIT: GEMINI_API_KEY= (no value)
docs/, ARCHITECTURE.md, SECURITY.md          # EDIT: providers section, key handling per provider
CLAUDE.md                                    # EDIT: current state, gotchas (AQ. keys, DB v2)
specs/001-core-foundation/spec.md            # EDIT: note on FR-003 (amendment 4)
```

**Structure Decision**: mirror `packages/provider-ollama` (`fetch` + SSE, no SDK) for the adapter,
and keep the rule that only the composition root and `tests/` construct concrete providers.
Multi-provider support goes in the pipeline module and the credential store, the two places that
already own "which provider" and "which key".

## Complexity Tracking

No constitution violations. Nothing to justify.
