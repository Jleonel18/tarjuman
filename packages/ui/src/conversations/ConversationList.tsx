import type { Conversation } from "@tarjuman/core";
import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";

export interface ConversationListProps {
  conversations: readonly Conversation[];
  activeId?: string | undefined;
  onNew: () => void;
  onOpen: (id: string) => void;
  /** Called only after the user confirms. Deleting also removes the messages and usage. */
  onDelete: (id: string) => void;
}

/** Past conversations, newest first. Deleting asks first, because it cannot be undone. */
export function ConversationList({
  conversations,
  activeId,
  onNew,
  onOpen,
  onDelete,
}: ConversationListProps): ReactElement {
  const { t, i18n } = useTranslation();
  const [confirmingId, setConfirmingId] = useState<string | undefined>(undefined);
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" });
  const sorted = [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <nav className="conversations" aria-label={t("conversations.label")}>
      <button type="button" onClick={onNew}>
        {t("conversations.new")}
      </button>
      {sorted.length === 0 ? <p className="form__hint">{t("conversations.empty")}</p> : null}
      <ul className="conversations__list">
        {sorted.map((conversation) => {
          const title = conversation.title.trim() === "" ? t("conversations.untitled") : conversation.title;
          return (
            <li key={conversation.id} className="conversations__item">
              {confirmingId === conversation.id ? (
                <div role="group" aria-label={t("conversations.delete_confirm", { title })}>
                  <p>{t("conversations.delete_confirm", { title })}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingId(undefined);
                      onDelete(conversation.id);
                    }}
                  >
                    {t("conversations.delete_yes")}
                  </button>
                  <button type="button" onClick={() => setConfirmingId(undefined)}>
                    {t("common.cancel")}
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="conversations__open"
                    aria-current={conversation.id === activeId ? "true" : undefined}
                    onClick={() => onOpen(conversation.id)}
                  >
                    <span>{title}</span>
                    <small>{date.format(new Date(conversation.updatedAt))}</small>
                  </button>
                  <button
                    type="button"
                    aria-label={t("conversations.delete", { title })}
                    onClick={() => setConfirmingId(conversation.id)}
                  >
                    {t("common.delete")}
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
