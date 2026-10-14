# Contract: App shell, layout, and component styling

What the restyle must deliver on screen, beyond the tokens (FR-006 to FR-011, FR-015).

## App shell

- `AppShell` gains a `headerActions?: ReactNode` slot. The web app passes the compact
  `ThemeSwitcher` there, so the control appears on every screen (FR-003b).
- The drawer button belongs to the chat screen, not the header: on narrow layouts it sits at the
  top of the reading column, above the messages (decided during implementation, 2026-10-14, so
  that `Workspace` owns the drawer's state and its focus return).

## Layout (FR-007)

| Width | Arrangement |
|-------|-------------|
| ≥ 64rem | Persistent sidebar (`--sidebar-inline-size`) on the inline-start side, then a reading column centered within the rest, at most `--measure-reading` wide. The composer is docked at the bottom of the column. |
| < 64rem | The sidebar becomes a drawer, closed by default. The reading column takes the full width with `--space-3` gutters. The composer stays docked at the bottom. |

- No horizontal scroll at 320, 768, or 1280 px, in any interface language (SC-005). Long words,
  titles, and URLs wrap (`overflow-wrap: anywhere`). Code blocks and tables scroll inside their
  own box.
- Full-height regions use `100dvh`.

## Drawer (narrow layouts)

- The toggle is a `<button>` at the top of the reading column with `aria-expanded` and
  `aria-controls`, named from `shell.sidebar.open`. The close button inside the drawer is named
  from `shell.sidebar.close`.
- The drawer slides in from the inline-start edge, so it opens from the right in right-to-left
  layouts. Escape, the close button, and a click on the backdrop close it, and focus returns to
  the toggle. Choosing a conversation also closes it.
- While it is open, the content behind it is `inert`.
- Its movement uses `--duration-base`, which reduced motion shortens to near zero.

## Messages (FR-008, US2)

| Element | Treatment |
|---------|-----------|
| The learner's message | Aligned to inline-end, `--color-user-bubble` background, `--radius-lg` with a smaller radius on the inline-end corner nearest the edge, and keeps its "You" accessible label |
| The mediator's answer | Aligned to inline-start, `--color-surface` with a `--color-divider` border and `--shadow-1`, and keeps its "Tarjuman" label. Long answers read at `--leading-body`. |
| Streaming | A visible streaming indicator (label plus icon) and the Stop button styled as a secondary action; both readable in both themes (US2-4) |
| Interrupted | The existing note, styled as muted text with an icon |
| Refused | An inline-start bar in `--color-danger` **and** the existing refusal wording |

Every `SafeBlock` type gets a designed style: paragraph, heading levels 1-6 (mapped to
`--text-*` with `--font-heading`), lists, quote (inline-start bar), code (`--font-mono`,
`--color-surface-raised`, its own scroll), table (bordered, header row raised), and link (primary
color, underlined, with the existing visible destination in `--color-text-muted`).

## Notices and errors (FR-010, US3-2)

| Kind | Treatment |
|------|-----------|
| Guard notice (key withheld) | `--color-notice` panel, a warning icon, the text, and the dismiss button |
| Context nearly full | Same notice style with an info icon and the "new conversation" action |
| Provider error | `--color-danger-container` panel, an error icon, the message, and its action button |
| Form validation error | `--color-danger` text with an error icon, linked to its field by `aria-describedby` |
| Storage unavailable | Notice style with an info icon |

Every kind has an icon and wording, so none relies on color alone. Icons beside text are
`aria-hidden`.

## Controls (FR-009)

- Buttons have three tiers: primary (filled with `--color-primary`), secondary (bordered), and
  quiet (text only, for dismiss and back).
- Each control has a designed default, hover, active, disabled (reduced opacity plus
  `cursor: not-allowed`, never only a color change), loading, and error state.
- Focus: `:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }` on
  every interactive element, in both themes (SC-007). No `outline: none` without a replacement.
- Inputs and selects use a `--color-border` boundary (at least 3:1), `--radius`, and
  `--color-surface`.

## Screens styled (FR-006)

Onboarding, key entry, chat (conversation list, message list, composer, notices), the stats
panel, the model and effort settings, the tone selector, and the settings screen: languages,
theme, key settings, and data controls.

## Strings

New catalog keys, in `en` and `es`: `theme.label`, `theme.light`, `theme.dark`, `theme.system`,
`shell.sidebar.open`, `shell.sidebar.close`, `chat.streaming`. No other user-facing text is added.
