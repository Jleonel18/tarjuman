import { useId, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { withKeyHint } from "../key/KeyHint";
import { ProviderChoice } from "../key/ProviderChoice";
import { providerName } from "../key/provider-names";

export interface ProviderSettingsProps {
  /** Provider ids the build offers, in display order. */
  providerIds: readonly string[];
  activeProviderId: string;
  /** Masked hint per provider that has a stored key; never a key (FR-015). */
  storedKeys: Readonly<Record<string, { hint: string } | undefined>>;
  onSwitch: (providerId: string) => void;
  disabled?: boolean | undefined;
}

/**
 * Which AI service answers, and which services have a key (004 US2). Switching keeps every key and
 * every conversation (FR-004); the app asks for a key only when the new service has none.
 */
export function ProviderSettings({
  providerIds,
  activeProviderId,
  storedKeys,
  onSwitch,
  disabled = false,
}: ProviderSettingsProps): ReactElement | null {
  const { t } = useTranslation();
  const titleId = useId();
  if (providerIds.length < 2) return null;
  return (
    <section className="form settings-card" aria-labelledby={titleId}>
      <h2 id={titleId} className="stats__title settings-card__title">
        {t("settings.provider.title")}
      </h2>
      <ProviderChoice providerIds={providerIds} value={activeProviderId} onChange={onSwitch} disabled={disabled} />
      <ul className="settings-card__list">
        {providerIds.map((id) => {
          const hint = storedKeys[id]?.hint;
          const provider = providerName(t, id);
          return (
            <li key={id}>
              {hint === undefined
                ? t("settings.provider.key_missing", { provider })
                : withKeyHint(t("settings.provider.key_stored", { provider, hint }), hint)}
            </li>
          );
        })}
      </ul>
      <p className="form__hint">{t("settings.provider.switch_hint")}</p>
    </section>
  );
}
