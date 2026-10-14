import type { LocalStorageLike } from "../src/local-storage";

/** An in-memory `localStorage` double. `stuck` makes `removeItem` do nothing, to fake a key that survives. */
export class FakeLocalStorage implements LocalStorageLike {
  readonly items = new Map<string, string>();
  readonly writes: [string, string][] = [];
  stuck = false;

  constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) this.items.set(key, value);
  }

  get length(): number {
    return this.items.size;
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes.push([key, value]);
    this.items.set(key, value);
  }

  removeItem(key: string): void {
    if (!this.stuck) this.items.delete(key);
  }
}

/** A `localStorage` whose every method throws, as a browser with blocked site data does. */
export const throwingLocalStorage: LocalStorageLike = {
  get length(): number {
    throw new Error("SecurityError");
  },
  key: () => {
    throw new Error("SecurityError");
  },
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};
