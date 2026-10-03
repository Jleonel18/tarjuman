import { DEFAULT_UI_LOCALE, SHIPPED_UI_LOCALES, directionOf, type Direction } from "@tarjuman/core";
import i18next, { type i18n as I18n } from "i18next";
import ICU from "i18next-icu";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import es from "./locales/es.json";

/**
 * Interface translations (FR-031). Catalogs are flat: keys contain dots (`common.save`), so the
 * key and namespace separators are turned off. Plurals and arguments use ICU MessageFormat.
 */

export type Catalog = Record<string, string>;

const SHIPPED_CATALOGS: Record<string, Catalog> = { en, es };

export interface CreateI18nOptions {
  locale?: string;
  /** Called when a key is not found, so a missing translation is loud in dev and tests. */
  onMissingKey?: (locale: string, key: string) => void;
}

/** Minimal view of `document.documentElement`, so this is testable without a DOM. */
export interface DocumentElementLike {
  lang: string;
  dir: string;
}

export async function createI18n(options: CreateI18nOptions = {}): Promise<I18n> {
  const instance = i18next.createInstance();
  await instance
    .use(new ICU())
    .use(initReactI18next)
    .init({
      lng: options.locale ?? DEFAULT_UI_LOCALE,
      fallbackLng: DEFAULT_UI_LOCALE,
      supportedLngs: false,
      resources: Object.fromEntries(
        SHIPPED_UI_LOCALES.map((locale) => [locale, { translation: SHIPPED_CATALOGS[locale] ?? {} }]),
      ),
      keySeparator: false,
      nsSeparator: false,
      interpolation: { escapeValue: false },
      returnNull: false,
      saveMissing: options.onMissingKey !== undefined,
      missingKeyHandler: (languages, _namespace, key) => {
        for (const language of languages) options.onMissingKey?.(language, key);
      },
    });
  return instance;
}

/**
 * Adds strings for a locale: a capability's catalog (namespaced `capability.<id>.*`) or a test
 * locale. Existing keys are never overwritten, so a capability cannot replace core strings.
 */
export function registerCatalog(instance: I18n, locale: string, catalog: Catalog): void {
  instance.addResourceBundle(locale, "translation", catalog, true, false);
}

export function hasLocale(instance: I18n, locale: string): boolean {
  return instance.hasResourceBundle(locale, "translation");
}

/** Sets `lang` and `dir` from the locale (Principle VIII); `dir` comes from core metadata. */
export function applyDocumentLocale(locale: string, root: DocumentElementLike): Direction {
  const direction = directionOf(locale);
  root.lang = locale;
  root.dir = direction;
  return direction;
}

/** Switches the UI language and keeps `lang`/`dir` in sync. */
export async function setUiLocale(instance: I18n, locale: string, root?: DocumentElementLike): Promise<Direction> {
  await instance.changeLanguage(locale);
  return root ? applyDocumentLocale(locale, root) : directionOf(locale);
}

/** The shipped catalog for a locale (used to derive the pseudo-RTL test locale in dev and tests). */
export function getShippedCatalog(locale: string): Catalog | undefined {
  return SHIPPED_CATALOGS[locale];
}
