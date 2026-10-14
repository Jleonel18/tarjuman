# Validation: Resource Curation

**Task**: T070 / T071. Runs [quickstart.md](../quickstart.md) and records the results.
**Date**: 2026-10-14
**Base**: `4b07fbb` plus the uncommitted work of T006–T071 (nothing committed by the agent)
**Environment**: macOS (Darwin 25.6), Node 22, Playwright Chromium, Firefox, and WebKit

## Summary

| Section | Result |
|---------|--------|
| V1 Automated checks | **Pass**, all of them (below) |
| V2 Learner flow with real keys | **Not run.** The owner has no YouTube key yet; SC-001 to SC-003 are open |
| V3 Fallbacks | **Pass by automated tests** (search off, no key, model without tools) |
| V4 Live smoke test | **Not run.** `pnpm test:live:youtube` needs `YOUTUBE_API_KEY`; it skips without it |

## V1 Automated checks

| Command | Result |
|---------|--------|
| `pnpm typecheck` | pass |
| `pnpm lint` | pass |
| `pnpm lint:css` | pass |
| `pnpm lint:arch` | pass (also checks `SearchPort` imports) |
| `pnpm lint:i18n` | pass |
| `pnpm lint:rules` | pass. The curation rule is version-checked; **its guardrail fixtures are not recorded** (T067) |
| `pnpm test` | pass, 101 files, 1,564 tests |
| `pnpm test:redteam` | pass: 73 cases, 438 runs, 0 key disclosures, 0 remote-resource elements, 60 curation runs, 0 foreign links |
| `pnpm test:e2e` | pass, 303 tests (Chromium, Firefox, WebKit); 13 per browser are in `resource-curation.spec.ts`, plus one in `rtl.spec.ts` and one in `key-and-data-control.spec.ts` |
| `pnpm --filter @tarjuman/web build` then `pnpm check:bundle-origins` | pass; the real production bundle holds no mock search or mock provider |
| Key scan | no real-looking key in tracked files; `.env` and `pnpm-workspace.yaml` untouched |

## Success criteria

| ID | Criterion | Status | Evidence / command |
|----|-----------|--------|--------------------|
| SC-001 | Results in under 30 s in 9 of 10 attempts | **Open** | Needs the owner's keys: V2 step 3, ten attempts. The mock path takes about a second |
| SC-002 | ≥ 90% of 20 links open the described video; 100% come from a search in that turn | **Open (second half proven)** | Manual part: V2 step 7. Automated: cards are built only from the turn's results (`resource-cards.test.ts`, `tool-loop.test.ts`), and a forged id adds no card (red team) |
| SC-003 | ≥ 80% in the target language and on topic | **Open** | V2 step 7. The model's `relevanceLanguage` hint and the language label are in place; the result is unmeasured |
| SC-004 | Adversarial suite: no instruction followed, no invented or non-allowlisted link, no auto-loaded resource, no lyrics excerpt over two lines | **Partly proven** | Structural: `pnpm test:redteam` (10 curation cases; mutating the link restriction makes them fail). Behavioral (a real model following no injected instruction, quoting ≤ 2 lines of lyrics): **not run**, case `adv-resource-curation-011` is behavioral-only |
| SC-005 | No search request holds the key, history, or other profile fields | **Pass** | `search-broker.test.ts` (request is exactly query, language, kind, captions, count); red team checks the search key and model key in every request and search request |
| SC-006 | Sponsored/affiliate results labelled; none ranked higher | **Pass** | `resource-cards.test.ts` (labels carried, order unchanged), `resource-cards` UI test (labels shown only when true). The YouTube API returns no ads, so both are always false in practice |
| SC-007 | Every resource answer shows the searches and an estimated cost; search off makes zero searches | **Pass** | `stats.test.ts`, e2e "usage panel counts the searches and the model calls"; `tool-loop.test.ts` and e2e for search off (tools not offered) |
| SC-008 | Shipped features pass their existing suites unchanged | **Pass, after editing six old test files** | Edited because the contract they fixed changed on purpose: `request.test.ts` (Gemini sends `tools` only when asked), `models.test.ts` (Gemini, `supportsTools`), `bypass.test.ts` (registry gained `forTurn`), `key-shapes.test.ts` (shapes map to sets of ids), and `data-controller.test.ts` / `storage.test.ts` (credential ids, DB version 3). `language-qa` is registered unchanged and its tests did not change |

## Not done

- **T067** guardrail fixtures for the curation rule: needs the owner's decision (research R14).
- **Live runs**: YouTube adapter, Gemini tool round trip, Anthropic tool mapping (docs only).
- **Human click-through** of V2 and V3.
