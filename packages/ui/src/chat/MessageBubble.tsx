import type { MessageStatus, SafeBlock } from "@tarjuman/core";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { directionRuns } from "./bidi";
import { SafeBlockRenderer } from "./SafeBlockRenderer";

/**
 * What the chat shows for one message. Assistant text arrives already rendered to `SafeBlock`s by
 * the OutputGuard, so this layer never sees raw model Markdown. User text is plain.
 */
export type ChatMessage =
  | { id: string; author: "user"; text: string }
  | { id: string; author: "assistant"; status: MessageStatus; blocks: readonly SafeBlock[] };

export interface MessageBubbleProps {
  message: ChatMessage;
  /** Offered on an interrupted answer; the user decides to retry (no automatic retry). */
  onRetry?: (() => void) | undefined;
}

export function MessageBubble({ message, onRetry }: MessageBubbleProps): ReactElement {
  const { t } = useTranslation();

  if (message.author === "user") {
    return (
      <article className="bubble bubble--user" aria-label={t("chat.you")} dir="auto">
        <p className="bubble__text" dir="auto">
          {directionRuns(message.text).map((run, i) => (run.isolate ? <bdi key={i}>{run.text}</bdi> : run.text))}
        </p>
      </article>
    );
  }

  return (
    <article
      className={`bubble bubble--assistant bubble--${message.status}`}
      dir="auto"
      aria-label={t("chat.assistant")}
      aria-busy={message.status === "streaming"}
    >
      <SafeBlockRenderer blocks={message.blocks} />
      {message.status === "interrupted" ? (
        <p className="bubble__note">
          {t("chat.interrupted")}
          {onRetry ? (
            <>
              {" "}
              <button type="button" onClick={onRetry}>
                {t("common.retry")}
              </button>
            </>
          ) : null}
        </p>
      ) : null}
    </article>
  );
}
