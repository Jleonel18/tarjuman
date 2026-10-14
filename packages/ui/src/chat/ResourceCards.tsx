import type { ExpiredResourceCard, ResourceCard, StoredResourceCard } from "@tarjuman/core";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { languageName } from "../onboarding/languages";

export interface ResourceCardsProps {
  cards: readonly StoredResourceCard[];
  /** `<sourceId>:<externalId>` of every saved resource, to show Saved instead of Save. */
  savedIds?: ReadonlySet<string> | undefined;
  /** When given, each card offers Save. Saving is always an explicit click (US4). */
  onSave?: ((card: ResourceCard) => void) | undefined;
  /** When given, an expired card offers Refresh (US4). */
  onRefresh?: ((card: ExpiredResourceCard) => void) | undefined;
}

/**
 * The resource cards of an answer (005 FR-005, FR-011, FR-013). Every field comes from the source
 * through the pipeline, or is the model's estimate, labelled as one. Nothing is loaded: no image,
 * no frame, no preview. The one link is hardened, and only a plain `https:` address becomes one.
 */
export function ResourceCards({ cards, savedIds, onSave, onRefresh }: ResourceCardsProps): ReactElement | null {
  const { t } = useTranslation();
  if (cards.length === 0) return null;
  return (
    <section className="resources" aria-label={t("resources.label")}>
      <ol className="resources__list">
        {cards.map((card) =>
          card.expired === true ? (
            <li key={`${card.sourceId}:${card.externalId}`} className="resource resource--expired">
              <p className="resource__note">{t("resources.expired")}</p>
              {onRefresh ? (
                <button type="button" className="button button--quiet" onClick={() => onRefresh(card)}>
                  {t("resources.refresh")}
                </button>
              ) : null}
            </li>
          ) : (
            <li key={`${card.sourceId}:${card.externalId}`} className="resource">
              <LiveCard card={card} saved={savedIds?.has(`${card.sourceId}:${card.externalId}`) === true} onSave={onSave} />
            </li>
          ),
        )}
      </ol>
    </section>
  );
}

function LiveCard({
  card,
  saved,
  onSave,
}: {
  card: ResourceCard;
  saved: boolean;
  onSave: ((card: ResourceCard) => void) | undefined;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const duration = formatDuration(card.durationSeconds);
  const language = card.audioLanguage === null ? t("resources.language_unconfirmed") : t("resources.language", { language: languageName(card.audioLanguage, i18n.language) });
  const captions = card.hasCaptions === null ? "unknown" : card.hasCaptions ? "yes" : "no";
  const facts = [
    t(`resources.type.${card.type}`),
    duration === undefined ? undefined : t("resources.duration", { duration }),
    t(`resources.captions.${captions}`),
    language,
    card.accessNote === null ? undefined : t(`resources.access.${card.accessNote}`),
    t(`resources.price.${card.priceLabel}`),
    card.sponsored ? t("resources.sponsored") : undefined,
    card.affiliate ? t("resources.affiliate") : undefined,
    // A refreshed card has no judgement from the model: nothing is claimed about its difficulty.
    card.fitNote === "" && card.difficulty === "unknown" ? undefined : t("resources.difficulty_estimate", { level: t(`resources.difficulty.${card.difficulty}`) }),
  ].filter((fact): fact is string => fact !== undefined);

  return (
    <>
      <p className="resource__title" dir="auto">
        {card.title}
      </p>
      <p className="resource__source">
        {t("resources.source_channel", { source: card.sourceDisplay, channel: card.channel })}
      </p>
      <ul className="resource__facts">
        {facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
      {card.fitNote !== "" ? (
        <p className="resource__fit" dir="auto">
          {card.fitNote}
        </p>
      ) : null}
      <div className="resource__actions">
        {isHttps(card.link) ? (
          <a
            className="button button--secondary"
            href={card.link}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            {t("resources.open", { source: card.sourceDisplay })}
            <span className="visually-hidden"> {t("chat.link.new_tab")}</span>
          </a>
        ) : null}
        {onSave ? (
          <button type="button" className="button button--quiet" disabled={saved} onClick={() => onSave(card)}>
            {saved ? t("resources.saved") : t("resources.save")}
          </button>
        ) : null}
      </div>
    </>
  );
}

function isHttps(link: string): boolean {
  return /^https:\/\/[^\s]+$/.test(link);
}

/** `m:ss`, or `h:mm:ss` from an hour up. Digits only, so it needs no catalog entry. */
function formatDuration(seconds: number | null): string | undefined {
  if (seconds === null || seconds <= 0) return undefined;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}
