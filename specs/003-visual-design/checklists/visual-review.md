# Visual Review: Visual Design

**Task**: T047. Records the automated gates of [quickstart.md](../quickstart.md) §2 and holds the
manual review of §3 (SC-010).
**Date**: 2026-10-14
**Commit base**: `b4b3eda` (US1-US4) plus the uncommitted Phase 7 work (T043-T047)
**Environment**: macOS (Darwin 25.6), Node 22, Playwright Chromium, Firefox, and WebKit

## Summary

| Section | Result |
|---------|--------|
| §2 Automated gates | **Pass**, all of them |
| §3 Manual visual review | **Open.** The 12 rows below are for the owner to run and record |
| SC-008 (no behavioral test change) | **Holds.** One existing e2e file changed selectors only; see below |

The feature is **not "done"** by the quickstart's own definition until every row of §3 is recorded
as passing.

## §2 Automated gates

| Command | Result |
|---------|--------|
| `pnpm typecheck` | pass |
| `pnpm lint` | pass |
| `pnpm lint:css` | pass, including the raw-color rules: no color outside `tokens.css` (SC-001) |
| `pnpm lint:arch` | pass: no dependency violations (246 modules), no `ProviderPort` import outside the allowed paths (219 files) |
| `pnpm lint:i18n` | pass: 2 catalog groups, en/es parity, with the 7 new keys |
| `pnpm lint:rules` | pass: rule versions match `main`, and the recorded fixtures match the rules and prompts |
| `pnpm test` | pass: 75 files, 1003 tests. Includes the token contrast pairs (SC-002), theme store, `theme-init.js`, delete-all of `tarjuman.*`, the inline-color scan, and the font budget and `theme-init.js` build tests (FR-014a, T044) |
| `pnpm test:redteam` | pass: 20 tests, structural layer unchanged (SC-008) |
| `pnpm --filter @tarjuman/web build && pnpm check:bundle-origins` | pass: 6 files; origins `self` and `https://api.anthropic.com` only. `licenses.txt` is not scanned (plain text, never fetched), so no inert host was added (T043, SC-004) |
| `pnpm test:e2e` | pass: 240 tests across Chromium, Firefox, and WebKit, including `theme`, `layout`, `accessibility`, `fonts`, and the unchanged `network-assertions.spec.ts` |

### Success criteria covered automatically

| Criterion | Check | Result |
|-----------|-------|--------|
| SC-001 tokens only | Stylelint color rules; `tests/architecture/no-inline-colors.test.ts` | pass |
| SC-002 contrast | `packages/ui/tests/tokens.test.ts`; axe `color-contrast` on every screen and state in both themes (`accessibility.spec.ts`) | pass |
| SC-003 switch under 100 ms, no flash | `theme.spec.ts`: first frame on a dark device with and without a saved choice; timed switch | pass |
| SC-004 no foreign requests | `network-assertions.spec.ts`; `check:bundle-origins`; fonts requested from the app's own origin (`fonts.spec.ts`) | pass |
| SC-005 no horizontal scroll | `layout.spec.ts`: every screen at 320, 768, and 1280 px in `en`, `es`, and `ar-XB` | pass |
| SC-006 diacritics not clipped | `fonts.spec.ts`: line height at least 1.6 × font size, no clipped bubble | pass |
| SC-007 keyboard and focus | `accessibility.spec.ts`: tab walk, a 2px outline at every stop, every control reached | pass |
| SC-009 text never blocked by fonts | `font-display: swap` in the build test; text visible within 1 s with fonts delayed 3 s (`fonts.spec.ts`) | pass |
| FR-003a delete-all | adapter tests; `theme.spec.ts` checks `localStorage` holds no `tarjuman.*` key afterwards | pass |
| FR-014a font budget | build test: Latin files together at most 250 KB, Arabic at most 200 KB, Arabic `unicode-range` limited to Arabic | pass |

### SC-008: existing tests that changed

| File | Change | Behavioral expectation changed? |
|------|--------|---------------------------------|
| `tests/e2e/rtl.spec.ts` | Positional selectors scoped to `main` (`main select`, `main label`), because the header's theme `<select>` is now the first control on every page | No |
| `apps/web/tests/prod-excludes-dev-provider.test.ts` | Two more mock markers (`LAYOUT-STRESS-TEST`, `PROVIDER-ERROR-TEST`) must be absent from a normal build | No; the check is stricter |
| `apps/web/tests/controller.test.ts`, `packages/storage-web/tests/storage.test.ts`, `packages/storage-web/tests/memory-storage.test.ts`, `packages/ui/tests/chat.test.ts`, `packages/ui/tests/screens.test.ts` | New test cases, and test setup that passes an injected `localStorage` | No |

## §3 Manual visual review (SC-010)

Run with the mock provider: `VITE_PROVIDER=mock pnpm --filter @tarjuman/web dev`, key
`sk-ant-mock-valid-key-0000`. Record **Pass** or **Fail** (with a note), the browser, and the date.

| # | Check | Expected | Result | Browser | Date |
|---|-------|----------|--------|---------|------|
| 1 | Every screen in light, then dark, at desktop and phone width | One coherent look; nothing unstyled; the stats panel, tone, and settings included | | | |
| 2 | Device set to dark, cold load; then choose Light in the header on the first screen and reload | Dark from the first frame; then light from the first frame | | | |
| 3 | Choose "follow system", then switch the device theme while an answer streams (`?mockLatencyMs=400` slows it) | The theme follows at once; the stream is not interrupted | | | |
| 4 | A long answer with a heading, a list, a table, a code block, and a link (`What is the difference between ser and estar?`, `LAYOUT-STRESS-TEST`, then `HOSTILE-RENDER-TEST` for a link) | Every block styled; the link shows its destination; no image appears | | | |
| 5 | The learner's messages vs the mediator's answers, in grayscale (browser dev tools) | Still distinguishable by position, shape, and label | | | |
| 6 | Interface in `ar-XB` (`?locale=ar-XB`): every screen, the drawer, and the back and send icons | Mirrored; the drawer opens from the right; directional icons point the right way | | | |
| 7 | A message with fully vocalized Arabic, for example `اَلسَّلَامُ عَلَيْكُمْ وَرَحْمَةُ ٱللَّٰهِ`, mixed with Latin text | No clipped marks; comfortable line spacing | | | |
| 8 | The guard notice (type a key-shaped string), the 80% context notice (`HIGH-USAGE-TEST`), an invalid key, a provider error (`PROVIDER-ERROR-TEST`), and a delete-all failure | Each has an icon and wording, not only a color | | | |
| 9 | OS high contrast or forced colors | Usable: borders, focus, and text visible | | | |
| 10 | OS reduced motion | The drawer and transitions do not animate noticeably | | | |
| 11 | 200% browser zoom, and a large default font size | Layout usable, nothing overlaps | | | |
| 12 | Throttled network ("Slow 3G" in dev tools), cold load | Text visible at once in the fallback font, then swaps | | | |

Note for row 8: the app has no switch that makes "delete all my data" fail on demand. The failure
state is covered by tests instead: `packages/ui/tests/screens.test.ts` checks that `DataControls`
shows its failure through `FormError` (icon and words), and `apps/web/tests/controller.test.ts`
checks that an unverified deletion is reported and keeps the screen in place.
