import { useId, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { providerName } from "./provider-names";

export interface ProviderChoiceProps {
  /** Provider ids the build offers, in display order. */
  providerIds: readonly string[];
  /** `undefined` until the learner picks one: nothing is preselected (004 FR-001). */
  value: string | undefined;
  onChange: (providerId: string) => void;
  disabled?: boolean;
}

/**
 * Which AI service the learner's key and messages go to (004). Rendered only when the build offers
 * more than one; with one there is nothing to choose. A native radio group, so it is keyboard
 * accessible and announced as a group.
 */
export function ProviderChoice({ providerIds, value, onChange, disabled = false }: ProviderChoiceProps): ReactElement | null {
  const { t } = useTranslation();
  const name = useId();
  if (providerIds.length < 2) return null;
  return (
    <fieldset className="form__field" aria-describedby={`${name}-hint`}>
      <legend>{t("provider.legend")}</legend>
      {providerIds.map((id) => (
        <div key={id} className="form__choice">
          <input
            id={`${name}-${id}`}
            type="radio"
            name={name}
            value={id}
            checked={value === id}
            disabled={disabled}
            onChange={() => onChange(id)}
          />
          <label htmlFor={`${name}-${id}`}>{providerName(t, id)}</label>
        </div>
      ))}
      <p id={`${name}-hint`} className="form__hint">
        {t("provider.hint")}
      </p>
    </fieldset>
  );
}
