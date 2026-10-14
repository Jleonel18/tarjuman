---

description: "Task list for 003-visual-design"
---

# Tasks: Visual Design

**Input**: Design documents from `/specs/003-visual-design/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED. The constitution (Principle XII) requires verifiable acceptance criteria, and
the spec defines automated checks for SC-001 to SC-007 plus a recorded manual review (SC-010).
Within each story, write the tests first and confirm they fail before implementing. SC-008: no
existing test may change a behavioral expectation; a selector change is allowed and must be named
in the batch summary.

**Organization**: Tasks are grouped by user story. US1 (themes) and US2 (the conversation
experience) are both P1 and form the MVP; US3 and US4 are P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: User story the task belongs to (US1-US4)
- Every task names the exact file path(s) it creates or edits

## Path Conventions

pnpm monorepo, per plan.md. Paths are relative to the repository root. `packages/core` must not
change in this feature. Every stylesheet uses logical properties only, and only
`packages/ui/src/styles/tokens.css` may contain raw color values.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and license notices (research R10, R11).

- [X] T001 Add `@fontsource-variable/inter`, `@fontsource-variable/plus-jakarta-sans`, `@fontsource-variable/noto-naskh-arabic` (5.3.x) and `lucide-react` (1.x) to `packages/ui/package.json` dependencies, add `@axe-core/playwright` (4.13.x) to the root `package.json` devDependencies, and run `pnpm install`. Confirm `pnpm audit --prod` stays clean
- [X] T002 [P] Create `apps/web/public/licenses.txt` with the SIL Open Font License 1.1 text and the copyright lines of Inter, Plus Jakarta Sans, and Noto Naskh Arabic (from each package's `LICENSE`), plus Lucide's ISC notice

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The token set, the fonts, and the checks that keep raw values out (FR-001, FR-005, FR-012 to FR-014a, SC-001). Every story builds on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests for the foundation ⚠️

- [X] T003 [P] Token contrast test in `packages/ui/tests/tokens.test.ts`: parse `packages/ui/src/styles/tokens.css`, read each `light-dark(light, dark)` color token, and assert every "Used on" pair in `specs/003-visual-design/contracts/design-tokens.md` meets 4.5:1 for text pairs and 3:1 for the `--color-border` boundary pair, in both themes. Also assert that every token named in the contract exists
- [X] T004 [P] Inline-style scan in `tests/architecture/no-inline-colors.test.ts`: no `.tsx` file under `packages/ui/src` or `apps/web/src` passes a `style` prop containing a color, hex value, or color function
- [X] T005 [P] Font budget build test in `apps/web/tests/font-budget.test.ts`, building like `prod-excludes-dev-provider.test.ts`. Assert:
  - every emitted `.woff2` whose name contains `latin` totals at most 250 KB, and the Arabic one at most 200 KB (FR-014a)
  - no other font subset (cyrillic, greek, vietnamese) is emitted
  - every `@font-face` in the built CSS has `font-display: swap` (FR-014)
  - the Arabic face's `unicode-range` covers only Arabic blocks (U+0600-06FF, U+0750-077F, U+0870-08FF, U+FB50-FDFF, U+FE70-FEFF and the marks the package declares)

### Implementation for the foundation

- [X] T006 Create `packages/ui/src/styles/tokens.css` exactly per `specs/003-visual-design/contracts/design-tokens.md`:
  - every color and shadow token as `light-dark(<light>, <dark>)`
  - `:root { color-scheme: light dark; }`, `:root[data-theme="light"] { color-scheme: light; }`, `:root[data-theme="dark"] { color-scheme: dark; }`
  - the typography, spacing (keep `--space-1`…`--space-4` values), radius, motion, and layout tokens
  - a `@media (prefers-reduced-motion: reduce)` block setting both durations to `0.01ms` (makes T003 pass)
- [X] T007 Create `packages/ui/src/styles/fonts.css` with one `@font-face` per file, importing the `.woff2` by package path, with `font-display: swap` and the package's `unicode-range`:
  - `Inter Variable`: latin, latin-ext
  - `Plus Jakarta Sans Variable`: latin, latin-ext
  - `Noto Naskh Arabic Variable`: arabic

  Do not import Fontsource's own CSS (research R4). This makes T005 pass.
- [X] T008 Edit `packages/ui/src/styles/base.css`:
  - `@import` `tokens.css` and `fonts.css` first
  - set `body` to `font-family: var(--font-body)`, `color: var(--color-text)`, `background: var(--color-canvas)`, `line-height: var(--leading-body)`
  - replace every raw color (`red`, `orange`, and any `color-mix` with a literal color) with tokens

  Keep the existing class names so the components keep working.
- [X] T009 Add raw-color rules to `stylelint.config.cjs`: `color-no-hex: true`, `color-named: "never"`, `function-disallowed-list` for `rgb`, `rgba`, `hsl`, `hsla`, `hwb`, `lab`, `lch`, `oklab`, and `oklch`, with an `overrides` entry that turns them off for `packages/ui/src/styles/tokens.css` only. Run `pnpm lint:css` (must pass after T008; confirm `currentColor` and `transparent` are accepted)

**Checkpoint**: `pnpm lint:css && pnpm test` pass; the app looks the same in structure but uses the tokens and fonts.

---

## Phase 3: User Story 1 - Use the app in a light or dark theme that suits me (Priority: P1) 🎯 MVP

**Goal**: The device theme applies from the first paint, a choice of light, dark, or "follow system" is available on every screen and in Settings, it persists, and "delete all my data" erases it.

**Independent Test**: set the OS to dark, open the app: dark. Switch to light with the header control on the first-run screen, reload: light. Choose "follow system" and the app follows the device again.

### Tests for User Story 1 ⚠️

- [X] T010 [P] [US1] Store tests in `packages/storage-web/tests/theme-preference.test.ts`, with an injected fake `localStorage`:
  - round trip for `"light"`, `"dark"`, `"system"`
  - "Absent means `"system"`. Any other value is read as `"system"` and is not written back"
  - a `localStorage` whose methods throw never throws to the caller
  - the key is exactly `tarjuman.theme`
- [X] T011 [P] [US1] Delete-all tests in `packages/storage-web/tests/storage.test.ts` and `packages/storage-web/tests/memory-storage.test.ts`:
  - `clearAll()` removes every `localStorage` key starting with `tarjuman.` and leaves other keys alone
  - in `IndexedDbStorage`, a `tarjuman.` key that survives removal (a fake whose `removeItem` does nothing) makes `clearAll()` throw `StorageNotEmptyError`
- [X] T012 [P] [US1] `theme-init.js` tests in `apps/web/tests/theme-init.test.ts`:
  - run `apps/web/public/theme-init.js` in a Node `vm` context with a fake `document` and `localStorage`
  - it sets `document.documentElement.dataset.theme` only for `light` and `dark`, and does nothing for `system`, a missing key, junk, or a throwing `localStorage`
  - its key string equals the store's exported key constant
  - it never calls `setItem`
- [X] T013 [P] [US1] Render tests in `packages/ui/tests/theme-switcher.test.ts`:
  - `ThemeSwitcher` in `en` and `es` with no missing catalog key
  - `variant="compact"` renders one labeled `<select>` with three options
  - `variant="full"` renders a radio group with three labeled radios
  - the current value is selected
- [X] T014 [P] [US1] Controller tests in `apps/web/tests/controller.test.ts`:
  - `setTheme("dark")` writes the store and applies `data-theme`
  - `setTheme("system")` stores `"system"` and removes the attribute
  - after a successful `deleteAllData()` the attribute is removed and the store reads `"system"`
- [X] T015 [P] [US1] Playwright `tests/e2e/theme.spec.ts`:
  - with `colorScheme: "dark"` and no saved choice, the first-run screen's `html` background equals `--color-canvas` dark; read it from an init script on the first `requestAnimationFrame`, so no light frame is measured
  - with `localStorage["tarjuman.theme"] = "light"` set by `addInitScript` on a dark device, the first frame is light
  - choosing Dark in the header control on onboarding applies in under 100 ms without a reload (SC-003) and survives a reload
  - "Follow system" tracks `page.emulateMedia({ colorScheme })` changes without a reload, including while an answer streams
  - the Settings control and the header control show the same value
  - after "delete all my data", `localStorage` has no `tarjuman.` key and the theme follows the device again

### Implementation for User Story 1

- [X] T016 [US1] Implement `ThemePreferenceStore` and export `THEME_STORAGE_KEY = "tarjuman.theme"` and `type ThemePreference = "light" | "dark" | "system"` in `packages/storage-web/src/theme-preference.ts`, with an injectable `localStorage`-like object (`getItem`, `setItem`, `removeItem`, `key`, `length`), per `contracts/theme-preference.md`. Export from `packages/storage-web/src/index.ts` (makes T010 pass)
- [X] T017 [US1] Extend `clearAll()` in `packages/storage-web/src/indexeddb-storage.ts` and `packages/storage-web/src/memory-storage.ts`:
  - add an injectable `localStorage` option, defaulting to `globalThis.localStorage` when available
  - remove every key starting with `tarjuman.`
  - in `IndexedDbStorage`'s emptiness check, throw `StorageNotEmptyError("local storage entries remain")` if any remain
  - wrap the `localStorage` access so blocked storage counts as empty, not as an error

  Makes T011 pass.
- [X] T018 [US1] Create `apps/web/public/theme-init.js`: a classic script (no `import`, no `export`) that reads `localStorage.getItem("tarjuman.theme")` in `try`/`catch` and sets `document.documentElement.dataset.theme` for `light` or `dark` only. Add `<script src="/theme-init.js"></script>` to `<head>` in `apps/web/index.html`, before the module script (makes T012 pass)
- [X] T019 [P] [US1] Implement `applyTheme(preference, root = document.documentElement)` in `packages/ui/src/theme/apply-theme.ts` (`light` or `dark` sets `root.dataset.theme`; `system` deletes it) and export it from `packages/ui/src/index.ts`
- [X] T020 [US1] Build `ThemeSwitcher` in `packages/ui/src/settings/ThemeSwitcher.tsx`, with props `value`, `onChange`, and `variant: "compact" | "full"`:
  - compact: a labeled `<select>` with a `lucide-react` theme icon marked `aria-hidden`
  - full: a radio group with an icon per option

  Add `theme.label`, `theme.light`, `theme.dark`, `theme.system` to `packages/ui/src/i18n/locales/en.json` and `es.json`, and export the component from `packages/ui/src/index.ts` (makes T013 pass).
- [X] T021 [US1] Add a `headerActions?: ReactNode` prop to `AppShell` in `packages/ui/src/AppShell.tsx`, rendered at the inline-end of the header. Style `.app-shell__header` and `.app-shell__title` with tokens in `packages/ui/src/styles/base.css`
- [X] T022 [US1] Wire the theme in the app:
  - add `themes: ThemePreferenceStore` to `AppServices` in `apps/web/src/composition-root.ts`
  - add `theme: ThemePreference` to the store in `apps/web/src/store/index.ts`, initialized from `services.themes.get()` in `boot()`
  - add `setTheme(preference)` to `apps/web/src/controller.ts`: store, `applyTheme`, update state
  - after a successful `deleteAllData()`, call `applyTheme("system")` and set state to `"system"`
  - pass `<ThemeSwitcher variant="compact">` as `headerActions` in `apps/web/src/main.tsx`
  - add `<ThemeSwitcher variant="full">` to the settings route in `apps/web/src/routes.tsx`

  Makes T014 and T015 pass.

**Checkpoint**: US1's independent test passes; `pnpm typecheck && pnpm lint && pnpm lint:arch && pnpm test` and `theme.spec.ts` are green; no 001 test changed behavior.

---

## Phase 4: User Story 2 - A coherent look across the whole conversation experience (Priority: P1)

**Goal**: Sidebar, reading column, and composer look like one product in both themes and at every width, with the learner's messages and the mediator's answers clearly distinct and every answer block styled.

**Independent Test**: open a conversation with a long answer containing a heading, list, table, code block, and link, in both themes, at desktop, tablet, and phone widths; each element follows the tokens and nothing scrolls sideways.

### Tests for User Story 2 ⚠️

- [X] T023 [P] [US2] Playwright `tests/e2e/layout.spec.ts`:
  - at 1280 px the sidebar is visible beside the chat
  - at 768 and 320 px it is hidden behind a toggle named "Show conversations" whose `aria-expanded` follows the state; Escape and the close button close it and focus returns to the toggle; choosing a conversation closes it
  - at 320, 768, and 1280 px the chat screen has `scrollWidth <= clientWidth` after an answer with a table, a code block, a 200-character word, and a long URL (use `What is the difference between ser and estar?` and `HOSTILE-RENDER-TEST`)
  - the learner's message is aligned to inline-end and the answer to inline-start (bounding boxes)
  - while streaming, the Stop button and the streaming label are visible
- [X] T024 [P] [US2] Render test in `packages/ui/tests/chat.test.ts`: a streaming assistant `MessageBubble` shows the `chat.streaming` label with an `aria-hidden` icon, in `en` and `es`, with no missing key

### Implementation for User Story 2

- [X] T025 [US2] Build `Workspace` in `packages/ui/src/layout/Workspace.tsx`, per `contracts/ui-shell.md` "Drawer":
  - `sidebar` and `children` slots
  - below 64rem: a toggle with `aria-expanded`/`aria-controls`, Escape, backdrop click, close button, `inert` on the content behind it, and focus return
  - `onNavigate` closes it

  Add `shell.sidebar.open` ("Show conversations") and `shell.sidebar.close` to `en.json`/`es.json`, export `Workspace` from `packages/ui/src/index.ts`, and use it for the chat route in `apps/web/src/routes.tsx` (makes T023's drawer cases pass).
- [X] T026 [US2] Rewrite the layout sections of `packages/ui/src/styles/base.css` per `contracts/ui-shell.md` "Layout":
  - app shell at `100dvh`
  - sidebar at `--sidebar-inline-size` on `--color-surface-raised`
  - reading column at `--measure-reading`, centered
  - composer docked at the bottom of the column
  - the drawer below 64rem, sliding from `inset-inline-start` with `--duration-base`
  - `overflow-wrap: anywhere` on bubbles and titles; `pre` and `table` scroll inside their own box
- [X] T027 [US2] Style messages in `packages/ui/src/styles/base.css` per `contracts/ui-shell.md` "Messages":
  - user bubble on `--color-user-bubble`/`--color-on-user-bubble` at inline-end
  - answer on `--color-surface` with a `--color-divider` border and `--shadow-1`
  - refused: an inline-start `--color-danger` bar
  - interrupted note muted, with an icon
  - every `SafeBlock` element: headings with `--font-heading` and the `--text-*` scale; lists; quote with an inline-start bar; code with `--font-mono` and `--color-surface-raised`; table; and the link in `--color-primary`, underlined, with its destination in `--color-text-muted`
- [X] T028 [US2] Add the streaming indicator to `packages/ui/src/chat/MessageBubble.tsx`: the `chat.streaming` label with an `aria-hidden` `lucide-react` icon while `status === "streaming"`. Add `chat.streaming` to `en.json`/`es.json` (makes T024 pass). Add `aria-hidden` icons to the interrupted note
- [X] T029 [P] [US2] Style the composer and its buttons in `packages/ui/src/chat/Composer.tsx` and `base.css`:
  - Send is the primary button, with an `aria-hidden` send icon carrying `icon-directional`
  - Stop is the secondary button, with a stop icon
  - the textarea uses `--color-surface`, a `--color-border` boundary, and `--radius`

  Keep the accessible names "Send" and "Stop" unchanged.
- [X] T030 [P] [US2] Style the sidebar content in `base.css`, adding `aria-hidden` icons in `packages/ui/src/conversations/ConversationList.tsx`:
  - conversation rows with hover and selected on `--color-surface-strong`
  - the new-conversation button
  - the stats panel table (`packages/ui/src/stats/StatsPanel.tsx` class names only)
  - the model and effort settings, and the tone selector

**Checkpoint**: US1 and US2 work; `layout.spec.ts` green; the MVP (both P1 stories) is ready for a merge recommendation.

---

## Phase 5: User Story 3 - First-run, key entry, notices, and errors look finished too (Priority: P2)

**Goal**: Onboarding, key entry, settings, and every notice and error use the same tokens, are distinguishable without color, and every control shows its state and a visible focus.

**Independent Test**: walk onboarding to the first answer, then trigger each notice and error state, in both themes and in the pseudo-RTL interface.

### Tests for User Story 3 ⚠️

- [X] T031 [P] [US3] Playwright `tests/e2e/accessibility.spec.ts` with `@axe-core/playwright`, rule `color-contrast` only, in both `colorScheme` values. Screens:
  - onboarding, including its validation error
  - key entry, including the invalid-key error and the storage-unavailable notice
  - chat: an answer, a refusal, the guard notice (key-shaped text), the context notice (`HIGH-USAGE-TEST`), and a provider error
  - settings: languages, theme, key, data controls with the confirm step

  Zero violations (SC-002).
- [X] T032 [P] [US3] Focus walk in `tests/e2e/accessibility.spec.ts`: on each screen above, press Tab through every focusable element and assert each has a non-`none` `outline-style` with a width of at least 2px, in both themes, and that every control is reachable (SC-007)
- [X] T033 [P] [US3] Render test in `packages/ui/tests/screens.test.ts`: `GuardNotice`, `ContextNotice`, the provider-error alert in `ChatView`, and the form error in `Onboarding` each render an `aria-hidden` icon next to their text (FR-010)

### Implementation for User Story 3

- [X] T034 [US3] Define the button tiers and control states in `packages/ui/src/styles/base.css`, per `contracts/ui-shell.md` "Controls":
  - primary, secondary, quiet; hover, active, disabled (opacity plus `cursor: not-allowed`), loading
  - inputs and selects with a `--color-border` boundary
  - `:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }` on every interactive element

  Add a `className` tier to buttons in each component only where needed. Makes T032 pass.
- [X] T035 [US3] Style notices and errors per `contracts/ui-shell.md` "Notices and errors" in `base.css`, and add `aria-hidden` `lucide-react` icons in:
  - `packages/ui/src/chat/GuardNotice.tsx`: warning
  - `packages/ui/src/chat/ContextNotice.tsx`: info
  - `packages/ui/src/chat/ChatView.tsx`: provider error
  - `packages/ui/src/onboarding/Onboarding.tsx` and `packages/ui/src/key/KeyEntry.tsx`: form errors and the storage-unavailable notice
  - `packages/ui/src/settings/DataControls.tsx`: the failure state

  Makes T033 pass.
- [X] T036 [P] [US3] Style onboarding and key entry in `base.css`, with class names only in `packages/ui/src/onboarding/Onboarding.tsx` and `packages/ui/src/key/KeyEntry.tsx`:
  - a card on `--color-surface` with `--radius-lg` and `--shadow-1`
  - field groups; interest chips with `--radius-pill`
  - the two storage-mode choices as selectable cards with visible checked state (not color only)
  - the masked key hint in `--font-mono`
- [X] T037 [P] [US3] Style the settings screen in `base.css`, with class names only in `packages/ui/src/settings/*.tsx`: one card per section (languages, theme, key, data); the back button as a quiet button with its directional chevron; the delete-all confirmation step as a `--color-danger-container` panel with the confirm button in the danger style
- [X] T038 [US3] Add `@media (forced-colors: active)` (system colors, borders kept, decorative backgrounds and shadows dropped, focus kept) and `@media (prefers-reduced-motion: reduce)` (no transitions or animations, drawer included) blocks to `base.css`. Run `accessibility.spec.ts` until T031 passes, adjusting tokens only through `contracts/design-tokens.md` and T003

**Checkpoint**: US1-US3 work independently; `accessibility.spec.ts` green in all three browsers.

---

## Phase 6: User Story 4 - Text in any language and any direction renders well (Priority: P2)

**Goal**: Arabic and Latin text read well side by side, the pseudo-RTL interface mirrors every screen, missing scripts fall back to system fonts, and text never waits for fonts.

**Independent Test**: switch the interface to `ar-XB`, view a conversation that mixes vocalized Arabic and Latin text; also in English and Spanish.

### Tests for User Story 4 ⚠️

- [X] T039 [P] [US4] Extend `tests/e2e/layout.spec.ts`:
  - every screen (onboarding, key entry, chat with the drawer open and closed, settings) has `scrollWidth <= clientWidth` at 320, 768, and 1280 px with the interface in `en`, `es`, and `ar-XB` (SC-005)
  - in `ar-XB` the drawer opens from the right edge, and the back chevron and send icon are mirrored (computed `transform`)
- [X] T040 [P] [US4] Playwright `tests/e2e/fonts.spec.ts`:
  - on a page with only Latin text, no Arabic `.woff2` is requested
  - after a message containing `اَلسَّلَامُ عَلَيْكُمْ` is shown, the Arabic `.woff2` is requested from the app's own origin
  - with every `.woff2` response delayed 3 s by `page.route`, the onboarding text is visible within 1 s (FR-014, SC-009)
  - a vocalized Arabic line inside an answer has a bounding-box height of at least 1.6 × its font size and its bubble has no clipped overflow (`scrollHeight <= clientHeight` where the bubble sets a height)

### Implementation for User Story 4

- [X] T041 [US4] Add `icon-directional` to every directional `lucide-react` icon (back chevron in settings, send icon, drawer chevron) in `packages/ui/src/settings/*.tsx`, `packages/ui/src/chat/Composer.tsx`, and `packages/ui/src/layout/Workspace.tsx`. Confirm the drawer and bubble alignment use only logical properties in `base.css`
- [X] T042 [US4] Set `line-height: var(--leading-body)` on the reading column and bubbles in `base.css`, and make sure no text container in the message area has `overflow: hidden` or a fixed block size (research R5). Keep `dir="auto"` and the existing bidi isolation in `MessageBubble.tsx` unchanged

**Checkpoint**: all four stories work; `layout.spec.ts` and `fonts.spec.ts` green.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Release gates, documentation, and the manual review.

- [X] T043 [P] Run `pnpm --filter @tarjuman/web build && pnpm check:bundle-origins`. If `licenses.txt` or a font package adds a flagged host that is never fetched, add it to the inert-host list in `scripts/bundle-origins.ts` with a comment (research R10). Confirm `tests/e2e/network-assertions.spec.ts` still passes unchanged (SC-004)
- [X] T044 [P] Add a build assertion to `apps/web/tests/font-budget.test.ts`: the built `index.html` contains `<script src="/theme-init.js">` as a classic script before the module script, and `dist/theme-init.js` is byte-identical to `apps/web/public/theme-init.js`
- [X] T045 Run the full 001 suites (`pnpm test`, `pnpm test:redteam`, `pnpm test:e2e`) and list in the batch summary every existing test file whose selectors changed. Confirm no behavioral expectation changed (SC-008)
- [X] T046 [P] Update docs:
  - `ARCHITECTURE.md`: a "Styling and themes" section covering tokens, `light-dark()`, `theme-init.js`, the font budget, and the raw-color rule
  - `README.md`: the themes in the feature list
  - `CLAUDE.md` gotchas: only `tokens.css` may hold colors; `theme-init.js` must stay a classic script in `public/`; the theme key is `tarjuman.theme` and delete-all clears `tarjuman.*`
- [X] T047 Create `specs/003-visual-design/checklists/visual-review.md` from `quickstart.md` §3 (12 rows, each with result, browser, and date), run the automated part of `quickstart.md` §2, and record the results. The manual rows are for the owner (SC-010)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: depends on Setup. Blocks every story, because every style uses the tokens and fonts.
- **US1 (Phase 3)** and **US2 (Phase 4)**: both depend only on Foundational. They can run in either order. US1 is listed first because its `headerActions` slot (T021) is the place US2's drawer toggle also lives.
- **US3 (Phase 5)**: depends on Foundational. Its accessibility test (T031) covers the settings screen, so the theme control from US1 must exist for that screen to be complete.
- **US4 (Phase 6)**: depends on Foundational. T041 touches `Workspace.tsx` from US2.
- **Polish (Phase 7)**: depends on all stories.

### Within Each User Story

- Tests first; confirm they fail.
- Storage and helpers before components, components before wiring in `apps/web`.
- `base.css` is shared: tasks that edit it are not marked [P] against each other unless they edit distinct sections named in the task.

### Parallel Opportunities

- T002 with T001.
- T003, T004, and T005 together.
- In US1: T010-T015 together; T019 alongside T016-T018.
- In US2: T023 and T024 together; T029 and T030 after T026.
- In US3: T031-T033 together; T036 and T037 after T034.
- In US4: T039 and T040 together.
- In Polish: T043, T044, and T046 together.

---

## Parallel Example: User Story 1

```bash
# Tests for US1, all in different files:
Task: "Store tests in packages/storage-web/tests/theme-preference.test.ts"
Task: "Delete-all tests in packages/storage-web/tests/storage.test.ts and memory-storage.test.ts"
Task: "theme-init.js tests in apps/web/tests/theme-init.test.ts"
Task: "Render tests in packages/ui/tests/theme-switcher.test.ts"
Task: "Playwright tests/e2e/theme.spec.ts"

# Then, in parallel:
Task: "ThemePreferenceStore in packages/storage-web/src/theme-preference.ts"
Task: "applyTheme in packages/ui/src/theme/apply-theme.ts"
```

---

## Implementation Strategy

### MVP First (US1 + US2, both P1)

1. Phase 1 and Phase 2: tokens, fonts, and the checks.
2. Phase 3 (US1): themes that apply before first paint and persist.
3. Phase 4 (US2): the conversation experience restyled.
4. **Stop and validate**: run both independent tests and the full 001 suites. This is the first merge point.

### Incremental Delivery

1. Foundation, then US1, then validate: a themable but mostly unstyled app.
2. Add US2, then validate: the MVP, ready to merge.
3. Add US3, then validate: first run, notices, and accessibility checks.
4. Add US4, then validate: right-to-left and Arabic typography.
5. Polish: documentation, build checks, and the owner's manual review.

---

## Notes

- `packages/core` must not change. If a task seems to need it, stop and report.
- No new product function: the drawer and the theme control are the only new interactions, both required by the spec (FR-003b, FR-007).
- Every new string goes into both `en.json` and `es.json`. The new keys are `theme.*`, `shell.sidebar.open`, `shell.sidebar.close`, and `chat.streaming`.
- Commit points follow the owner's working agreement: stop at the end of each batch and suggest the commit.
