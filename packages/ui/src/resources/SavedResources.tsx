import type { ExpiredResourceCard, SavedResource } from "@tarjuman/core";
import { useId, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { ResourceCards } from "../chat/ResourceCards";
import { FormError } from "../forms/FormMessage";

export interface SavedResourcesProps {
  /** Newest first, as the store lists them. */
  items: readonly SavedResource[];
  onRemove: (item: SavedResource) => void;
  /** Refreshes one expired card: one request, by the learner's own action (FR-021). */
  onRefresh: (card: ExpiredResourceCard) => void;
  /** The last refresh did not work. */
  refreshFailed?: boolean | undefined;
}

/**
 * The saved list (005 US4): every card the learner kept, with the labels it had when it was found.
 * A card older than 30 days shows no source data until it is refreshed.
 */
export function SavedResources({ items, onRemove, onRefresh, refreshFailed = false }: SavedResourcesProps): ReactElement {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <section className="saved" aria-labelledby={titleId}>
      <h2 id={titleId} className="settings-screen__title">
        {t("saved.title")}
      </h2>
      {refreshFailed ? <FormError>{t("saved.refresh_failed")}</FormError> : null}
      {items.length === 0 ? (
        <p className="form__hint">{t("saved.empty")}</p>
      ) : (
        <ol className="saved__list">
          {items.map((item) => (
            <li key={item.id} className="saved__item">
              <ResourceCards cards={[item.card]} onRefresh={onRefresh} />
              <button type="button" className="button button--quiet" onClick={() => onRemove(item)}>
                {t("saved.remove")}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
