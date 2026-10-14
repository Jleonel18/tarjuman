import { LEVEL_INFO, type Level, type ProfileIssue } from "@tarjuman/core";
import { X } from "lucide-react";
import { useId, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { FormError } from "../forms/FormMessage";
import { ProviderChoice } from "../key/ProviderChoice";
import { addInterest, removeInterest, type AddInterestFailure } from "./interests";
import { OFFERED_LANGUAGES, languageName } from "./languages";

export interface OnboardingDraft {
  mediationLanguage: string;
  targetLanguage: string;
  level: Level;
  interests: string[];
  /** The chosen AI provider. Absent when the build offers only one, so there is nothing to choose (004). */
  providerId?: string | undefined;
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
  /** Provider ids the build offers. With more than one, the learner must pick (004 FR-001). */
  providerIds?: readonly string[] | undefined;
}

const INTEREST_ERROR_KEY: Record<AddInterestFailure, string> = {
  blank: "onboarding.interests.error.blank",
  too_long: "onboarding.interests.error.too_long",
  too_many: "onboarding.interests.error.too_many",
  duplicate: "onboarding.interests.error.duplicate",
};

/** First screen: who the learner is, so answers fit them (comprehensible input). */
export function Onboarding({ defaultMediationLanguage, validate, onComplete, providerIds = [] }: OnboardingProps): ReactElement {
  const { t, i18n } = useTranslation();
  const ids = { mediation: useId(), target: useId(), level: useId(), interest: useId(), error: useId() };
  const [mediationLanguage, setMediationLanguage] = useState(defaultMediationLanguage);
  const [targetLanguage, setTargetLanguage] = useState("");
  const [level, setLevel] = useState<Level>("unknown");
  const [interests, setInterests] = useState<string[]>([]);
  const [interestText, setInterestText] = useState("");
  const [interestError, setInterestError] = useState<AddInterestFailure | undefined>(undefined);
  const [providerId, setProviderId] = useState<string | undefined>(undefined);

  // No provider is preselected: with a choice to make, Next waits for it, and the provider and model
  // issues that an empty choice causes are not shown as errors.
  const mustChoose = providerIds.length > 1;
  const chosen = !mustChoose || providerId !== undefined;
  const draft: OnboardingDraft = { mediationLanguage, targetLanguage, level, interests, ...(mustChoose && { providerId }) };
  const issues = (targetLanguage === "" ? [] : validate(draft)).filter(
    (issue) => chosen || (issue.path !== "providerId" && issue.path !== "modelId"),
  );
  const sameLanguage = issues.some((issue) => issue.code === "same_as_mediation");
  const otherIssues = issues.some((issue) => issue.code !== "same_as_mediation");
  const canContinue = targetLanguage !== "" && chosen && issues.length === 0;

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
    <section className="form screen-card" aria-labelledby={`${ids.mediation}-title`}>
      <h2 id={`${ids.mediation}-title`}>{t("onboarding.title")}</h2>
      <p className="screen-card__intro">{t("onboarding.intro")}</p>

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
          <FormError id={ids.error}>{t("onboarding.error.same_language")}</FormError>
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
          <FormError>{t(INTEREST_ERROR_KEY[interestError])}</FormError>
        ) : null}
        {interests.length > 0 ? (
          <ul className="chips">
            {interests.map((interest) => (
              <li key={interest} className="chips__item">
                <span>{interest}</span>
                <button
                  type="button"
                  className="button button--quiet button--icon chips__remove"
                  aria-label={t("onboarding.interests.remove", { interest })}
                  onClick={() => setInterests(removeInterest(interests, interest))}
                >
                  <X aria-hidden="true" className="icon" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <ProviderChoice providerIds={providerIds} value={providerId} onChange={setProviderId} />

      {otherIssues ? (
        <FormError>{t("onboarding.error.invalid")}</FormError>
      ) : null}

      <button type="button" className="button button--primary form__submit" disabled={!canContinue} onClick={() => onComplete(draft)}>
        {t("common.next")}
      </button>
    </section>
  );
}
