# Quickstart: Validating Visual Design

How to prove feature 003 works. Contracts: [design tokens](contracts/design-tokens.md),
[theme preference](contracts/theme-preference.md), [shell and layout](contracts/ui-shell.md).

## Prerequisites

- Node 22 or 24, pnpm, and Playwright browsers (`pnpm exec playwright install`)
- No API key: everything here runs against the mock provider

## 1. Run it

```bash
pnpm install
VITE_PROVIDER=mock pnpm --filter @tarjuman/web dev   # key: sk-ant-mock-valid-key-0000
```

## 2. Automated gates

```bash
pnpm typecheck
pnpm lint
pnpm lint:css        # logical properties, plus no raw color outside tokens.css (SC-001)
pnpm lint:arch
pnpm lint:i18n       # the new theme and shell keys exist in en and es
pnpm test            # token contrast pairs, theme store, theme-init.js, delete-all, font budget
pnpm test:redteam    # unchanged expectations (SC-008)
pnpm --filter @tarjuman/web build && pnpm check:bundle-origins   # still only self + provider
pnpm test:e2e        # theme, layout, contrast (axe), focus, overflow, RTL, network
```

Expected: all green, and **no existing test needed a change to its behavioral expectations**
(SC-008). Selector or label changes are allowed; changed assertions about behavior are not.

| Criterion | Where it is checked |
|-----------|--------------------|
| SC-001 tokens only | `lint:css` (Stylelint color rules) and an architecture test for inline styles |
| SC-002 contrast | Token-pair unit test, plus axe `color-contrast` on every screen in both themes |
| SC-003 switch < 100 ms, no flash | E2E: cold load with a dark device, with and without a saved choice; timed switch |
| SC-004 no foreign requests | `network-assertions.spec.ts` (001) and `check:bundle-origins`, now including fonts |
| SC-005 no horizontal scroll | E2E at 320, 768, and 1280 px, interface in `en`, `es`, and `ar-XB`, with Arabic content |
| SC-007 keyboard and focus | E2E tab walk with a visible-outline check on each stop |
| SC-009 text never blocked by fonts | `font-display: swap` asserted in the build test; first-words e2e (001 SC-002) still passes |
| FR-014a font budget | Build test: Latin fonts at most 250 KB, Arabic at most 200 KB, Arabic `unicode-range` limited to Arabic |
| FR-003a delete-all | Adapter tests, plus the e2e checks that `localStorage` is empty after delete-all |

## 3. Manual visual review (SC-010)

Record each row in `checklists/visual-review.md`, with the date and the browser.

| # | Check | Expected |
|---|-------|----------|
| 1 | Every screen in light, then dark, at desktop and phone width | One coherent look; nothing unstyled; the stats panel, tone, and settings included |
| 2 | Device set to dark, cold load; then choose Light in the header on the first screen and reload | Dark from the first frame; then light from the first frame |
| 3 | Choose "follow system", then switch the device theme while an answer streams | The theme follows at once; the stream is not interrupted |
| 4 | A long answer with a heading, a list, a table, a code block, and a link (`What is the difference between ser and estar?`, then `HOSTILE-RENDER-TEST` for a link) | Every block styled; the link shows its destination; no image appears |
| 5 | The learner's messages vs the mediator's answers, in grayscale (browser dev tools) | Still distinguishable by position, shape, and label |
| 6 | Interface in `ar-XB` (`?locale=ar-XB`): every screen, the drawer, and the back and send icons | Mirrored; the drawer opens from the right; directional icons point the right way |
| 7 | A message with fully vocalized Arabic, for example `اَلسَّلَامُ عَلَيْكُمْ وَرَحْمَةُ ٱللَّٰهِ`, mixed with Latin text | No clipped marks; comfortable line spacing |
| 8 | The guard notice (type a key-shaped string), the 80% context notice (`HIGH-USAGE-TEST`), an invalid key, and a delete-all failure | Each has an icon and wording, not only a color |
| 9 | OS high contrast or forced colors | Usable: borders, focus, and text visible |
| 10 | OS reduced motion | The drawer and transitions do not animate noticeably |
| 11 | 200% browser zoom, and a large default font size | Layout usable, nothing overlaps |
| 12 | Throttled network ("Slow 3G" in dev tools), cold load | Text visible at once in the fallback font, then swaps |

## Done when

All gates in §2 pass, every row in §3 is recorded as passing, and SC-008 holds (no behavioral test
expectation changed).
