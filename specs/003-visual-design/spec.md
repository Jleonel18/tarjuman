# Feature Specification: Visual Design

**Feature Branch**: `003-visual-design` (not created yet; the owner creates branches)

**Created**: 2026-10-12

**Status**: Draft

**Input**: User description: "Feature 003 visual-design: give the existing Tarjuman web UI a cohesive visual identity with light and dark themes, using the Stitch mockups as a visual guide only, not as a specification. Design tokens, light/dark theme following the system with a manual selector, self-hosted typography and icons (no remote resources, CSP unchanged), restyling of the components that already exist with logical CSS properties only, RTL-safe, all strings through i18n. Out of scope: any new product function and any engagement mechanic."

## Context

Feature `001-core-foundation` delivers a working but unstyled interface: a layout skeleton
(`packages/ui/src/styles/base.css`) and functional components for onboarding, key entry, chat,
and the conversation list. It was built to be correct, secure, and translatable, not to look
finished. This feature gives it one visual identity and a light and a dark theme.

**Planning order**: this feature is planned and built **after** `001-core-foundation` is complete,
so that it styles every screen 001 ships (including the stats panel, tone selector, and settings
that 001 adds in later phases) in one pass. Until then this spec is a record of intent.

**Design references** (in [mockups/](mockups/)): a light and a dark screen exported from Stitch,
each with its `DESIGN` description and generated HTML. They are **a visual guide, not a
requirement**. The mockups show many things Tarjuman does not do (see "Out of scope"); only the
visual language is borrowed: palette, typography, surfaces, shapes, spacing, and the general
arrangement of sidebar, reading column, and composer.

### Conflicts inside the references

The references disagree with each other. The decision for each is recorded here so the plan does
not have to rediscover it.

| Topic | Light reference | Dark reference | Decision |
|-------|-----------------|----------------|----------|
| Palette values | The `DESIGN.md` front matter (blue-tinted surfaces, primary `#003626`) and its prose (warm parchment `#FBF9F5`, primary `#134E3A`) contradict each other. The exported screen and HTML follow the **front matter**. | The front matter (`#0c1419` canvas, primary `#4edea3`) and its prose (`#0B1114` canvas, primary `#10B981`) also differ. | **The exported screens (front matter) win**, in both themes. Light: blue-tinted surfaces (`#f9f9ff` canvas) with deep emerald `#003626` as primary and brass `#fed65b` as secondary. Dark: `#0c1419` canvas with emerald `#4edea3` as primary and gold `#e9c349` as secondary. The values are the ones in each `DESIGN` front matter; the prose palettes (parchment, `#134E3A`, `#10B981`) are not used. *(Decided by the owner, 2026-10-12.)* |
| Base corner radius | Front matter and prose say `0.5rem`; the exported HTML's configuration says `0.25rem`. | `0.5rem` in both. | `0.5rem` base, `1rem` large panels, pill for chips (three of four sources agree). |
| Body typeface | Inter for body and labels, Plus Jakarta Sans for headings. | Plus Jakarta Sans for everything. | One pairing in both themes: Plus Jakarta Sans for headings, Inter for body and labels. Fewer font files, and the two themes stay visually consistent. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use the app in a light or dark theme that suits me (Priority: P1)

As a learner, the app opens in the theme my device prefers. If I want the other one, I switch it
in the interface, and the app remembers my choice on this device. Every screen reads clearly in
both themes.

**Why this priority**: the two themes are the core of this feature, and reading comfort during long
sessions is the reason they exist. Every other story builds on the theme tokens this one defines.

**Independent Test**: set the operating system to dark, open the app: it is dark. Switch to light in
the interface, reload: it is light. Choose "follow system" and it follows the device again.

**Acceptance Scenarios**:

1. **Given** no saved choice and a device set to dark, **When** I open the app, **Then** it shows
   the dark theme from the first paint, with no flash of the light one.
2. **Given** I chose a theme explicitly, **When** I reopen the app or the device preference
   changes, **Then** my choice is kept.
3. **Given** I chose "follow system", **When** the device switches between light and dark,
   **Then** the app switches with it without a reload.
4. **Given** any screen, **When** I view it in either theme, **Then** all text and controls meet
   the contrast target in SC-002.

---

### User Story 2 - A coherent look across the whole conversation experience (Priority: P1)

As a learner, the sidebar with my conversations, the reading column with messages, and the composer
look like one product: one palette, one type scale, consistent spacing and corners. My messages and
the mediator's answers are easy to tell apart, and long explanations are comfortable to read.

**Why this priority**: this is where learners spend almost all their time.

**Independent Test**: open a conversation containing a long answer with a heading, a list, a table,
a code block, and a link, in both themes and at desktop, tablet, and phone widths, and check each
element against the design tokens.

**Acceptance Scenarios**:

1. **Given** a conversation, **When** I view it, **Then** my messages and the mediator's answers are
   visually distinct without relying on color alone.
2. **Given** an answer rendered from the restricted block types, **When** I view it, **Then** every
   block type (paragraph, heading, list, quote, code, table, link) has a designed style, and links
   still show their real destination.
3. **Given** a narrow screen, **When** I open the app, **Then** the sidebar becomes a slide-out
   panel, the composer stays reachable at the bottom, and nothing scrolls sideways.
4. **Given** a message is streaming, **When** text arrives, **Then** the stop control and the
   streaming state are clearly visible in both themes.

---

### User Story 3 - First-run, key entry, notices, and errors look finished too (Priority: P2)

As a new learner, onboarding and key entry feel like part of the same product, and when something
goes wrong (an invalid key, a rate limit, a withheld key-shaped text, context nearly full) the
message is clear, calm, and unmistakable.

**Why this priority**: first impressions and error moments carry the most trust cost, but they are
visited less often than the conversation.

**Independent Test**: walk onboarding to the first answer, then trigger each notice and error
state, in both themes and in an RTL language.

**Acceptance Scenarios**:

1. **Given** first run, **When** I go through onboarding and key entry, **Then** the steps, the
   masked key display, and the "remember on this device" choice are styled with the same tokens.
2. **Given** each notice and error state the app can show, **When** it appears, **Then** it has a
   distinct, accessible treatment that does not depend on color alone.
3. **Given** a keyboard user, **When** they move through any screen, **Then** every interactive
   element has a visible focus indicator in both themes.

---

### User Story 4 - Text in any language and any direction renders well (Priority: P2)

As a learner whose languages include Arabic, or any right-to-left language, I read Arabic script
and Latin text side by side without clipping, broken alignment, or missing fonts, and the layout
mirrors correctly when the interface language is right-to-left.

**Why this priority**: Tarjuman is global by design (constitution principle VIII), and the mockups
are Arabic-centered. Typography is where this usually breaks.

**Independent Test**: switch the interface to Arabic and to pseudo-RTL, then view a conversation
that mixes Arabic and Latin with diacritics; also view it in English and Spanish.

**Acceptance Scenarios**:

1. **Given** Arabic text with diacritics, **When** it is shown, **Then** nothing is clipped and line
   spacing is generous enough for the marks.
2. **Given** a right-to-left interface language, **When** I view any screen, **Then** the sidebar,
   message alignment, composer, and directional icons mirror correctly.
3. **Given** text in a script the bundled fonts do not cover, **When** it is shown, **Then** it
   falls back to a system font and stays readable.
4. **Given** the app is offline or fonts are slow, **When** it loads, **Then** text is visible at
   once in a fallback font and is never blank while fonts load.

---

### Edge Cases

- A device preference change while a message is streaming: the theme changes without interrupting the stream.
- Browsers that report no color-scheme preference: the light theme is used.
- Forced-colors or high-contrast operating system modes: the interface stays usable.
- Reduced-motion preference: transitions and animations are removed or minimized.
- A very long conversation title, a very long single word, and a very long URL in a message do not break the layout.
- Text zoom to 200% and browser font-size changes keep the layout usable.
- A language whose interface strings are much longer than English (German, Spanish) does not overflow controls.
- Print is not styled; it is not a goal.

## Requirements *(mandatory)*

### Functional Requirements

**Themes**

- **FR-001**: The app MUST provide a light and a dark theme, defined as one set of named design
  tokens (colors, type scale, spacing, corner radii, elevation) with a value for each theme.
- **FR-002**: The app MUST apply the theme the device prefers by default, and MUST apply it before
  first paint so the wrong theme never flashes.
- **FR-003**: Users MUST be able to choose light, dark, or "follow system" in the interface, and
  the choice MUST persist on the device and apply on the next visit.
- **FR-004**: The theme control MUST be keyboard-operable, named for assistive technology, and its
  labels MUST come from the i18n catalogs.
- **FR-005**: No component MUST hard-code a color, size, or radius that belongs to a token.

**Look and structure**

- **FR-006**: The app shell, conversation list, message list, message bubbles, rendered answer
  blocks, composer, onboarding, key entry, notices, and error displays MUST all use the tokens.
  Screens that `001-core-foundation` adds before this feature is planned (stats panel, tone
  selector, settings) MUST be styled too.
- **FR-007**: The layout MUST adapt to desktop, tablet, and phone widths, following the arrangement
  of the references: a persistent sidebar on wide screens, a slide-out panel on narrower ones, one
  centered reading column with a comfortable line length, and a composer docked at the bottom.
- **FR-008**: Messages from the learner and from the mediator MUST be distinguishable by more than
  color (alignment, shape, or a label).
- **FR-009**: Every state a control can be in (default, hover, focus, active, disabled, loading,
  error) MUST be designed, and keyboard focus MUST always be visible.
- **FR-010**: Notices and errors MUST be distinguishable by more than color (icon or label).
- **FR-011**: Motion MUST be subtle and MUST honor the reduced-motion preference.

**Typography and scripts**

- **FR-012**: The app MUST bundle its typefaces and icons with the application and MUST NOT load
  any of them from a remote service.
- **FR-013**: The app MUST bundle a typeface suited to Arabic script and set it with extra line
  height so diacritics are not clipped, and MUST fall back to system fonts for anything else.
- **FR-014**: Text MUST be visible immediately in a fallback font while bundled fonts load.
- **FR-015**: Interface icons MUST be bundled, MUST have text alternatives (or be marked
  decorative), and directional icons MUST mirror in right-to-left languages.

**Constraints inherited from the constitution and `001-core-foundation`**

- **FR-016**: Stylesheets MUST use logical properties only, and the existing `lint:css` check MUST
  pass.
- **FR-017**: No user-facing string MAY be hard-coded; every new label comes from the i18n
  catalogs, in both English and Spanish, and passes the existing catalog checks.
- **FR-018**: The restyling MUST NOT weaken the content security policy, add any third-party
  script or remote resource, or add any path by which model output can load a remote resource.
  The production bundle MUST reference no origin other than the app's own and the selected
  provider's, as the existing origin check enforces.
- **FR-019**: The restyling MUST NOT change what the app does. No new product function, no new
  data collected, and no change to how output is sanitized.

### Out of scope

The references show things this feature MUST NOT build. They are listed so the plan does not drift:

- **Engagement mechanics** (forbidden by constitution principle I): accuracy or "precision" scores,
  progress bars, mastery or level badges, "Pro Learner" labels, streaks, "new words" counters, and
  pronunciation scores.
- **New product functions** (would each need their own specification): voice input, audio playback,
  pronunciation evaluation, sharing or exporting a session, saved topics and grammar units, an
  interactive glossary, phonetic or transliteration panels, scenario cards, suggestion chips, user
  avatars and accounts, a model version badge, and a right-hand inspector drawer.
- Decorative watermarks and ornament beyond what tokens express (optional, and only if inert and
  bundled).
- Printing, and any theme other than light and dark.

### Key Entities

- **Design token**: a named visual value (a color role, a type size, a spacing step, a radius, an
  elevation) with one value per theme. Components refer to tokens, never to raw values.
- **Theme preference**: the learner's choice (light, dark, or follow system), stored on the device
  with their other settings.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In both themes, 100% of screens use design tokens for color, type, spacing, and
  radius; a scan of the stylesheets finds no raw color value outside the token definitions.
- **SC-002**: All text and essential interface elements meet at least a 4.5:1 contrast ratio
  (3:1 for large text and component boundaries) in both themes, verified by an automated check on
  every screen.
- **SC-003**: Switching theme takes effect in under 100 ms with no reload, and a cold load with a
  dark device preference shows no light-theme flash.
- **SC-004**: With the app loaded, network logs show 0 requests to any origin other than the app's
  own and the selected provider's, including fonts and icons.
- **SC-005**: Every screen passes the existing right-to-left check and shows no horizontal scroll at
  320 px, 768 px, and 1280 px widths, in English, Spanish, and Arabic.
- **SC-006**: Arabic text with full diacritics renders with no clipped marks in a visual check.
- **SC-007**: A keyboard-only user reaches and operates every control on every screen, with a visible
  focus indicator on each.
- **SC-008**: Every existing automated test (unit, red-team, guardrails, end-to-end) still passes,
  and no test needed a change to its behavioral expectations.
- **SC-009**: The first view of a conversation shows readable text in under 2 seconds on a typical
  broadband connection, with fonts never blocking it.

## Assumptions

- This feature starts only after `001-core-foundation` is complete, and is built on its components.
- The theme preference is stored locally with the other settings, never sent anywhere, and is
  included in the single "delete all my data" action.
- The Arabic typeface is a freely licensed Naskh-style font (for example Noto Naskh Arabic or
  Amiri) whose license allows bundling; the choice is made in the plan.
- Typefaces and icon sets are chosen for permissive licenses compatible with bundling.
- Languages beyond English, Spanish, and Arabic rely on the system-font fallback in this version.
- The mockups are inspiration. Where a mockup shows something not listed in the requirements, it is
  not built.
- The "follow system" behavior relies on the browser exposing the color-scheme preference; without
  it, light is used.
