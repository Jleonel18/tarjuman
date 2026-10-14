import { defaultLocalStorage, LOCAL_STORAGE_PREFIX, type LocalStorageLike } from "./local-storage";

/** The learner's theme choice. A UI type: it is not part of `packages/core`. */
export type ThemePreference = "light" | "dark" | "system";

/** Also read, before first paint, by apps/web/public/theme-init.js, which cannot import this module. */
export const THEME_STORAGE_KEY = `${LOCAL_STORAGE_PREFIX}theme`;

const VALUES: readonly string[] = ["light", "dark", "system"] satisfies ThemePreference[];

export interface ThemePreferenceStoreOptions {
  /** Defaults to the browser's `localStorage`; `undefined` means there is none. */
  localStorage?: LocalStorageLike | undefined;
}

/**
 * Keeps the theme choice on the device (contracts/theme-preference.md). It lives in
 * `localStorage`, not IndexedDB, because it must be readable synchronously before first paint.
 * The only writer of the key, and it never throws: blocked storage means the choice lasts for this
 * page only.
 */
export class ThemePreferenceStore {
  readonly #storage: LocalStorageLike | undefined;

  constructor(options: ThemePreferenceStoreOptions = {}) {
    this.#storage = "localStorage" in options ? options.localStorage : defaultLocalStorage();
  }

  /** "system" when the key is absent, unreadable, or holds anything else. Nothing is written back. */
  get(): ThemePreference {
    try {
      const value = this.#storage?.getItem(THEME_STORAGE_KEY);
      return value != null && VALUES.includes(value) ? (value as ThemePreference) : "system";
    } catch {
      return "system";
    }
  }

  set(preference: ThemePreference): void {
    try {
      this.#storage?.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Blocked storage: the choice applies to this page only, and the device decides on the next load.
    }
  }
}
