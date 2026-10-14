/** The part of `localStorage` the adapters use, so tests can inject a double. */
export interface LocalStorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Every key Tarjuman writes to `localStorage` starts with this, so "delete all" covers future keys too. */
export const LOCAL_STORAGE_PREFIX = "tarjuman.";

/**
 * The browser's `localStorage`, or undefined where there is none. Reading the global itself can
 * throw when site data is blocked, so that counts as none.
 */
export function defaultLocalStorage(): LocalStorageLike | undefined {
  try {
    return (globalThis as { localStorage?: LocalStorageLike }).localStorage;
  } catch {
    return undefined;
  }
}

/** The Tarjuman keys present. Blocked storage holds nothing we can reach, so it reads as none. */
export function tarjumanKeys(storage: LocalStorageLike | undefined): string[] {
  if (!storage) return [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith(LOCAL_STORAGE_PREFIX)) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

/** Removes every Tarjuman key and leaves other keys alone. Never throws. */
export function removeTarjumanKeys(storage: LocalStorageLike | undefined): void {
  for (const key of tarjumanKeys(storage)) {
    try {
      storage?.removeItem(key);
    } catch {
      // Blocked storage: the emptiness check that follows reports whatever is left.
    }
  }
}
