import { useEffect, useId, useRef, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { InertLink } from "./InertLink";
import { providerName } from "../key/provider-names";

export interface SearchConsentDialogProps {
  /** The search source the model asked to use, e.g. `youtube`. */
  sourceId: string;
  /** The learner agrees: consent is recorded and the message is sent again as a new turn. */
  onAgree: () => void;
  /** The learner declines: nothing is sent and nothing is searched. */
  onCancel: () => void;
}

/** Where each source's terms and privacy policy live. Links only: nothing here is fetched. */
const TERMS: Readonly<Record<string, { terms: string; privacy: string }>> = {
  youtube: { terms: "https://www.youtube.com/t/terms", privacy: "https://policies.google.com/privacy" },
};

/**
 * The consent step before the first search (005 FR-019; the YouTube API terms require it). It says
 * what leaves the device and where it goes, and links the source's terms and privacy policy as
 * inert links. A native modal `<dialog>` traps focus and closes on Escape, which counts as Cancel.
 */
export function SearchConsentDialog({ sourceId, onAgree, onCancel }: SearchConsentDialogProps): ReactElement {
  const { t } = useTranslation();
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const source = providerName(t, sourceId);
  const links = TERMS[sourceId];

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="consent"
      aria-labelledby={titleId}
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={titleId} className="consent__title">
        {t("consent.title", { source })}
      </h2>
      <p>{t("consent.intro", { source })}</p>
      <h3 className="consent__heading">{t("consent.sent_heading")}</h3>
      <ul className="consent__list">
        <li>{t("consent.sent_terms")}</li>
        <li>{t("consent.sent_language")}</li>
        <li>{t("consent.sent_key")}</li>
      </ul>
      <p>{t("consent.not_sent")}</p>
      <p>{t("consent.where")}</p>
      {links ? (
        <ul className="consent__list">
          <li>
            <InertLink destination={links.terms} destinationDisplay={links.terms}>
              {t("consent.terms_link")}
            </InertLink>
          </li>
          <li>
            <InertLink destination={links.privacy} destinationDisplay={links.privacy}>
              {t("consent.privacy_link")}
            </InertLink>
          </li>
        </ul>
      ) : null}
      <div className="consent__actions">
        <button type="button" className="button button--primary" onClick={onAgree}>
          {t("consent.agree")}
        </button>
        <button type="button" className="button button--secondary" onClick={onCancel}>
          {t("consent.cancel")}
        </button>
      </div>
    </dialog>
  );
}
