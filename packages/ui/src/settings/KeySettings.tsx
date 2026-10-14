import type { CredentialStorageMode, EnterKeyOutcome } from "@tarjuman/core";
import { useId, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { KeyEntry } from "../key/KeyEntry";

export interface KeySettingsProps {
  /** The only form of the key ever shown (FR-015). */
  maskedHint: string;
  /** Where the key in use is kept. */
  storageMode: CredentialStorageMode | undefined;
  /** False when the browser blocks storage: a replacement can then only be session-only. */
  storageAvailable: boolean;
  /** Validates the new key and only then replaces the old one (`KeyManager.replace`). */
  onReplace: (key: string, mode: CredentialStorageMode) => Promise<EnterKeyOutcome>;
  /** Deletes the key; the app then asks for one again. */
  onDelete: () => void;
  disabled?: boolean | undefined;
}

/**
 * Key settings (FR-015, FR-016): the masked key, where it is kept, and replace or delete. A
 * replacement uses the same entry form as the first key, so the storage choice again has no
 * preselected option. A rejected replacement shows the error and keeps the old key.
 */
export function KeySettings({
  maskedHint,
  storageMode,
  storageAvailable,
  onReplace,
  onDelete,
  disabled = false,
}: KeySettingsProps): ReactElement {
  const { t } = useTranslation();
  const titleId = useId();
  const [replacing, setReplacing] = useState(false);

  async function replace(key: string, mode: CredentialStorageMode): Promise<EnterKeyOutcome> {
    const outcome = await onReplace(key, mode);
    if (outcome.ok) setReplacing(false);
    return outcome;
  }

  return (
    <section className="form" aria-labelledby={titleId}>
      <h2 id={titleId} className="stats__title">
        {t("settings.key.title")}
      </h2>
      <p>{t("settings.key.in_use", { hint: maskedHint })}</p>
      {storageMode !== undefined ? (
        <p className="form__hint">
          {storageMode === "persistent" ? t("settings.key.mode.persistent") : t("settings.key.mode.session")}
        </p>
      ) : null}

      {replacing ? (
        <>
          <KeyEntry storageAvailable={storageAvailable} onEnter={replace} />
          <button type="button" onClick={() => setReplacing(false)}>
            {t("common.cancel")}
          </button>
        </>
      ) : (
        <div className="settings-actions">
          <button type="button" disabled={disabled} onClick={() => setReplacing(true)}>
            {t("key.replace")}
          </button>
          <button type="button" disabled={disabled} onClick={onDelete}>
            {t("settings.key.delete")}
          </button>
        </div>
      )}
    </section>
  );
}
