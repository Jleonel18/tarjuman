import { CONFIGURABLE_EFFORTS, type Effort, type ModelInfo } from "@tarjuman/core";
import { useId, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { effortLabelKey } from "./effort-labels";

export interface ModelEffortSettingsProps {
  models: readonly Pick<ModelInfo, "id" | "displayName" | "supportsEffort" | "effortLevels">[];
  modelId: string;
  effort: Effort;
  /** True while an answer streams: the settings apply to the next question, not the running one. */
  disabled?: boolean | undefined;
  onChange: (change: { modelId?: string; effort?: Effort }) => void;
}

/** Which model answers and how hard it thinks. Effort is unavailable for models without it. */
export function ModelEffortSettings({
  models,
  modelId,
  effort,
  disabled = false,
  onChange,
}: ModelEffortSettingsProps): ReactElement {
  const { t } = useTranslation();
  const modelFieldId = useId();
  const effortFieldId = useId();
  const model = models.find((m) => m.id === modelId);
  const effortSupported = model?.supportsEffort === true;
  const levels = CONFIGURABLE_EFFORTS.filter((level) => model?.effortLevels.includes(level));

  return (
    <section className="model-settings" aria-label={t("settings.model.label")}>
      <h2 className="stats__title">{t("settings.model.title")}</h2>
      <div className="form__field">
        <label htmlFor={modelFieldId}>{t("settings.model.model")}</label>
        <select
          id={modelFieldId}
          value={modelId}
          disabled={disabled}
          onChange={(e) => onChange({ modelId: e.target.value })}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.displayName}
            </option>
          ))}
        </select>
      </div>
      <div className="form__field">
        <label htmlFor={effortFieldId}>{t("settings.model.effort")}</label>
        <select
          id={effortFieldId}
          value={effort}
          disabled={disabled || !effortSupported}
          onChange={(e) => onChange({ effort: e.target.value as Effort })}
        >
          {(effortSupported ? levels : [effort]).map((level) => (
            <option key={level} value={level}>
              {t(effortLabelKey(level))}
            </option>
          ))}
        </select>
        {effortSupported ? null : <p className="form__hint">{t("settings.model.effort_unavailable")}</p>}
      </div>
    </section>
  );
}
