import type { Conversation } from "@tarjuman/core";
import { Plus, Trash2 } from "lucide-react";
import { useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { languageName } from "../onboarding/languages";

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
      <button type="button" className="button button--primary" onClick={onNew}>
        <Plus aria-hidden="true" className="icon" />
        <span>{t("conversations.new")}</span>
      </button>
      {sorted.length === 0 ? <p className="form__hint">{t("conversations.empty")}</p> : null}
      <ul className="conversations__list">
        {sorted.map((conversation) => {
          const title = conversation.title.trim() === "" ? t("conversations.untitled") : conversation.title;
          return (
            <li key={conversation.id} className="conversations__item">
              {confirmingId === conversation.id ? (
                <div
                  role="group"
                  className="conversations__confirm"
                  aria-label={t("conversations.delete_confirm", { title })}
                >
                  <p>{t("conversations.delete_confirm", { title })}</p>
                  <button
                    type="button"
                    className="button button--danger"
                    onClick={() => {
                      setConfirmingId(undefined);
                      onDelete(conversation.id);
                    }}
                  >
                    {t("conversations.delete_yes")}
                  </button>
                  <button type="button" className="button button--quiet" onClick={() => setConfirmingId(undefined)}>
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
                    <span className="conversations__title">{title}</span>
                    <small className="conversations__meta">{date.format(new Date(conversation.updatedAt))}</small>
                    <small className="conversations__meta">
                      {t("conversations.languages", {
                        mediation: languageName(conversation.languageSnapshot.mediation, i18n.language),
                        target: languageName(conversation.languageSnapshot.target, i18n.language),
                      })}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="button button--quiet button--icon"
                    aria-label={t("conversations.delete", { title })}
                    onClick={() => setConfirmingId(conversation.id)}
                  >
                    <Trash2 aria-hidden="true" className="icon" />
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
