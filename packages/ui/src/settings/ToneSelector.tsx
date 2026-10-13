import { TONE_PRESETS } from "@tarjuman/core";
import { useId, type ReactElement } from "react";
import { useTranslation } from "react-i18next";

export interface ToneSelectorProps {
  toneId: string;
  /** True while an answer streams: the tone applies to the next question, not the running one. */
  disabled?: boolean | undefined;
  onChange: (toneId: string) => void;
}

/** Which voice Tarjuman answers in. Presentation only; it never changes what the app will do. */
export function ToneSelector({ toneId, disabled = false, onChange }: ToneSelectorProps): ReactElement {
  const { t } = useTranslation();
  const fieldId = useId();
  const hintId = useId();

  return (
    <section className="tone-settings" aria-label={t("settings.tone.label")}>
      <h2 className="stats__title">{t("settings.tone.title")}</h2>
      <div className="form__field">
        <label htmlFor={fieldId}>{t("settings.tone.field")}</label>
        <select
          id={fieldId}
          aria-describedby={hintId}
          value={toneId}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          {TONE_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {t(preset.nameKey)}
            </option>
          ))}
        </select>
        <p id={hintId} className="form__hint">
          {t("settings.tone.hint")}
        </p>
      </div>
    </section>
  );
}
