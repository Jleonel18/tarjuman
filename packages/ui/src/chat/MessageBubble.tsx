import type { ExpiredResourceCard, MessageStatus, ResourceCard, SafeBlock, StoredResourceCard } from "@tarjuman/core";
import { CircleAlert, LoaderCircle } from "lucide-react";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { directionRuns } from "./bidi";
import { ResourceCards } from "./ResourceCards";
import { SafeBlockRenderer } from "./SafeBlockRenderer";

/**
 * What the chat shows for one message. Assistant text arrives already rendered to `SafeBlock`s by
 * the OutputGuard, so this layer never sees raw model Markdown. User text is plain.
 */
export type ChatMessage =
  | { id: string; author: "user"; text: string }
  | {
      id: string;
      author: "assistant";
      status: MessageStatus;
      blocks: readonly SafeBlock[];
      /** The cards that came with this answer (005). */
      resources?: readonly StoredResourceCard[] | undefined;
      /** A tool is running: the status line says so instead of "writing". */
      searching?: boolean | undefined;
    };

export interface MessageBubbleProps {
  message: ChatMessage;
  /** Offered on an interrupted answer; the user decides to retry (no automatic retry). */
  onRetry?: (() => void) | undefined;
  /** Saved resources (`<sourceId>:<externalId>`), and the explicit actions on a card (US4). */
  savedIds?: ReadonlySet<string> | undefined;
  onSaveResource?: ((card: ResourceCard) => void) | undefined;
  onRefreshResource?: ((card: ExpiredResourceCard) => void) | undefined;
}

export function MessageBubble({ message, onRetry, savedIds, onSaveResource, onRefreshResource }: MessageBubbleProps): ReactElement {
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
      {message.resources && message.resources.length > 0 ? (
        <ResourceCards
          cards={message.resources}
          savedIds={savedIds}
          onSave={onSaveResource}
          onRefresh={onRefreshResource}
        />
      ) : null}
      {message.status === "streaming" ? (
        <p className="bubble__status">
          <LoaderCircle aria-hidden="true" className="icon icon--spin" />
          <span>{message.searching ? t("chat.searching") : t("chat.streaming")}</span>
        </p>
      ) : null}
      {message.status === "interrupted" ? (
        <p className="bubble__note">
          <CircleAlert aria-hidden="true" className="icon" />
          <span>{t("chat.interrupted")}</span>
          {onRetry ? (
            <>
              {" "}
              <button type="button" className="button button--quiet" onClick={onRetry}>
                {t("common.retry")}
              </button>
            </>
          ) : null}
        </p>
      ) : null}
    </article>
  );
}
