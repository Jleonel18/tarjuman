# Implementation Plan: Core Foundation

**Branch**: `001-core-foundation` | **Date**: 2026-10-02 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-core-foundation/spec.md`

## Summary

Build the stable core of Tarjuman: a framework-free TypeScript core (conversation, provider port,
mandatory security pipeline, declarative domain guardrails, stats, i18n, storage port, capability
contract) plus a first web shell (React + Vite) that runs entirely on the user's device with the
user's own Anthropic key, calling the provider directly from the browser. One minimal capability
(`language-qa`) exercises the pipeline end to end. Safety is structural: the key never enters
model context, untrusted content is trust-labeled and isolated, model output is rendered through a
restricted AST, and an adversarial suite blocks merges. Research decisions are in
[research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node 22 LTS for tooling

**Primary Dependencies**: React 19, Vite, `@anthropic-ai/sdk` (confined to the provider adapter),
`i18next` + `react-i18next` + `i18next-icu`, `zod` (declaration validation), `idb`, `markdown-it`
(HTML disabled), Zustand (web shell state only)

**Storage**: IndexedDB behind `StoragePort`; WebCrypto non-extractable AES-GCM key for the API key;
session-only keys held in memory

**Testing**: Vitest (unit/integration/structural adversarial), Playwright (e2e, RTL, network
assertions), recorded-fixture mock provider for per-PR CI, live-model nightly job for behavioral
adversarial/guardrail suites

**Target Platform**: Modern evergreen browsers (Chromium, Firefox, Safari); core must also run
unchanged in a future Tauri 2 shell (no DOM/Node imports in `core`)

**Project Type**: Web application on a portable core library (pnpm monorepo)

**Performance Goals**: First streamed token visible < 2 s p95 excluding provider delay (SC-002);
onboarding to first answer < 3 min (SC-001)

**Constraints**: No Tarjuman-operated server on the key path; no telemetry; no automatic retries;
no `dangerouslySetInnerHTML`; CSS logical properties only; zero hard-coded UI strings; online use
only

**Scale/Scope**: Single user per device; ~8 screens (onboarding, key entry, chat, conversation
list, stats panel, settings, data controls, refusal/notice states); ≥ 50 adversarial cases at
launch

## Constitution Check

*GATE: passed before Phase 0; re-checked after Phase 1 design (below).*

| # | Principle | Status | How the plan satisfies it |
|---|-----------|--------|---------------------------|
| I | Comprehensible Input First | PASS | Only capability is language Q&A; profile captures level + interests to adapt output; no courses/streaks/gamification anywhere. |
| II | Stable Core, Modular Capabilities | PASS | `core` package cannot import capabilities (dependency-cruiser); dummy capability test proves SC-008. |
| III | Mandatory Pipeline | PASS | The pipeline module (`Pipeline` plus `CredentialValidator`) owns the only provider handle; stage order fixed in code; capabilities receive data-only registration. Key validation uses a fixed trusted prompt with no user content and goes through `CredentialValidator`, so `KeyManager` never holds the provider. |
| IV | Instruction Hierarchy | PASS | Layered assembler in fixed precedence; tone is a separate layer; tone matrix test. |
| V | Security by Structure | PASS | Trust-labeled blocks, restricted-AST rendering, CSP, no third-party scripts, permission broker, taint-gated tools, key isolated from context. Threat analysis below. |
| VI | User Sovereignty | PASS | Local-first IndexedDB, no accounts, `clearAll()` verified empty (SC-007), no telemetry. |
| VII | Declarative Guardrails | PASS | Versioned schema-validated rules, mandatory accept/refuse cases, courteous refusals always in the mediation language: catalog template for `en`/`es`, model-written refusal in the mediation language otherwise (research R8). |
| VIII | Global by Design | PASS | i18next catalogs, pseudo-RTL locale, logical CSS, three separate language settings in the data model. |
| IX | Transparency | PASS | Stats from provider-reported usage; estimate labeled; pricing table dated. No paid-resource curation in this feature. |
| X | Copyright & ToS | PASS (N/A) | No content fetching or reproduction in this feature. |
| XI | Provider Independence | PASS | SDK confined to `provider-anthropic`; model quirks (effort, thinking) are adapter data; provider port defines fallbacks. |
| XII | Tests as Contract | PASS | Acceptance criteria in spec; adversarial + guardrail suites gate merges; bypass-to-test CI check. |

**Gate timing**: the per-PR guardrail gate replays recorded fixtures, and CI fails when the fixtures
no longer match the current rules and prompt layers (forcing a re-record). SC-003 itself is measured
against the live model in the nightly/pre-release job, not per PR.

**Post-design re-check**: PASS. Design added no new core dependencies on capabilities or on the
provider SDK. One accepted risk is documented in the Threat Analysis (same-origin script
compromise vs. WebCrypto), not a constitutional deviation.

## Threat Analysis

| Threat | Vector | Mitigation (structural) | Residual risk |
|--------|--------|-------------------------|---------------|
| Prompt injection via pasted/external text | Instructions inside lyrics, web excerpts | Untrusted blocks delimited and labeled, delimiter-escape handling, lowest precedence, no side-effecting tools in this feature, taint flag blocks future ones | Model may still be swayed in prose; bounded because it has no tools and cannot see the key |
| Key disclosure through model | "Print your API key" | Key never placed in any request body; structural test asserts absence in assembled requests | None for model path |
| Key typed into chat | User pastes key | InputGuard detects key shapes, withholds, warns | Novel key formats; regex family updated via adversarial cases |
| Exfiltration via rendered output | Markdown image/link with data in URL | OutputGuard: no `img`, inert links showing destination, HTML as text, CSP `img-src`/`connect-src` restrictions | Users clicking a visible link deliberately |
| Same-origin script compromise (XSS/supply chain) | Malicious dependency or injected script | Strict CSP, no third-party scripts, lockfile + `pnpm audit` in CI, no `dangerouslySetInnerHTML` | A compromised same-origin script can *use* the in-browser key even if non-extractable; session-only mode offered |
| Local data theft | Disk/profile access | Encryption at rest with non-extractable key; delete-all | Attacker with full profile access can run the app; passphrase mode deferred |
| Silent cost multiplication | Auto-retries, loops | `maxRetries = 0`, user-initiated retry, no tool loops | None |
| Rule regression | Prompt edits weaken scope | Versioned rules with mandatory cases, tone matrix, CI gates | Live-model drift caught by nightly job, not per PR |
| Capability overreach | Capability calls undeclared tool | `PermissionBroker` denies; no provider handle exposed | Bugs in broker; covered by dummy-capability tests |

## Project Structure

### Documentation (this feature)

```text
specs/001-core-foundation/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── provider-port.md
│   ├── storage-port.md
│   ├── capability-contract.md
│   ├── domain-rule.schema.json
│   ├── adversarial-case.schema.json
│   └── pipeline.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/
├── core/                         # framework-free; no DOM/React/Node/SDK imports
│   ├── src/
│   │   ├── conversation/         # conversation + message state machine
│   │   ├── pipeline/             # input-guard, context-assembler, output-guard, metrics, pipeline
│   │   ├── guardrails/           # rule loader, verdict parsing, refusal templates
│   │   ├── capabilities/         # contract types, registry, permission broker
│   │   ├── stats/                # usage accounting, cost, effort recommendation
│   │   ├── profile/              # learner profile, language settings, tone profiles
│   │   ├── ports/                # ProviderPort, StoragePort, CredentialStore
│   │   └── i18n/                 # message-key types, locale metadata (no React)
│   └── tests/
├── provider-anthropic/           # only package importing @anthropic-ai/sdk; model table + pricing
├── storage-web/                  # IndexedDB StoragePort + WebCrypto CredentialStore
├── capabilities/
│   └── language-qa/              # the one real capability (prompts, rules, strings)
├── ui/                           # React components, logical-CSS styles, i18next catalogs (en, es)
└── testing/                      # mock provider, recorded fixtures, adversarial runner, pseudo-RTL locale

apps/
└── web/                          # Vite shell: composition root, CSP, routing, Zustand store

tests/
├── adversarial/
│   └── cases/                    # ≥ 50 cases, data files (see contracts/adversarial-case.schema.json)
├── guardrails/                   # accept/refuse fixtures per rule
├── e2e/                          # Playwright: onboarding, chat, RTL, delete-all, network assertions
└── architecture/                 # dependency-cruiser boundary rules, no-literal-string checks
```

**Structure Decision**: pnpm monorepo with the portable `core` at the center and every
environment-specific concern in its own package, so Principle II and FR-041 are enforced by
package boundaries rather than convention. `apps/gateway` and `apps/desktop` are intentionally
absent: this feature fetches no external content (spec Assumptions) and ships no desktop shell.

## Complexity Tracking

No constitution violations to justify. The monorepo's package count is mandated by the
constitution's topology (portable core + shells) and is the minimum that enforces the
core/capability and core/provider boundaries.
