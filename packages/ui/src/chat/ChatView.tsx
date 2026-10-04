import type { ProviderErrorCode } from "@tarjuman/core";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { describeProviderError } from "../errors/provider-error-messages";
import { Composer } from "./Composer";
import { MessageBubble, type ChatMessage } from "./MessageBubble";

export interface ChatViewProps {
  messages: readonly ChatMessage[];
  streaming: boolean;
  /** Masked key hint shown in the header (FR-015); never the key. */
  keyHint?: string | undefined;
  /** The last turn's provider error, if it failed. */
  error?: { code: ProviderErrorCode; retryAfterSeconds?: number | undefined } | undefined;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Retries the interrupted answer: a new message, started by the user. */
  onRetry: (messageId: string) => void;
  onOpenKeySettings: () => void;
}

export function ChatView({
  messages,
  streaming,
  keyHint,
  error,
  onSend,
  onStop,
  onRetry,
  onOpenKeySettings,
}: ChatViewProps): ReactElement {
  const { t } = useTranslation();
  const failure = error ? describeProviderError(error.code, error.retryAfterSeconds) : undefined;

  return (
    <section className="chat" aria-label={t("chat.label")}>
      {keyHint !== undefined ? <p className="chat__key form__hint">{t("chat.key_hint", { hint: keyHint })}</p> : null}

      <div className="chat__log" role="log" aria-live="polite">
        {messages.length === 0 ? <p className="form__hint">{t("chat.empty")}</p> : null}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onRetry={
              message.author === "assistant" && message.status === "interrupted" && !streaming
                ? () => onRetry(message.id)
                : undefined
            }
          />
        ))}
      </div>

      {failure ? (
        <p role="alert" className="form__error">
          {t(failure.messageKey, failure.params)}
          {failure.action === "open_key_settings" ? (
            <>
              {" "}
              <button type="button" onClick={onOpenKeySettings}>
                {t("chat.open_key_settings")}
              </button>
            </>
          ) : null}
        </p>
      ) : null}

      <Composer streaming={streaming} onSend={onSend} onStop={onStop} />
    </section>
  );
}
