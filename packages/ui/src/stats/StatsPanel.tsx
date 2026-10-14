import { isContextWarning, sumUsage, type Effort, type UsageRecord } from "@tarjuman/core";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { effortLabelKey } from "../settings/effort-labels";
import { FormError } from "../forms/FormMessage";
import { providerName } from "../key/provider-names";

export interface StatsPanelProps {
  /** Usage of the open conversation, oldest first. */
  records: readonly UsageRecord[];
  configuredEffort: Effort;
  onApplyEffort: (effort: Effort) => void;
}

/**
 * What the key is spending. Token numbers are the provider's own report, shown as given; only the
 * context share and the cost are derived, and the cost always reads as an estimate (FR-021).
 */
export function StatsPanel({ records, configuredEffort, onApplyEffort }: StatsPanelProps): ReactElement {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language);
  const percent = new Intl.NumberFormat(i18n.language, { style: "percent", maximumFractionDigits: 1 });
  const money = new Intl.NumberFormat(i18n.language, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });

  const latest = records.at(-1);
  const totals = sumUsage(records);
  // Searches and extra model calls (005 FR-017): only said when there were any.
  const searchTotals = new Map<string, number>();
  for (const record of records) {
    for (const search of record.searches ?? []) searchTotals.set(search.sourceId, (searchTotals.get(search.sourceId) ?? 0) + search.count);
  }
  const searchCount = [...searchTotals.values()].reduce((sum, count) => sum + count, 0);
  const steps = records.reduce((sum, record) => sum + (record.steps ?? 1), 0);
  const canApply = latest !== undefined && latest.recommendedEffort !== configuredEffort;

  return (
    <section className="stats" aria-label={t("stats.label")}>
      <h2 className="stats__title">{t("stats.title")}</h2>
      {latest === undefined ? (
        <p className="form__hint">{t("stats.empty")}</p>
      ) : (
        <>
          <table className="stats__table">
            <caption className="form__hint">{t("stats.tokens.caption")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("stats.tokens.message")}</th>
                <th scope="col">{t("stats.tokens.input")}</th>
                <th scope="col">{t("stats.tokens.output")}</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record, index) => (
                <tr key={record.id}>
                  <th scope="row">{number.format(index + 1)}</th>
                  <td>{number.format(record.inputTokens)}</td>
                  <td>{number.format(record.outputTokens)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{t("stats.tokens.total")}</th>
                <td>{number.format(totals.inputTokens)}</td>
                <td>{number.format(totals.outputTokens)}</td>
              </tr>
            </tfoot>
          </table>

          {searchCount > 0 || steps > records.length ? (
            <div className="stats__block">
              {searchCount > 0 ? (
                <p>
                  {t("stats.searches.summary", {
                    count: number.format(searchCount),
                    sources: [...searchTotals.keys()].map((id) => providerName(t, id)).join(", "),
                  })}
                </p>
              ) : null}
              {steps > records.length ? <p>{t("stats.steps.summary", { steps: number.format(steps) })}</p> : null}
            </div>
          ) : null}

          <div className="stats__block">
            <label htmlFor="stats-context">{t("stats.context.label")}</label>
            <meter id="stats-context" min={0} max={1} value={latest.contextRatio} high={0.8} optimum={0}>
              {percent.format(latest.contextRatio)}
            </meter>
            <p className="form__hint">
              {t("stats.context.value", {
                used: number.format(latest.contextUsedTokens),
                window: number.format(latest.contextWindow),
                percent: percent.format(latest.contextRatio),
              })}
            </p>
            {isContextWarning(latest.contextRatio) ? (
              <FormError role={null}>{t("stats.context.warning")}</FormError>
            ) : null}
          </div>

          <div className="stats__block">
            <p>
              {t("stats.effort.summary", {
                configured: t(effortLabelKey(configuredEffort)),
                recommended: t(effortLabelKey(latest.recommendedEffort)),
              })}
            </p>
            {canApply ? (
              <button type="button" onClick={() => onApplyEffort(latest.recommendedEffort)}>
                {t("stats.effort.apply", { effort: t(effortLabelKey(latest.recommendedEffort)) })}
              </button>
            ) : null}
          </div>

          <div className="stats__block">
            {totals.estimatedCostUsd === null ? (
              <p>{t("stats.cost.unavailable")}</p>
            ) : (
              <>
                <p>{t("stats.cost.estimate", { cost: money.format(totals.estimatedCostUsd) })}</p>
                {latest.pricingAsOf !== null ? (
                  <p className="form__hint">{t("stats.cost.as_of", { date: latest.pricingAsOf })}</p>
                ) : null}
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
