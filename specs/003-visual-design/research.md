# Research: Visual Design

Decisions behind [plan.md](plan.md). Each one answers an open question from the spec or the
Technical Context. Package facts were checked against the npm registry on 2026-10-13; font sizes
were measured from the published packages, not taken from documentation.

## R1. Theme switching mechanism

- **Decision**: One set of color tokens, each written once with the CSS `light-dark()` function
  (`--color-surface: light-dark(#f9f9ff, #0c1419)`). The root sets `color-scheme: light dark`, so
  the device preference picks the value with no script. An explicit choice sets
  `data-theme="light"` or `data-theme="dark"` on `<html>`, which pins `color-scheme` to that one
  value. "Follow system" removes the attribute.
- **Rationale**: each token has its two values side by side, so they cannot drift apart. Following
  the system needs no JavaScript and reacts to a device change at once, without a reload (US1-3),
  including mid-stream. Switching is an attribute change and one style recalculation, well under
  the 100 ms in SC-003. `light-dark()` ships in Chrome 123, Firefox 120, and Safari 17.5, all
  older than the evergreen browsers 001 targets.
- **Alternatives considered**: two token blocks (a `:root` block plus a dark media query plus a
  `[data-theme=dark]` block) repeat every dark value twice. A class toggled by JavaScript for
  every case adds a flash risk and a listener for something CSS already does.

## R2. No flash of the wrong theme before first paint (FR-002, FR-003, SC-003)

- **Decision**: a tiny classic script, `apps/web/public/theme-init.js`, loaded with a plain
  `<script src="/theme-init.js">` in `<head>` before the stylesheet and the app module. It reads
  `localStorage["tarjuman.theme"]` inside `try`/`catch` and sets `data-theme` only for `light` or
  `dark`. Anything else, including a missing or blocked `localStorage`, leaves the attribute off,
  so the device preference applies.
- **Rationale**: a classic external script blocks parsing, so the attribute is set before the
  first paint. It is same-origin, so `script-src 'self'` allows it and the CSP is unchanged (no
  inline script, no hash). It holds no secret and reads only the one key (clarification 1).
- **Alternatives considered**: reading the preference from IndexedDB (asynchronous, so too late
  for first paint); an inline script with a CSP hash (changes the CSP, which FR-018 forbids); a
  module script (deferred by default, so too late).

## R3. Where the preference lives and how "delete all my data" removes it (FR-003a)

- **Decision**: a small `ThemePreferenceStore` in `packages/storage-web` owns the
  `tarjuman.theme` key. `IndexedDbStorage.clearAll()` and `MemoryStorage.clearAll()` also remove
  every `localStorage` key that starts with `tarjuman.`. `IndexedDbStorage`'s emptiness check then
  fails with `StorageNotEmptyError` if any such key remains. Both take an injectable
  `localStorage`-like object, as they already do for Cache Storage, so tests need no browser.
- **Rationale**: the preference is device storage like the rest, so the storage adapter owns it,
  and `DataController.deleteAll()` in `core` already treats any `clearAll()` failure as "not
  verified". **`packages/core` does not change.** The `tarjuman.` prefix means a future key is
  covered without another change.
- **Alternatives considered**: a separate step in `DataController` (needs a new port in `core`
  for something only the web has); clearing it from the UI after delete-all (outside the verified
  path, so a failure could go unreported).

## R4. Typefaces (FR-012 to FR-014a)

- **Decision**: self-host three variable fonts from Fontsource, all under the SIL Open Font
  License 1.1, which allows bundling:

  | Font | Role | Subsets bundled | Measured size (woff2) |
  |------|------|-----------------|-----------------------|
  | Inter Variable (`@fontsource-variable/inter` 5.3.0) | body, labels | latin, latin-ext | 48 KB + 85 KB |
  | Plus Jakarta Sans Variable (`@fontsource-variable/plus-jakarta-sans` 5.3.0) | headings | latin, latin-ext | 27 KB + 22 KB |
  | Noto Naskh Arabic Variable (`@fontsource-variable/noto-naskh-arabic` 5.3.0) | Arabic script | arabic | 94 KB |

  The project writes its own `@font-face` rules in `packages/ui/src/styles/fonts.css`. They point
  at the `.woff2` files inside those packages, so Vite copies them into the build as same-origin
  assets. Each rule has `font-display: swap` and the package's `unicode-range`. Other scripts
  (Cyrillic, Greek, Vietnamese, CJK) are not bundled and fall back to the system font stack.
- **Budget**: a browser downloads a face only when text on the page needs its range. English and
  Spanish need only the two latin files, **75 KB**. Every Latin file together is **182 KB**, under
  the 250 KB limit. The Arabic file is **94 KB**, under 200 KB, and downloads only when Arabic
  characters are on screen. A build test enforces both limits and that the Arabic rule's
  `unicode-range` stays within the Arabic blocks (FR-014a).
- **Rationale**: variable fonts give every weight in one file. `swap` shows text at once in the
  fallback font (FR-014, SC-009). Writing the rules ourselves, instead of importing Fontsource's
  CSS, keeps every unused subset out of the build.
- **Alternatives considered**: Fontsource's ready-made CSS (bundles every subset); Google Fonts
  (remote, forbidden by FR-012 and the CSP); Amiri for Arabic (a more decorative Naskh with a
  larger file and tighter vertical metrics for diacritics).

## R5. Arabic line height and diacritics (FR-013, SC-006)

- **Decision**: the reading column uses a line height of 1.7. Arabic runs inside messages get no
  separate rule, because the language of model output is not known. Nothing in the message area
  sets `overflow: hidden` or a fixed block size on text lines.
- **Rationale**: 1.7 is comfortable for long Latin text and leaves room for Naskh's stacked marks.
  Clipping comes from fixed heights and hidden overflow, which the stylesheet avoids. The manual
  review (SC-010) confirms it with fully vocalized text.

## R6. Icons (FR-015)

- **Decision**: `lucide-react` 1.x (ISC license), imported per icon so only the used icons are
  bundled. Each icon renders as inline SVG elements created by React, not by injected markup.
  Icons next to a text label are `aria-hidden`. Icon-only buttons take their accessible name from
  an i18n string. Directional icons (back, send, the drawer chevron) get the existing
  `icon-directional` class, which mirrors them in right-to-left layouts.
- **Rationale**: no font file and no remote request; tree-shaken; no `dangerouslySetInnerHTML`.
  Its outline style is close to the Material Symbols in the mockups.
- **Alternatives considered**: `@material-symbols/svg-400` (Apache-2.0) ships raw `.svg` files,
  which would need an SVG-to-component build plugin or `<img>` tags, and `<img>` tags cannot follow
  the theme color; a Material Symbols font (one large file, ligature-based, hard to subset).

## R7. Layout and the slide-out sidebar (FR-007, US2-3)

- **Decision**: from 64rem up, a persistent sidebar (conversations, then the stats panel and
  settings controls) sits beside a centered reading column (max 46rem, about 70 characters). Below
  64rem the sidebar becomes an off-canvas drawer, opened by a header button whose name comes from
  i18n and that sets `aria-expanded`. Escape, the close button, and a click outside close it, and
  focus returns to the button. The composer stays at the bottom of the reading column. Full-height
  regions use `100dvh` so mobile browser toolbars do not hide the composer. Every offset is a
  logical property (`inset-inline-start`), so the drawer opens from the right in right-to-left.
- **Rationale**: matches the arrangement of the references and keeps the composer reachable on
  phones. The drawer is plain React state plus CSS, so it needs no library.
- **Alternatives considered**: a `<dialog>` element for the drawer (its modal focus trap is
  heavier than needed, and the sidebar is navigation, not a dialog).

## R8. Verification without screenshot baselines (SC-001, SC-002, SC-005, SC-007, SC-010)

- **Decision**:
  - **Raw colors (SC-001)**: Stylelint's built-in rules `color-no-hex`, `color-named: "never"`,
    and `function-disallowed-list` (`rgb`, `rgba`, `hsl`, `hsla`, `hwb`, `lab`, `lch`, `oklab`,
    `oklch`) fail every stylesheet except `tokens.css`, through an `overrides` entry. No new
    package. A Vitest architecture test also fails on any `style={{…}}` prop that sets a color in
    `packages/ui/src`.
  - **Contrast (SC-002)**: `@axe-core/playwright` (MPL-2.0, dev only) runs axe's
    `color-contrast` rule on every screen in both themes. A Vitest test also computes the WCAG
    contrast of each declared text-on-surface token pair from `tokens.css`, to catch a bad token
    before a browser runs.
  - **Overflow (SC-005)**: Playwright checks `scrollWidth <= clientWidth` on every screen at 320,
    768, and 1280 px, with the interface in `en`, `es`, and `ar-XB`, and with Arabic message content.
  - **Focus (SC-007)**: Playwright tabs through every screen and checks that each focused element
    has a visible `:focus-visible` outline in both themes.
  - **Human judgment (SC-010)**: a manual review checklist,
    `checklists/visual-review.md`, covering both themes, the RTL layout, Arabic diacritics,
    forced colors, and reduced motion.
- **Rationale**: these checks are stable across macOS and the Linux CI (clarification 4), and
  together they cover every measurable criterion.
- **Alternatives considered**: committed screenshot baselines (rejected in clarification 4);
  hand-written contrast math in Playwright (axe already handles transparency and stacking).

## R9. Accessibility media features (edge cases, FR-011)

- **Decision**:
  - `@media (prefers-reduced-motion: reduce)` sets transition and animation durations to near
    zero, including the drawer.
  - `@media (forced-colors: active)` drops decorative backgrounds and shadows, keeps borders on
    bubbles, notices, and controls with system colors (`CanvasText`, `ButtonBorder`, `Highlight`),
    and keeps the focus outline.
  - Browsers that report no preference get light, because `light-dark()` returns the first value
    there.
- **Rationale**: covers the edge cases in the spec with CSS only.

## R10. Third-party notices

- **Decision**: add `apps/web/public/licenses.txt`, which Vite copies into the build unchanged.
  It lists the three fonts (OFL 1.1, with their copyright lines and the license text) and Lucide
  (ISC). It is served from the app's own origin and is not fetched by the app.
- **Rationale**: the fonts become part of what the app distributes, and the OFL requires its
  license to travel with them. This is the license's only condition that applies to bundling.
  Any URL in the license text is a plain string. If `check:bundle-origins` flags one, it goes on
  that check's short list of inert hosts, with a comment.

## R11. New dependencies (CLAUDE.md asks that each one be justified)

| Package | Where | Why the spec needs it |
|---------|-------|-----------------------|
| `@fontsource-variable/inter`, `@fontsource-variable/plus-jakarta-sans`, `@fontsource-variable/noto-naskh-arabic` | `packages/ui` dependencies (font files only; no code runs) | FR-012, FR-013: bundled typefaces, including one for Arabic |
| `lucide-react` | `packages/ui` dependency | FR-015: bundled icons with text alternatives |
| `@axe-core/playwright` | root devDependency | SC-002: an automated contrast check on every screen |

No new dependency in `packages/core`, and no runtime dependency outside `packages/ui`.
