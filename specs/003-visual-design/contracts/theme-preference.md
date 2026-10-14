# Contract: Theme preference

How the theme choice is stored, applied before first paint, changed, and erased (FR-002, FR-003,
FR-003a, FR-003b; clarifications 1 and 3).

## Storage

```ts
export type ThemePreference = "light" | "dark" | "system";

/** packages/storage-web. The only writer of the key. */
export interface ThemePreferenceStore {
  /** "system" when the key is absent, unreadable, or holds anything else. Never throws. */
  get(): ThemePreference;
  /** Best effort: when storage is blocked, the choice applies to this page only. Never throws. */
  set(preference: ThemePreference): void;
}
```

- Key: `tarjuman.theme` in `localStorage`. Values exactly `light`, `dark`, `system`.
- `ThemePreference` is a UI type and is not exported from `packages/core`. The core does not
  change in this feature.

## First paint: `apps/web/public/theme-init.js`

- A classic script, not a module, loaded as `<script src="/theme-init.js"></script>` in `<head>`,
  before any stylesheet and before the app module. It is served from the app's own origin, so the
  CSP is unchanged.
- Behavior: read `localStorage.getItem("tarjuman.theme")` inside `try`/`catch`. If the value is
  `light` or `dark`, set `document.documentElement.dataset.theme` to it. Otherwise do nothing.
- It reads that one key only, writes nothing, and makes no request. It is under 1 KB and has no
  dependencies.
- A unit test reads the file and checks that its key and values match `ThemePreferenceStore`.

## Applying a change at run time

`applyTheme(preference, root = document.documentElement)` in `packages/ui`:

- `light` or `dark` sets `root.dataset.theme`; `system` deletes it.
- No reload, no re-render of the message list. A stream in progress is not interrupted.
- Under 100 ms from the user's choice to the new colors (SC-003).

## Controls

- `ThemeSwitcher` in `packages/ui/src/settings/ThemeSwitcher.tsx`, with two presentations:
  - `variant="compact"` in the app shell header, on every screen including onboarding and key
    entry: a labeled `<select>` with a theme icon.
  - `variant="full"` on the Settings screen: a radio group with a label and an icon for each
    choice.
- Props: `value: ThemePreference`, `onChange(preference)`, `variant`. Both variants change the
  same preference, and each reflects a change made in the other.
- Accessible name and option labels come from the catalogs (`theme.label`, `theme.light`,
  `theme.dark`, `theme.system`) in `en` and `es`. The control works with the keyboard and its
  focus is visible (FR-004).

## Erasure: "delete all my data"

- `IndexedDbStorage.clearAll()` and `MemoryStorage.clearAll()` remove every `localStorage` key
  that starts with `tarjuman.`.
- `IndexedDbStorage`'s emptiness check throws `StorageNotEmptyError` if any such key remains. The
  existing `DataController` then reports `not_verified` and never success (FR-003a).
- After a successful delete, the app also removes `data-theme`, so the screen follows the device
  again without a reload.
- `localStorage` is injectable (`{ getItem, setItem, removeItem, key, length }`) so the adapters'
  tests need no browser.

## Test obligations

- Store: round trip; an unknown or missing value reads as `system`; a throwing `localStorage`
  never throws to the caller.
- `theme-init.js`: matches the store's key and values; sets the attribute only for `light` and
  `dark`.
- Delete-all: removes the key; a key that survives makes `clearAll()` throw; the e2e test asserts
  `localStorage` is empty after delete-all.
- E2E: a dark device with no saved choice paints dark first; a saved `light` on a dark device
  paints light first, with no dark frame; switching takes effect with no reload; "follow system"
  tracks an emulated change of the device preference.
