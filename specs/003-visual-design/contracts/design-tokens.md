# Contract: Design tokens

The named visual values every component uses (FR-001, FR-005). They are defined once in
`packages/ui/src/styles/tokens.css`. Colors and shadows hold both themes as
`light-dark(<light>, <dark>)`, and the values come from each mockup's `DESIGN` front matter
(spec, "Conflicts inside the references"). Adding, renaming, or removing a token is a change to
this contract.

## Color roles

Contrast is the WCAG ratio of the pair in the "Used on" column, computed from these values.
"Text" pairs need 4.5:1; "boundary" pairs need 3:1.

| Token | Role | Light | Dark | Used on (contrast light / dark) |
|-------|------|-------|------|---------------------------------|
| `--color-canvas` | page background | `#f9f9ff` | `#0c1419` | — |
| `--color-surface` | cards, bubbles of the mediator, inputs | `#ffffff` | `#151d22` | — |
| `--color-surface-raised` | sidebar, header, composer | `#e7eeff` | `#192126` | — |
| `--color-surface-strong` | hover and selected rows | `#dee8ff` | `#232b30` | — |
| `--color-text` | body text | `#111c2d` | `#dbe4eb` | canvas: text 16.3 / 14.4 |
| `--color-text-muted` | hints, metadata, the link destination | `#404944` | `#bbcabf` | raised: text 8.0 / 9.6 |
| `--color-primary` | primary buttons, links, focus ring | `#003626` | `#4edea3` | canvas: text 12.9 / 10.9 |
| `--color-on-primary` | text on primary | `#ffffff` | `#003824` | primary: text 13.5 / 7.7 |
| `--color-user-bubble` | the learner's messages | `#134e3a` | `#005236` | — |
| `--color-on-user-bubble` | text in the learner's messages | `#ffffff` | `#dbe4eb` | user bubble: text 9.6 / 7.2 |
| `--color-notice` | guard and context notices | `#fed65b` | `#e9c349` | — |
| `--color-on-notice` | text in notices | `#574500` | `#3c2f00` | notice: text 6.6 / 7.7 |
| `--color-danger` | errors, refusal marker | `#ba1a1a` | `#ffb4ab` | canvas: text 6.2 / 11.0 |
| `--color-danger-container` | error panels | `#ffdad6` | `#93000a` | — |
| `--color-on-danger-container` | text in error panels | `#93000a` | `#ffdad6` | danger container: text 7.2 / 7.2 |
| `--color-scrim` | the backdrop behind a modal dialog, shown at half opacity (005) | `#111c2d` | `#000000` | — |
| `--color-border` | input and control borders | `#707974` | `#86948a` | canvas: boundary 4.3 / 5.9 |
| `--color-divider` | decorative separators only, never a control's only boundary | `#c0c9c2` | `#3c4a42` | not a boundary |

## Elevation

| Token | Light | Dark |
|-------|-------|------|
| `--shadow-1` | `0 1px 2px rgb(17 28 45 / 0.08)` | `0 1px 2px rgb(0 0 0 / 0.4)` |
| `--shadow-2` | `0 4px 16px rgb(17 28 45 / 0.12)` | `0 4px 16px rgb(0 0 0 / 0.5)` |

## Typography

| Token | Value |
|-------|-------|
| `--font-body` | `"Inter Variable", "Noto Naskh Arabic Variable", system-ui, sans-serif` |
| `--font-heading` | `"Plus Jakarta Sans Variable", "Noto Naskh Arabic Variable", system-ui, sans-serif` |
| `--font-mono` | `ui-monospace, "SF Mono", Menlo, Consolas, monospace` |
| `--text-sm` / `--text-md` / `--text-lg` / `--text-xl` / `--text-2xl` | `0.875rem` / `1rem` / `1.125rem` / `1.25rem` / `1.5rem` |
| `--leading-body` / `--leading-tight` | `1.7` / `1.25` |
| `--weight-regular` / `--weight-medium` / `--weight-bold` | `400` / `600` / `700` |

Sizes are in `rem`, so browser font-size changes and 200% zoom scale everything (edge cases).

## Spacing, radius, motion, layout

| Token | Value |
|-------|-------|
| `--space-1` … `--space-6` | `0.25rem`, `0.5rem`, `1rem`, `1.5rem`, `2rem`, `3rem` (1-4 keep their 001 values) |
| `--radius-sm` / `--radius` / `--radius-lg` / `--radius-pill` | `0.25rem` / `0.5rem` / `1rem` / `999rem` |
| `--duration-fast` / `--duration-base` | `120ms` / `200ms`; `0.01ms` under `prefers-reduced-motion: reduce` |
| `--easing-standard` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--measure-reading` | `46rem` |
| `--sidebar-inline-size` | `18rem` |

The layout breakpoint is `64rem`. It is a literal in the media queries, because custom properties
cannot be used there.

## Rules

1. Only `tokens.css` may contain hex values, named colors, or color functions. Stylelint fails
   any other stylesheet that does (SC-001).
2. Components may use `color-mix()` only to mix two tokens, never a token with a literal color.
3. A new text-on-background pair must be added to the "Used on" column and to the contrast unit
   test, and must meet the ratios above in both themes.
4. `--color-divider` never carries meaning on its own: states and boundaries use
   `--color-border`, a shape, or a label (FR-008, FR-010).
5. Under `forced-colors: active`, components fall back to system colors and keep visible borders
   and focus outlines (edge cases).
