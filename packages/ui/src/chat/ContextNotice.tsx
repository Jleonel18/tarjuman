import { Info } from "lucide-react";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

export interface ContextNoticeProps {
  /** 0..1 share of the model's window the conversation uses. */
  ratio: number;
  onNewConversation: () => void;
}

/** Offers a fresh conversation when the window is nearly full. Nothing is ever cut silently. */
export function ContextNotice({ ratio, onNewConversation }: ContextNoticeProps): ReactElement {
  const { t, i18n } = useTranslation();
  const percent = new Intl.NumberFormat(i18n.language, { style: "percent", maximumFractionDigits: 0 });
  return (
    <div role="status" className="guard-notice">
      <Info aria-hidden="true" className="icon" />
      <p className="guard-notice__text">{t("chat.context.nearly_full", { percent: percent.format(ratio) })}</p>
      <button type="button" className="guard-notice__action" onClick={onNewConversation}>
        {t("chat.context.new")}
      </button>
    </div>
  );
}
