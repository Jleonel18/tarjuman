import { TriangleAlert } from "lucide-react";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

/** What a turn can tell the learner about its searches (005 FR-010). */
export type SearchNoticeCode = "search_incomplete" | "search_key_error" | "search_quota" | "search_declined";

const MESSAGE_KEYS: Record<SearchNoticeCode, string> = {
  search_incomplete: "chat.notice.search_incomplete",
  search_key_error: "chat.notice.search_key_error",
  search_quota: "chat.notice.search_quota",
  search_declined: "chat.notice.search_declined",
};

export interface SearchNoticeProps {
  code: SearchNoticeCode;
  onDismiss: () => void;
  /** Offered for a key problem: the fix is in the search settings. */
  onOpenSearchSettings?: (() => void) | undefined;
}

/** Tells the learner a search did not fully work. Polite, not blocking; the answer is still shown. */
export function SearchNotice({ code, onDismiss, onOpenSearchSettings }: SearchNoticeProps): ReactElement {
  const { t } = useTranslation();
  return (
    <div role="status" className="guard-notice">
      <TriangleAlert aria-hidden="true" className="icon" />
      <p className="guard-notice__text">{t(MESSAGE_KEYS[code])}</p>
      {code === "search_key_error" && onOpenSearchSettings ? (
        <button type="button" className="button button--quiet guard-notice__action" onClick={onOpenSearchSettings}>
          {t("chat.open_search_settings")}
        </button>
      ) : null}
      <button type="button" className="button button--quiet guard-notice__action" onClick={onDismiss}>
        {t("chat.guard.dismiss")}
      </button>
    </div>
  );
}
