/** The learner's theme choice. `packages/storage-web` stores the same three values. */
export type ThemePreference = "light" | "dark" | "system";

/** What `applyTheme` touches on <html>: only its `data-theme` attribute. */
export interface ThemeRoot {
  dataset: DOMStringMap;
}

/**
 * Applies a theme at run time, with no reload and no re-render (contracts/theme-preference.md).
 * `light` or `dark` pins the theme through `data-theme`, which tokens.css turns into one
 * `color-scheme`; `system` removes it, so the device decides again.
 */
export function applyTheme(preference: ThemePreference, root: ThemeRoot = document.documentElement): void {
  if (preference === "system") delete root.dataset["theme"];
  else root.dataset["theme"] = preference;
}
