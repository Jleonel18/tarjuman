# Implementation Plan: Visual Design

**Branch**: `003-visual-design` | **Date**: 2026-10-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-visual-design/spec.md`

## Summary

Give the existing Tarjuman web UI one visual identity with a light and a dark theme, without
changing what the app does.

- **Tokens.** One token stylesheet holds every color as `light-dark(light, dark)`, so the device
  preference applies with no script.
- **First paint.** An explicit choice is stored under `localStorage` key `tarjuman.theme` and
  applied before first paint by a tiny same-origin classic script. The CSP is unchanged.
- **Erasure.** "Delete all my data" also clears and verifies that key.
- **Fonts.** Inter, Plus Jakarta Sans, and Noto Naskh Arabic are self-hosted variable fonts with
  `font-display: swap` and `unicode-range`: 75 KB for English and Spanish, 94 KB of Arabic loaded
  only when Arabic appears.
- **Icons.** Bundled Lucide icons.
- **Layout.** Every existing screen is restyled with logical properties only, in a sidebar,
  reading column, and composer arrangement that becomes a drawer on narrow screens.
- **Verification.** Automated structural checks (Stylelint color rules, a token contrast test,
  axe contrast in Playwright, overflow, focus, a font budget test) plus a recorded manual review.
  No screenshot baselines.
- **Core.** `packages/core` does not change.

## Technical Context

**Language/Version**: TypeScript (strict) and CSS; Node 22/24 for tools; evergreen browsers
(`light-dark()` needs Chrome 123, Firefox 120, Safari 17.5)

**Primary Dependencies**: existing React 19, Vite, i18next. New, justified in
[research.md](research.md) R11: `@fontsource-variable/inter`,
`@fontsource-variable/plus-jakarta-sans`, `@fontsource-variable/noto-naskh-arabic` (OFL 1.1, font
files only), `lucide-react` (ISC), and `@axe-core/playwright` (MPL-2.0, dev only)

**Storage**: one `localStorage` key, `tarjuman.theme`, owned by `packages/storage-web`
([data-model.md](data-model.md)). IndexedDB is unchanged.

**Testing**: Vitest (token contrast, theme store, `theme-init.js`, delete-all, font budget build
test, inline-style scan); Stylelint (raw colors); Playwright (theme and first paint, layout and
drawer, axe contrast, focus walk, overflow at 3 widths × 3 locales, the existing network test)

**Target Platform**: the web app (`apps/web`) in Chromium, Firefox, and WebKit

**Project Type**: pnpm monorepo web application; this feature touches `packages/ui`,
`packages/storage-web`, and `apps/web`

**Performance Goals**: theme switch < 100 ms with no reload (SC-003); readable text < 2 s, never
blocked by fonts (SC-009); 001's first-words p95 < 2 s still holds

**Constraints**: CSP unchanged (no inline script or style, no remote font or icon); logical
properties only; every string through i18n (en, es); no new product function; Latin fonts
≤ 250 KB and Arabic ≤ 200 KB (FR-014a); `packages/core` untouched

**Scale/Scope**: about 18 existing components and 1 stylesheet (356 lines) restyled; 1 new
component (`ThemeSwitcher`) and a drawer behavior; 7 new catalog keys

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | How this plan complies |
|---|-----------|--------|------------------------|
| I | Comprehensible Input First | PASS | No courses, scores, streaks, badges, or progress bars; the mockups' engagement elements are listed as out of scope and not built. |
| II | Stable Core, Modular Capabilities | PASS | `packages/core` does not change; the theme type lives in the UI and the storage adapter. |
| III | Mandatory Pipeline | PASS | No model interaction changes; rendering still consumes `SafeBlock` only. |
| IV | Instruction Hierarchy | PASS | Not touched. |
| V | Security by Structure | PASS | CSP unchanged: `theme-init.js` is same-origin; fonts and icons are bundled; no `dangerouslySetInnerHTML`; icons are React-created SVG elements; no image node is added to `SafeBlock` rendering; `check:bundle-origins` and the network e2e test still gate. |
| VI | User Sovereignty | PASS | The preference stays on the device and is erased, with verification, by "delete all my data" (FR-003a). |
| VII | Declarative Guardrails | PASS | Not touched; guardrail and red-team suites run unchanged (SC-008). |
| VIII | Global by Design | PASS | Logical properties only (`lint:css`); 7 new keys in en and es; RTL verified with `ar-XB`; a bundled Arabic font with generous line height; directional icons mirror. |
| IX | Transparency | PASS | The stats panel is restyled, not reduced: every figure stays visible. |
| X | Copyright & ToS | PASS | Fonts and icons are under OFL 1.1 and ISC; their notices ship in `licenses.txt` (R10). |
| XI | Provider Independence | PASS | Not touched. |
| XII | Tests as Contract | PASS | Every FR and SC maps to an automated check or a recorded manual review ([quickstart.md](quickstart.md)); the red-team suite still blocks merges. |

**Gate result**: PASS, with no deviations. **Post-design re-check**: PASS. Phase 1 added three
dependencies beyond the fonts, each traced to a requirement (R11), and no change to `core`.

## Project Structure

### Documentation (this feature)

```text
specs/003-visual-design/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1-R11
├── data-model.md        # Phase 1: ThemePreference, applied theme, token set
├── quickstart.md        # Phase 1: gates and the manual review
├── contracts/
│   ├── design-tokens.md
│   ├── theme-preference.md
│   └── ui-shell.md
├── checklists/
│   ├── requirements.md
│   └── visual-review.md # created during implementation (SC-010)
├── mockups/             # visual reference only, never shipped
└── tasks.md             # Phase 2 (/speckit-tasks), not created here
```

### Source Code (repository root)

```text
packages/ui/
├── src/styles/
│   ├── tokens.css          # NEW: every token; the only file with raw colors
│   ├── fonts.css           # NEW: @font-face for the 3 variable fonts (latin, latin-ext, arabic)
│   └── base.css            # REWRITTEN: layout and components, using tokens only
├── src/theme/
│   └── apply-theme.ts      # NEW: applyTheme(preference, root)
├── src/settings/ThemeSwitcher.tsx   # NEW: compact (header) and full (settings) variants
├── src/AppShell.tsx        # header actions slot, drawer toggle
├── src/**/*.tsx            # class names and icons only; no behavior change
├── src/i18n/locales/{en,es}.json    # 7 new keys
└── tests/                  # theme switcher render, token contrast pairs

packages/storage-web/
├── src/theme-preference.ts # NEW: ThemePreferenceStore (key tarjuman.theme)
├── src/indexeddb-storage.ts  # clearAll also clears and verifies tarjuman.* in localStorage
├── src/memory-storage.ts     # clearAll also clears tarjuman.* in localStorage
└── tests/

apps/web/
├── index.html              # <script src="/theme-init.js"> in <head>
├── public/theme-init.js    # NEW: classic script, sets data-theme before first paint
├── public/licenses.txt     # NEW: OFL and ISC notices
├── src/main.tsx, routes.tsx, controller.ts   # wire the switcher and preference; reset after delete-all
└── tests/                  # font budget build test, theme-init test

stylelint.config.cjs        # raw-color rules, with tokens.css exempt
tests/architecture/         # inline-style color scan
tests/e2e/
├── theme.spec.ts           # first paint, switching, follow system, persistence, delete-all
├── layout.spec.ts          # drawer, overflow at 3 widths × 3 locales, Arabic content
└── accessibility.spec.ts   # axe contrast on every screen × 2 themes, focus walk
```

**Structure Decision**: no new package. Styling stays in `packages/ui`, which already owns
`base.css`, and storage of the preference sits in `packages/storage-web`, which already owns
browser storage and "delete all". The pre-paint script must be a static same-origin file, so it
lives in `apps/web/public`. `packages/core` is not touched.

## Risks

| Risk | Mitigation |
|------|-----------|
| Restyling breaks e2e selectors | Tests select by role and label, which this feature keeps. A test may change a selector, never a behavioral expectation (SC-008). |
| `light-dark()` unsupported in an older browser | Outside the targeted evergreen versions; the tokens' light values still apply as a fallback, so the app stays readable. |
| Vite turns `/theme-init.js` into a module or inlines it | It stays in `public/`, which Vite copies verbatim. A build test asserts the built `index.html` references it as a classic script before the app module. |
| The license text adds hosts that `check:bundle-origins` flags | Add them to its inert-host list with a comment (R10). |
| Contrast fails on a pair not listed in the contract | axe runs on every screen and fails the build; the pair is then added to the contract and the unit test. |

## Complexity Tracking

No constitution violations. Nothing to justify.
