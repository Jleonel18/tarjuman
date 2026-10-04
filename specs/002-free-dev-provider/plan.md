# Implementation Plan: Free Dev Provider

**Branch**: `002-free-dev-provider` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-free-dev-provider/spec.md`

## Summary

Add `@tarjuman/provider-ollama`, a development-only `ProviderPort` adapter that talks to a local
Ollama runtime through its OpenAI-compatible streaming endpoint using native `fetch` (no SDK, no
new dependency). It is wired into the existing composition root behind a dev-only branch that Vite
removes from production builds, goes through the unchanged pipeline, ignores credentials, and
reports non-secret diagnostics for the developer. A small selector in `tests/support/` lets the
001 fixture recorder (T079) and live runner (T080) run against Ollama by default, with every output
carrying provenance that says the model is not Claude. No change to `packages/core` or `packages/ui`.

## Technical Context

**Language/Version**: TypeScript (strict), Node 22/24 for tools, evergreen browsers for the app

**Primary Dependencies**: none new. Native `fetch` and `ReadableStream`; Zod (already used) for the
provenance schema; existing Vitest, Playwright, dependency-cruiser

**Storage**: N/A (no new persisted data; the placeholder key uses the existing credential store)

**Testing**: Vitest (contract suite with stubbed `fetch`, build-exclusion test, provenance schema),
opt-in live smoke test against local Ollama

**Target Platform**: development builds of `apps/web` and Node test tools; never production

**Project Type**: pnpm monorepo, new adapter package

**Performance Goals**: none beyond streaming text as it arrives; local generation speed depends on
the developer's hardware

**Constraints**: zero production footprint (SC-005); no retries; no credential transmitted; no
change to `ProviderPort`, core, or UI

**Scale/Scope**: one package (~4 source files), one composition-root branch, one test-support
module, dependency-cruiser rules, one guide, edits to two 001 task descriptions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Comprehensible Input First | No learner-facing feature, no engagement mechanics. Dev tooling only. | Pass |
| II. Stable Core, Modular Capabilities | Core untouched; adapter depends on core types only; enforced by dependency-cruiser. | Pass |
| III. Mandatory Pipeline | Adapter is only reachable as the pipeline's `ProviderPort`; no second path (FR-002). | Pass |
| IV. Instruction Hierarchy | Layers are joined in precedence order into one system message; adapter adds no layer (FR-017). | Pass |
| V. Security by Structure | No credential sent; output goes through the same output guard; diagnostics are a fixed non-secret enum; production CSP unchanged. Threat analysis in spec. | Pass |
| VI. User Sovereignty | Requests go to `localhost` only; data does not leave the device. The user's Anthropic key is never sent to the runtime (FR-008). | Pass |
| VII. Declarative Guardrails | Rules unchanged; non-Claude results cannot count as SC-003 evidence (FR-010/011). | Pass |
| VIII. Global by Design | No new user-facing strings (the plan reuses existing error messages); no CSS. | Pass |
| IX. Transparency | Tokens shown as reported; cost shown as zero, which is accurate for local calls. | Pass |
| X. Copyright | N/A. | Pass |
| XI. Provider Independence | A second adapter behind the existing port is exactly what the principle enables. | Pass |
| XII. Tests as Contract | Shared contract suite, build-exclusion test, provenance schema tests, written before the code. | Pass |
| Constraint: "First provider: Anthropic" | Ollama is not a product provider; it is absent from production builds. | Pass |
| Workflow: no unrequested packages | `packages/provider-ollama` is the feature itself (spec FR-001); no npm dependency added. | Pass |

Post-design re-check (after Phase 1): unchanged, all pass. The two spec amendments below reduce
scope (no core or UI change) rather than add it.

## Spec Amendments (made during planning, need owner approval)

1. **FR-007** (credential): changed from "MUST NOT request or display a key" to "MUST NOT require a
   real key or send any credential; the developer enters a documented placeholder (`ollama`) in the
   existing key screen". Reason: onboarding and `KeyManager` require a non-empty key; skipping that
   for one dev-only provider would change core and UI.
2. **FR-013 / SC-006 / US1-2 / US3-2** (diagnostics): the app shows the existing error message for
   the matching category; the specific cause goes to the developer console (dev builds) and to tool
   output. Reason: a per-provider UI message needs a new `ProviderErrorCode`, which FR-001 forbids,
   and browsers report "not running" and "CORS blocked" as the same failure.

Also recorded as a known gap (research R5): Ollama truncates over-long prompts silently, so the spec
edge case "fail rather than silently truncate" is only mitigated (explicit context setting), not met.

## Project Structure

### Documentation (this feature)

```text
specs/002-free-dev-provider/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── ollama-provider.md
│   └── fixture-provenance.md
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
packages/provider-ollama/               # NEW: @tarjuman/provider-ollama (dev-only adapter)
├── package.json                        # deps: @tarjuman/core; devDeps: @tarjuman/testing
├── tsconfig.json
├── src/
│   ├── index.ts                        # exports OllamaProvider, OLLAMA_MODELS, DEFAULT_OLLAMA_MODEL_ID, types
│   ├── ollama-provider.ts              # ProviderPort implementation (stream, validateCredential)
│   ├── sse.ts                          # minimal OpenAI-style SSE line parser
│   ├── errors.ts                       # status/exception → ProviderErrorCode + OllamaDiagnostic
│   └── models.ts                       # static model table (research R5, R6)
└── tests/
    ├── provider.contract.test.ts       # shared contract suite with stubbed fetch
    ├── sse.test.ts                     # chunk splitting, [DONE], usage chunk, malformed lines
    ├── errors.test.ts                  # mapping table + diagnostics carry no secret/content
    ├── ollama.live.test.ts             # opt-in (TARJUMAN_LIVE=1), skips when Ollama unreachable
    └── fixtures/                       # SSE fixtures (synthetic → captured, labeled)

packages/testing/src/
└── provenance.ts                       # NEW: FixtureProvenance Zod schema + label helper

apps/web/
├── src/composition-root.ts             # EDIT: dev-only `VITE_PROVIDER=ollama` branch + console diagnostics
└── tests/prod-excludes-dev-provider.test.ts  # NEW: SC-005 production-bundle check

tests/support/
└── live-provider.ts                    # NEW: TARJUMAN_PROVIDER selector for T079/T080

.dependency-cruiser.cjs                 # EDIT: rules from research R11
vitest.config.ts                        # EDIT: exclude `*.live.test.ts` from `unit`; add `provider-live` project
package.json                            # EDIT: `test:live:ollama` (TARJUMAN_LIVE=1 vitest run --project provider-live)
docs/local-model.md                     # NEW: setup guide (FR-012)
specs/001-core-foundation/tasks.md      # EDIT: wording of T079, T080 (research R9)
CLAUDE.md                               # EDIT: "Current state" mentions the dev provider
```

**Structure Decision**: mirror `packages/provider-anthropic` so the two adapters are comparable; keep
everything that constructs a concrete provider in the composition root or `tests/`, as the existing
dependency rules require.

## Complexity Tracking

No constitution violations. Nothing to justify.
