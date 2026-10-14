import { Monitor, Moon, Sun, SunMoon, type LucideIcon } from "lucide-react";
import { useId, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import type { ThemePreference } from "../theme/apply-theme";

export interface ThemeSwitcherProps {
  value: ThemePreference;
  onChange: (preference: ThemePreference) => void;
  /** `compact` sits in the app header on every screen; `full` is the Settings section. */
  variant: "compact" | "full";
}

const CHOICES: readonly { value: ThemePreference; labelKey: string; Icon: LucideIcon }[] = [
  { value: "light", labelKey: "theme.light", Icon: Sun },
  { value: "dark", labelKey: "theme.dark", Icon: Moon },
  { value: "system", labelKey: "theme.system", Icon: Monitor },
];

/**
 * Light, dark, or follow the device (FR-003b, FR-004). Both variants change the one stored
 * preference, so each shows a change made in the other. Icons are decorative; the names come from
 * the catalogs.
 */
export function ThemeSwitcher({ value, onChange, variant }: ThemeSwitcherProps): ReactElement {
  const { t } = useTranslation();
  const id = useId();

  if (variant === "compact") {
    return (
      <div className="theme-switcher theme-switcher--compact">
        <SunMoon aria-hidden="true" className="icon" />
        <label htmlFor={id} className="visually-hidden">
          {t("theme.label")}
        </label>
        <select id={id} value={value} onChange={(e) => onChange(e.target.value as ThemePreference)}>
          {CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {t(choice.labelKey)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <fieldset className="theme-switcher theme-switcher--full settings-card">
      <legend className="settings-card__title">{t("theme.label")}</legend>
      <div className="theme-switcher__choices">
        {CHOICES.map(({ value: choice, labelKey, Icon }) => (
          <label key={choice} className="choice-card">
            <input
              type="radio"
              name={id}
              value={choice}
              checked={value === choice}
              onChange={() => onChange(choice)}
            />
            <Icon aria-hidden="true" className="icon" />
            <span>{t(labelKey)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
