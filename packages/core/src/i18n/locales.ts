/**
 * Locale metadata (Principle VIII, FR-031/FR-032). The core only knows locale tags, text
 * direction, and message keys; catalogs and rendering live in `packages/ui`.
 */

/** Interface languages that ship in this feature. */
export const SHIPPED_UI_LOCALES = ["en", "es"] as const;
export type ShippedUiLocale = (typeof SHIPPED_UI_LOCALES)[number];

/** Pseudo-RTL locale used only to prove the layout mirrors; never offered to users. */
export const PSEUDO_RTL_LOCALE = "ar-XB";
export const TEST_ONLY_LOCALES = [PSEUDO_RTL_LOCALE] as const;

export const DEFAULT_UI_LOCALE: ShippedUiLocale = "en";

export type Direction = "ltr" | "rtl";

/** Primary language subtags written right to left. */
const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur", "ps", "sd", "ug", "yi", "dv", "ckb"]);

/** Direction of the primary language of a BCP 47 tag; works for any content language. */
export function directionOf(languageTag: string): Direction {
  const primary = languageTag.toLowerCase().split("-")[0] ?? "";
  return RTL_LANGUAGES.has(primary) ? "rtl" : "ltr";
}

export function isShippedUiLocale(tag: string): tag is ShippedUiLocale {
  return (SHIPPED_UI_LOCALES as readonly string[]).includes(tag);
}

/** Every locale the UI can render, including test-only ones when `includeTestLocales` is set. */
export function availableUiLocales(includeTestLocales = false): readonly string[] {
  return includeTestLocales ? [...SHIPPED_UI_LOCALES, ...TEST_ONLY_LOCALES] : SHIPPED_UI_LOCALES;
}

declare const messageKeyBrand: unique symbol;

/**
 * A translation key. Branded so user-facing text cannot be passed where a key is expected, which
 * keeps hard-coded strings out of the core (FR-031).
 */
export type MessageKey = string & { readonly [messageKeyBrand]: true };

export function messageKey(key: string): MessageKey {
  return key as MessageKey;
}
