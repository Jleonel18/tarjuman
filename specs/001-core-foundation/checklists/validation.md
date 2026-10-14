# Validation: Core Foundation

**Task**: T152. Runs [quickstart.md](../quickstart.md) and records the results.
**Date**: 2026-10-13
**Commit base**: `daaf41e` plus the uncommitted Phase 11 work (T148-T151)
**Environment**: macOS (Darwin 25.6), Node 22, Playwright Chromium, Firefox, and WebKit

## Summary

| Section | Result |
|---------|--------|
| §2 Automated gates | **Pass**, all of them |
| §3 Live-model suites | **Not run.** No Anthropic test key exists, and no Ollama server was running for this pass |
| §4 Manual scenarios | **Pass by automated end-to-end tests** for 12 of 13 scenarios; scenario 13 is covered by integration tests. A human click-through is still open |
| §5 Network and storage assertions | **Pass** |

The feature is **not "done"** by the quickstart's own definition yet: that needs §3 to meet the
SC-003 and SC-004 thresholds on a nightly run against Claude, which needs a test key.

## §2 Automated gates

| Command | Result |
|---------|--------|
| `pnpm typecheck` | pass |
| `pnpm lint` | pass |
| `pnpm lint:css` | pass |
| `pnpm lint:arch` | pass: no dependency violations (222 modules), no `ProviderPort` import outside the allowed paths (199 files) |
| `pnpm lint:i18n` | pass: 2 catalog groups, en/es parity |
| `pnpm lint:rules` | pass: rule versions match `main`, and the recorded fixtures match the rules and prompts |
| `pnpm test` | pass: 69 files, 943 tests (including the two mock-exclusion build tests added by T153) |
| `pnpm test:redteam` | pass: **57 cases** (342 runs: every tone, with and without a pasted key), **0 key disclosures**, **0 remote-resource elements**, 171/171 pasted keys warned and withheld |
| `pnpm --filter @tarjuman/web build` + `pnpm check:bundle-origins` | pass: origins in the bundle are `self` and `https://api.anthropic.com` only |
| `pnpm audit --prod` | pass: no known vulnerabilities |
| `pnpm test:e2e` | pass: 120 tests across Chromium, Firefox, and WebKit |

SC-004 (0 key disclosures, 0 exfiltration-capable elements) and SC-009 (at least 50 adversarial
cases) are met by the structural layer.

## §3 Live-model suites

| Command | Result |
|---------|--------|
| `pnpm test:live:guardrails` | not run |
| `pnpm test:live:redteam` | not run |

Neither suite ran. With Anthropic they need `TARJUMAN_TEST_KEY`, which the project does not have.
With the default Ollama provider they need a local server, which was not running. The nightly
workflow (`.github/workflows/nightly-live.yml`, T148) runs both against Claude once the
`TARJUMAN_TEST_KEY` secret is set; until then it skips with a notice.

The committed guardrail fixtures were recorded with a local non-Claude model. They verify the
mechanics, not SC-003. **SC-003 remains unverified.**

## §4 Manual end-to-end scenarios

Each scenario was run as an automated Playwright test against the production build and the mock
provider, in three browsers. The mock stands in for the "valid key"; no real Anthropic key was
used anywhere.

| # | Scenario | Evidence | Result |
|---|----------|----------|--------|
| 1 | Onboarding, session-only key, first answer in under 3 min | `onboarding-first-answer.spec.ts`; `latency-and-onboarding.spec.ts` (SC-001: 1.3-1.5 s) | pass |
| 2 | Invalid key: plain-language error, nothing stored | `onboarding-first-answer.spec.ts` | pass |
| 3 | "Write me an HTML app" refused courteously, under each tone | `out-of-domain.spec.ts` (en and es); every tone in `tests/guardrails/tone-matrix.test.ts` | pass |
| 4 | "How do I say 'web page' in Japanese?" answered | `out-of-domain.spec.ts` | pass |
| 5 | Pasted lyric with an injected instruction is treated as material | `security.spec.ts` | pass |
| 6 | Hostile Markdown: no image, inert link with its destination, HTML as text | `security.spec.ts` (`HOSTILE-RENDER-TEST`) | pass |
| 7 | Key-shaped string in chat is warned about and not sent | `security.spec.ts` | pass |
| 8 | Stats match provider usage, cost labeled as an estimate, 80% warning | `stats-panel.spec.ts` | pass |
| 9 | Pseudo-RTL interface, Arabic target, mixed-direction text | `rtl.spec.ts` | pass |
| 10 | Interface, explanation, and target language change independently | `apps/web/tests/controller.test.ts` (language settings), `spanish-ui.spec.ts`, `rtl.spec.ts` | pass |
| 11 | Replace key, delete key, delete all data (SC-007) | `key-and-data-control.spec.ts` | pass |
| 12 | Dummy capability with zero core changes; undeclared permission denied (SC-008) | `tests/architecture/dummy-capability.test.ts`, `permission-broker.test.ts`, `bypass.test.ts` | pass |
| 13 | Network drops mid-stream: partial text kept, marked incomplete, retry offered, no auto-retry | `packages/core/tests/pipeline/pipeline.integration.test.ts`, `apps/web/tests/controller.test.ts`; no end-to-end test, because the mock provider runs inside the page and has no network to cut | pass (integration) |

**Open**: nobody has clicked through these scenarios by hand yet. The owner should do that once,
with `VITE_PROVIDER=mock pnpm --filter @tarjuman/web dev` (key `sk-ant-mock-valid-key-0000`), and
record the outcome here.

## §5 Network and storage assertions

| Assertion | Evidence | Result |
|-----------|----------|--------|
| Every request goes to the app origin or the provider origin (FR-039); no telemetry (FR-040) | `network-assertions.spec.ts` (every flow, the RTL locale, and no beacon, analytics global, or service worker); `security.spec.ts` | pass |
| After delete-all, `indexedDB.databases()` is empty and no caches remain | `key-and-data-control.spec.ts` | pass |
| Raw IndexedDB contents hold no plaintext key (FR-013) | `security.spec.ts`; `packages/storage-web/tests/credential-store.test.ts` | pass |

## Success criteria

| Criterion | Status |
|-----------|--------|
| SC-001 onboarding to first answer < 3 min | met against the mock (1.3-1.5 s, scripted) |
| SC-002 first words < 2 s at p95 | met against the mock with 250 ms per streamed event: p95 510-535 ms, of which about 500 ms is the simulated network |
| SC-003 guardrail rates | **not verified** (needs Claude) |
| SC-004 0 disclosures, 0 exfiltration elements, every tone | met (structural layer, every tone) |
| SC-005 token counts match the provider | met against the mock (`stats-panel.spec.ts`) |
| SC-006 0 untranslated strings in en/es; screens pass RTL review | met by automation (`lint:i18n`, `spanish-ui.spec.ts`, `rtl.spec.ts`); a human RTL layout review is still open |
| SC-007 nothing left after delete-all | met |
| SC-008 capability with 0 core changes | met |
| SC-009 at least 50 adversarial cases | met (57) |
