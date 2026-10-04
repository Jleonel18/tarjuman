/**
 * Languages offered in the pickers. The list is only a convenience: the core accepts any BCP 47
 * tag for the target language. Names come from the browser's `Intl.DisplayNames`, written in the
 * interface language, so no language name is hard-coded.
 */
export const OFFERED_LANGUAGES: readonly string[] = [
  "ar",
  "de",
  "en",
  "es",
  "fr",
  "hi",
  "it",
  "ja",
  "ko",
  "pt",
  "ru",
  "tr",
  "zh",
];

export function languageName(code: string, uiLocale: string): string {
  try {
    return new Intl.DisplayNames([uiLocale], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
