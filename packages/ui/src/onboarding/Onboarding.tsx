import { LEVEL_INFO, type Level, type ProfileIssue } from "@tarjuman/core";
import { useId, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { addInterest, removeInterest, type AddInterestFailure } from "./interests";
import { OFFERED_LANGUAGES, languageName } from "./languages";

export interface OnboardingDraft {
  mediationLanguage: string;
  targetLanguage: string;
  level: Level;
  interests: string[];
}

export interface OnboardingProps {
  /** Starting value for the explanation language, usually the interface language. */
  defaultMediationLanguage: string;
  /**
   * Checks a draft with the core's profile validation. The rules (such as "explanation language
   * and target language must differ") live in the core; the form only reports them.
   */
  validate: (draft: OnboardingDraft) => readonly ProfileIssue[];
  onComplete: (draft: OnboardingDraft) => void;
}

const INTEREST_ERROR_KEY: Record<AddInterestFailure, string> = {
  blank: "onboarding.interests.error.blank",
  too_long: "onboarding.interests.error.too_long",
  too_many: "onboarding.interests.error.too_many",
  duplicate: "onboarding.interests.error.duplicate",
};

/** First screen: who the learner is, so answers fit them (comprehensible input). */
export function Onboarding({ defaultMediationLanguage, validate, onComplete }: OnboardingProps): ReactElement {
  const { t, i18n } = useTranslation();
  const ids = { mediation: useId(), target: useId(), level: useId(), interest: useId(), error: useId() };
  const [mediationLanguage, setMediationLanguage] = useState(defaultMediationLanguage);
  const [targetLanguage, setTargetLanguage] = useState("");
  const [level, setLevel] = useState<Level>("unknown");
  const [interests, setInterests] = useState<string[]>([]);
  const [interestText, setInterestText] = useState("");
  const [interestError, setInterestError] = useState<AddInterestFailure | undefined>(undefined);

  const draft: OnboardingDraft = { mediationLanguage, targetLanguage, level, interests };
  const issues = targetLanguage === "" ? [] : validate(draft);
  const sameLanguage = issues.some((issue) => issue.code === "same_as_mediation");
  const otherIssues = issues.some((issue) => issue.code !== "same_as_mediation");
  const canContinue = targetLanguage !== "" && issues.length === 0;

  const options = (current: string) =>
    (OFFERED_LANGUAGES.includes(current) || current === "" ? OFFERED_LANGUAGES : [...OFFERED_LANGUAGES, current]).map(
      (code) => (
        <option key={code} value={code}>
          {languageName(code, i18n.language)}
        </option>
      ),
    );

  function add(): void {
    const result = addInterest(interests, interestText);
    if (result.ok) {
      setInterests(result.interests);
      setInterestText("");
      setInterestError(undefined);
    } else {
      setInterestError(result.reason);
    }
  }

  return (
    <section className="form" aria-labelledby={`${ids.mediation}-title`}>
      <h2 id={`${ids.mediation}-title`}>{t("onboarding.title")}</h2>
      <p>{t("onboarding.intro")}</p>

      <div className="form__field">
        <label htmlFor={ids.mediation}>{t("common.language.mediation")}</label>
        <select id={ids.mediation} value={mediationLanguage} onChange={(e) => setMediationLanguage(e.target.value)}>
          {options(mediationLanguage)}
        </select>
        <p className="form__hint">{t("onboarding.mediation.hint")}</p>
      </div>

      <div className="form__field">
        <label htmlFor={ids.target}>{t("common.language.target")}</label>
        <select
          id={ids.target}
          value={targetLanguage}
          aria-invalid={sameLanguage}
          aria-describedby={sameLanguage ? ids.error : undefined}
          onChange={(e) => setTargetLanguage(e.target.value)}
        >
          <option value="" disabled>
            {t("onboarding.target.placeholder")}
          </option>
          {options(targetLanguage)}
        </select>
        {sameLanguage ? (
          <p id={ids.error} role="alert" className="form__error">
            {t("onboarding.error.same_language")}
          </p>
        ) : null}
      </div>

      <div className="form__field">
        <label htmlFor={ids.level}>{t("onboarding.level.label")}</label>
        <select id={ids.level} value={level} onChange={(e) => setLevel(e.target.value as Level)}>
          {LEVEL_INFO.map((info) => (
            <option key={info.level} value={info.level}>
              {info.level === "unknown" ? t(info.descriptionKey) : `${info.level} · ${t(info.descriptionKey)}`}
            </option>
          ))}
        </select>
        <p className="form__hint">{t("onboarding.level.hint")}</p>
      </div>

      <div className="form__field">
        <label htmlFor={ids.interest}>{t("onboarding.interests.label")}</label>
        <div className="form__row">
          <input
            id={ids.interest}
            type="text"
            value={interestText}
            onChange={(e) => setInterestText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <button type="button" onClick={add}>
            {t("onboarding.interests.add")}
          </button>
        </div>
        <p className="form__hint">{t("onboarding.interests.hint")}</p>
        {interestError !== undefined ? (
          <p role="alert" className="form__error">
            {t(INTEREST_ERROR_KEY[interestError])}
          </p>
        ) : null}
        {interests.length > 0 ? (
          <ul className="chips">
            {interests.map((interest) => (
              <li key={interest} className="chips__item">
                <span>{interest}</span>
                <button
                  type="button"
                  aria-label={t("onboarding.interests.remove", { interest })}
                  onClick={() => setInterests(removeInterest(interests, interest))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {otherIssues ? (
        <p role="alert" className="form__error">
          {t("onboarding.error.invalid")}
        </p>
      ) : null}

      <button type="button" disabled={!canContinue} onClick={() => onComplete(draft)}>
        {t("common.next")}
      </button>
    </section>
  );
}
