import type { ProfileIssue } from "@tarjuman/core";
import { useId, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { FormError } from "../forms/FormMessage";
import { OFFERED_LANGUAGES, languageName } from "../onboarding/languages";

export interface LanguageValues {
  uiLanguage: string;
  mediationLanguage: string;
  targetLanguage: string;
}

export interface LanguageSettingsProps extends LanguageValues {
  /** Interface languages on offer: the shipped ones, plus the pseudo-RTL test locale in dev builds. */
  uiLocales: readonly string[];
  /** The core's profile validation for the languages as they would become (mediation differs from target). */
  validate: (candidate: LanguageValues) => readonly ProfileIssue[];
  /** Called only with a change that passed `validate`. */
  onChange: (change: Partial<LanguageValues>) => void;
  disabled?: boolean | undefined;
}

/**
 * The three language settings, each changed on its own (FR-033): the interface, the language
 * explanations are written in, and the language being learned. A change that would make the
 * explanation language equal the target language is refused with a message and not applied.
 */
export function LanguageSettings({
  uiLanguage,
  mediationLanguage,
  targetLanguage,
  uiLocales,
  validate,
  onChange,
  disabled = false,
}: LanguageSettingsProps): ReactElement {
  const { t, i18n } = useTranslation();
  const ids = { ui: useId(), mediation: useId(), target: useId(), error: useId() };
  const [refused, setRefused] = useState(false);

  const current: LanguageValues = { uiLanguage, mediationLanguage, targetLanguage };
  function change(next: Partial<LanguageValues>): void {
    const issues = validate({ ...current, ...next });
    if (issues.some((issue) => issue.code === "same_as_mediation")) {
      setRefused(true);
      return;
    }
    setRefused(false);
    onChange(next);
  }

  const contentOptions = (selected: string) =>
    (OFFERED_LANGUAGES.includes(selected) ? OFFERED_LANGUAGES : [...OFFERED_LANGUAGES, selected]).map((code) => (
      <option key={code} value={code}>
        {languageName(code, i18n.language)}
      </option>
    ));

  return (
    <section className="language-settings settings-card" aria-label={t("settings.language.label")}>
      <h2 className="stats__title settings-card__title">{t("settings.language.title")}</h2>
      <p className="form__hint">{t("settings.language.hint")}</p>
      <div className="form__field">
        <label htmlFor={ids.ui}>{t("common.language.ui")}</label>
        <select
          id={ids.ui}
          value={uiLanguage}
          disabled={disabled}
          onChange={(e) => change({ uiLanguage: e.target.value })}
        >
          {uiLocales.map((code) => (
            <option key={code} value={code}>
              {languageName(code, code)}
            </option>
          ))}
        </select>
      </div>
      <div className="form__field">
        <label htmlFor={ids.mediation}>{t("common.language.mediation")}</label>
        <select
          id={ids.mediation}
          value={mediationLanguage}
          disabled={disabled}
          aria-describedby={refused ? ids.error : undefined}
          onChange={(e) => change({ mediationLanguage: e.target.value })}
        >
          {contentOptions(mediationLanguage)}
        </select>
      </div>
      <div className="form__field">
        <label htmlFor={ids.target}>{t("common.language.target")}</label>
        <select
          id={ids.target}
          value={targetLanguage}
          disabled={disabled}
          aria-describedby={refused ? ids.error : undefined}
          onChange={(e) => change({ targetLanguage: e.target.value })}
        >
          {contentOptions(targetLanguage)}
        </select>
      </div>
      {refused ? (
        <FormError id={ids.error}>{t("settings.language.same")}</FormError>
      ) : null}
    </section>
  );
}
