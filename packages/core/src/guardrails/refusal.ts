import { isShippedUiLocale, type ShippedUiLocale } from "../i18n/locales";

/** Looks up a catalog string. Supplied by the app, because catalogs live outside the core. */
export type RefusalTemplates = (key: string, locale: ShippedUiLocale) => string | undefined;

/** The catalog locale for a BCP 47 tag, if one ships (`es-MX` → `es`). */
export function shippedLocaleOf(tag: string): ShippedUiLocale | undefined {
  const primary = tag.split("-")[0] ?? tag;
  return isShippedUiLocale(primary) ? primary : undefined;
}

export interface RefusalInput {
  templates: RefusalTemplates;
  /** i18n key of the refusal template (the first loaded rule's). */
  templateKey: string;
  mediationLanguage: string;
  uiLanguage: string;
  /** What the model wrote after `REFUSE`; only used when the mediation language has no catalog. */
  modelBody: string;
}

/**
 * The refusal is always in the mediation language (FR-027, Principle VII). A shipped language gets
 * the deterministic template. Any other language gets the model's own refusal, written in that
 * language, and falls back to the interface-language template only if the model wrote nothing.
 * Returns an empty string only if no catalog has the key, which a test guards against.
 */
export function resolveRefusal(input: RefusalInput): string {
  const mediation = shippedLocaleOf(input.mediationLanguage);
  if (mediation) return input.templates(input.templateKey, mediation) ?? "";
  if (input.modelBody.trim() !== "") return input.modelBody;
  const ui = shippedLocaleOf(input.uiLanguage) ?? "en";
  return input.templates(input.templateKey, ui) ?? "";
}
