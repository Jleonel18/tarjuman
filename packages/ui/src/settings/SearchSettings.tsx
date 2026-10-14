import type { CredentialStorageMode, EnterKeyOutcome } from "@tarjuman/core";
import { useId, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { KeyEntry } from "../key/KeyEntry";
import { withKeyHint } from "../key/KeyHint";

export interface SearchSettingsProps {
  /** The on/off switch (005 FR-018). When off, no search is made at all. */
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  /** The only form of the search key ever shown. Absent when no key is stored. */
  keyHint?: string | undefined;
  keyMode?: CredentialStorageMode | undefined;
  /** False when the browser blocks storage: a key can then only be session-only. */
  storageAvailable: boolean;
  /** Validates the key with YouTube and stores it (`KeyManager.enter` for the `youtube` id). */
  onEnterKey: (key: string, mode: CredentialStorageMode) => Promise<EnterKeyOutcome>;
  /** Validates a new key and only then replaces the old one. */
  onReplaceKey: (key: string, mode: CredentialStorageMode) => Promise<EnterKeyOutcome>;
  onRemoveKey: () => void;
  disabled?: boolean | undefined;
  /** Starts with the key form open. The form is otherwise behind a button, so it never competes with the model key's. */
  defaultAdding?: boolean | undefined;
}

/**
 * "Internet search" settings: the switch, and the key of the search source. The key is entered,
 * kept, replaced, and deleted like the model key, with the same storage choice and no preselected
 * option, and it is shown only as a masked hint.
 */
export function SearchSettings({
  enabled,
  onToggle,
  keyHint,
  keyMode,
  storageAvailable,
  onEnterKey,
  onReplaceKey,
  onRemoveKey,
  disabled = false,
  defaultAdding = false,
}: SearchSettingsProps): ReactElement {
  const { t } = useTranslation();
  const ids = { title: useId(), switch: useId() };
  const [replacing, setReplacing] = useState(false);
  const [adding, setAdding] = useState(defaultAdding);

  async function replace(key: string, mode: CredentialStorageMode): Promise<EnterKeyOutcome> {
    const outcome = await onReplaceKey(key, mode);
    if (outcome.ok) setReplacing(false);
    return outcome;
  }

  return (
    <section className="form settings-card" aria-labelledby={ids.title}>
      <h2 id={ids.title} className="stats__title settings-card__title">
        {t("settings.search.title")}
      </h2>

      <div className="form__choice">
        <input
          id={ids.switch}
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          aria-describedby={`${ids.switch}-hint`}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <label htmlFor={ids.switch}>{t("settings.search.enabled")}</label>
        <p id={`${ids.switch}-hint`} className="form__hint">
          {t("settings.search.enabled_hint")}
        </p>
      </div>

      {keyHint === undefined ? (
        adding ? (
          <KeyEntry storageAvailable={storageAvailable} onEnter={onEnterKey} providerId="youtube" purpose="search" />
        ) : (
          <>
            <p className="form__hint">{t("settings.search.no_key")}</p>
            <div className="settings-actions">
              <button type="button" disabled={disabled} onClick={() => setAdding(true)}>
                {t("settings.search.add")}
              </button>
            </div>
          </>
        )
      ) : (
        <>
          <p>{withKeyHint(t("settings.search.key_in_use", { hint: keyHint }), keyHint)}</p>
          {keyMode !== undefined ? (
            <p className="form__hint">
              {keyMode === "persistent" ? t("settings.key.mode.persistent") : t("settings.key.mode.session")}
            </p>
          ) : null}
          {replacing ? (
            <>
              <KeyEntry storageAvailable={storageAvailable} onEnter={replace} providerId="youtube" purpose="search" />
              <button type="button" className="button button--quiet settings-card__cancel" onClick={() => setReplacing(false)}>
                {t("common.cancel")}
              </button>
            </>
          ) : (
            <div className="settings-actions">
              <button type="button" disabled={disabled} onClick={() => setReplacing(true)}>
                {t("key.replace")}
              </button>
              <button type="button" disabled={disabled} onClick={onRemoveKey}>
                {t("settings.search.delete")}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
