import { describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY, ThemePreferenceStore, type ThemePreference } from "../src/theme-preference";
import { FakeLocalStorage, throwingLocalStorage } from "./fake-local-storage";

describe("ThemePreferenceStore (contracts/theme-preference.md)", () => {
  it("stores under the key tarjuman.theme", () => {
    expect(THEME_STORAGE_KEY).toBe("tarjuman.theme");
    const local = new FakeLocalStorage();
    new ThemePreferenceStore({ localStorage: local }).set("dark");
    expect(local.items.get("tarjuman.theme")).toBe("dark");
  });

  it.each<ThemePreference>(["light", "dark", "system"])("round-trips %s", (preference) => {
    const local = new FakeLocalStorage();
    new ThemePreferenceStore({ localStorage: local }).set(preference);
    expect(new ThemePreferenceStore({ localStorage: local }).get()).toBe(preference);
  });

  it('reads an absent key as "system"', () => {
    expect(new ThemePreferenceStore({ localStorage: new FakeLocalStorage() }).get()).toBe("system");
  });

  it('reads any other value as "system" and does not write it back', () => {
    for (const junk of ["", "Dark", "blue", '"dark"', "light "]) {
      const local = new FakeLocalStorage({ "tarjuman.theme": junk });
      expect(new ThemePreferenceStore({ localStorage: local }).get()).toBe("system");
      expect(local.writes).toEqual([]);
      expect(local.items.get("tarjuman.theme")).toBe(junk);
    }
  });

  it("never throws when localStorage is blocked", () => {
    const store = new ThemePreferenceStore({ localStorage: throwingLocalStorage });
    expect(store.get()).toBe("system");
    expect(() => store.set("dark")).not.toThrow();
  });

  it('reads "system" when no localStorage exists at all', () => {
    const store = new ThemePreferenceStore({ localStorage: undefined });
    expect(store.get()).toBe("system");
    expect(() => store.set("light")).not.toThrow();
  });
});
