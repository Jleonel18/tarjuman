# Validation: Gemini Provider

**Feature**: [spec.md](../spec.md) | **Quickstart**: [quickstart.md](../quickstart.md) | **Date**: 2026-10-14

Results of quickstart V1 (automated) and V5 (live), run by the agent on branch
`004-gemini-provider`. V2–V4 are manual and left for the owner.

## Automated run (quickstart V1)

| Check | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm lint`, `lint:css`, `lint:arch`, `lint:i18n`, `lint:rules` | pass |
| `pnpm test` | 82 files, 1193 tests, pass |
| `pnpm test:redteam` | 63 cases (378 runs), pass |
| `pnpm test:e2e` | 258 tests (Chromium, Firefox, WebKit), pass |
| `pnpm check:bundle-origins` on the production build | pass: self, Anthropic, Gemini only |

## Success criteria

| SC | How it is shown | Status |
|---|---|---|
| SC-001: fresh profile to a streamed Gemini answer in under 3 minutes | Manual, quickstart V2, with a real key | **Open: owner** |
| SC-002: provider contract suite passes for Gemini | `packages/provider-gemini/tests/provider.contract.test.ts` | Pass |
| SC-003: red-team suite and guardrail fixtures pass, no case weakened | `pnpm test:redteam`, `pnpm test`; existing cases unchanged, 6 cases added | Pass |
| SC-004: no key to another origin, no key in a URL | `request.test.ts` (header only, no `key=`), `key-manager.test.ts` + controller tests (wrong-provider key refused with zero requests), CSP and bundle-origin checks | Pass |
| SC-005: no Gemini key in logs, errors, fixtures, reports, or stored conversations | `errors.test.ts`, `stream.test.ts` (redaction), red-team `AQ.`/`AIza` cases, input-guard tests | Pass |
| SC-006: existing profiles keep working with Anthropic | IndexedDB v1 → v2 upgrade test (`storage.test.ts`), `readStoredProfile` tests, controller "profile saved before 004" test | Pass (automated); quickstart V4 manual variant open |
| SC-007: "Delete all my data" leaves no key for any provider | `data-controller.test.ts`, `credential-store.test.ts`, controller and e2e "delete all removes both keys" | Pass |
| SC-008: live smoke run streams an answer; Gemini recordings carry provenance | `pnpm test:live:gemini` on 2026-10-14 (research.md → Live results); provenance schema and selector tests | Pass for the smoke run; no fixtures were re-recorded with Gemini (owner's choice, quickstart V5) |

## Deviations from tasks.md, for review

- **T031 / T042 (e2e)**: the wrong-provider message is not covered end to end, because mock
  providers have no key shape. It is covered by `key-manager.test.ts` and the controller tests,
  which use mock providers named `anthropic` and `gemini`.
- **T036**: the e2e build offers the second mock provider only with `?mockProviders=2`, so the other
  specs (one provider, no choice) run unchanged.
- **T037 / R17**: the AI Studio address is plain text, not a link (research.md → Deviation from R17).
- **T043**: `settings.provider.switch` became `settings.provider.switch_hint` (an explanation, not a
  button label): the switch is the radio group itself.
- **T008**: the structural red-team runner gained a check: a key written into a case must be warned
  about and must not reach the request. Without it the new cases would have tested nothing.
- **Not in tasks**: `README.md` no longer says the key goes only to Anthropic.
