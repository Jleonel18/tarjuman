import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

/** What the input guard can tell the learner. One code today; the map keeps keys literal. */
export type GuardNoticeCode = "key_shape_detected";

const MESSAGE_KEYS: Record<GuardNoticeCode, string> = {
  key_shape_detected: "chat.guard.key_shape_detected",
};

export interface GuardNoticeProps {
  code: GuardNoticeCode;
  onDismiss: () => void;
}

/** Tells the learner that part of their message was withheld (FR-011). Polite, not blocking. */
export function GuardNotice({ code, onDismiss }: GuardNoticeProps): ReactElement {
  const { t } = useTranslation();
  return (
    <div role="status" className="guard-notice">
      <p className="guard-notice__text">{t(MESSAGE_KEYS[code])}</p>
      <button type="button" onClick={onDismiss}>
        {t("chat.guard.dismiss")}
      </button>
    </div>
  );
}
