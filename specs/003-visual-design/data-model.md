# Data Model: Visual Design

This feature adds one piece of stored data, the theme preference, and one design artifact, the
token set. It changes no entity in `001-core-foundation`'s data model and adds nothing to
IndexedDB.

## ThemePreference (stored)

| Field | Where | Values | Rules |
|-------|-------|--------|-------|
| `tarjuman.theme` | `localStorage` of the app's origin | `"light"`, `"dark"`, `"system"` | Absent means `"system"`. Any other value is read as `"system"` and is not written back. |

- **Owner**: `ThemePreferenceStore` in `packages/storage-web`. It is the only writer. Reads also
  happen in `apps/web/public/theme-init.js`, before the app loads
  ([contracts/theme-preference.md](contracts/theme-preference.md)).
- **Lifecycle**: absent → set (`light` | `dark` | `system`) → changed any number of times →
  removed by "delete all my data". Choosing `"system"` stores `"system"` explicitly, so the choice
  shows as made. Removing the key means the same thing.
- **Not tied to the profile**: it exists before onboarding (the header control works on the
  first screen) and survives deleting only the key. It is **not** kept when "delete all my data"
  runs (FR-003a).
- **Privacy**: it never leaves the device and is never part of model context.
- **Unavailable storage**: if `localStorage` throws (blocked site data), the choice applies for the
  current page only, and the device preference applies on the next load. Nothing is reported as
  an error.

## Applied theme (derived, not stored)

| Input | Result on `<html>` |
|-------|--------------------|
| preference `light` | `data-theme="light"`, `color-scheme: light` |
| preference `dark` | `data-theme="dark"`, `color-scheme: dark` |
| preference `system` or none | no `data-theme`; `color-scheme: light dark`, so the device decides |
| device reports no preference | light (the first value of every `light-dark()` token) |

## Design token set (design artifact)

Defined once in `packages/ui/src/styles/tokens.css`, the only stylesheet allowed to contain raw
color values. Components use only `var(--…)`. Names, roles, and both theme values are in
[contracts/design-tokens.md](contracts/design-tokens.md). The categories are:

| Category | Prefix | Per-theme value? |
|----------|--------|------------------|
| Color roles | `--color-` | yes, `light-dark(light, dark)` |
| Elevation | `--shadow-` | yes |
| Typography | `--font-`, `--text-`, `--leading-`, `--weight-` | no |
| Spacing | `--space-` | no |
| Radius | `--radius-` | no |
| Motion | `--duration-`, `--easing-` | no (reduced-motion overrides durations) |
| Layout | `--measure-`, `--sidebar-` | no |

Validation rules:

- Every text color role has a stated background role, and the pair meets 4.5:1 in both themes
  (3:1 for large text and component boundaries). A unit test computes this from `tokens.css`
  (SC-002).
- No stylesheet other than `tokens.css` contains a hex color, a named color, or a color function
  (SC-001). Stylelint enforces it.
