import { SendHorizontal, Square } from "lucide-react";
import { useId, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";

export interface ComposerProps {
  /** True while an answer is streaming: Send becomes Stop (FR-004). */
  streaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

/** Enter sends, Shift+Enter adds a line. The text stays if sending is not possible. */
export function Composer({ streaming, onSend, onStop }: ComposerProps): ReactElement {
  const { t } = useTranslation();
  const id = useId();
  const [text, setText] = useState("");
  const canSend = !streaming && text.trim() !== "";

  function send(): void {
    if (!canSend) return;
    onSend(text);
    setText("");
  }

  return (
    <div className="composer">
      <label htmlFor={id} className="composer__label visually-hidden">
        {t("chat.composer.label")}
      </label>
      <textarea
        id={id}
        className="composer__input"
        placeholder={t("chat.composer.label")}
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
      />
      {streaming ? (
        <button type="button" className="button button--secondary" onClick={onStop}>
          <Square aria-hidden="true" className="icon" />
          <span>{t("common.stop")}</span>
        </button>
      ) : (
        <button type="button" className="button button--primary" disabled={!canSend} onClick={send}>
          <SendHorizontal aria-hidden="true" className="icon icon-directional" />
          <span>{t("chat.send")}</span>
        </button>
      )}
    </div>
  );
}
