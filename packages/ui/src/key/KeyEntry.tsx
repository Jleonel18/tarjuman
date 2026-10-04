import type { CredentialStorageMode, EnterKeyOutcome } from "@tarjuman/core";
import { useId, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { describeProviderError } from "../errors/provider-error-messages";

export interface KeyEntryProps {
  /** False in private mode or when the browser blocks storage: only session-only is offered. */
  storageAvailable: boolean;
  /** Set once a key is stored: the screen then shows only the masked hint (FR-015). */
  maskedHint?: string | undefined;
  /** Validates and stores the key (`KeyManager.enter`). Never called with an empty mode. */
  onEnter: (key: string, mode: CredentialStorageMode) => Promise<EnterKeyOutcome>;
  /** Asks to replace the stored key; the app then clears it and renders this screen again. */
  onReplace?: (() => void) | undefined;
}

/**
 * Where the learner brings their own API key. The storage choice has no preselected option and
 * a plain-language trade-off for each (FR-016); the key is never shown again after entry.
 */
export function KeyEntry({ storageAvailable, maskedHint, onEnter, onReplace }: KeyEntryProps): ReactElement {
  const { t } = useTranslation();
  const ids = { key: useId(), mode: useId() };
  const [key, setKey] = useState("");
  const [mode, setMode] = useState<CredentialStorageMode | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ messageKey: string; params: { seconds?: number } } | undefined>(undefined);

  if (maskedHint !== undefined) {
    return (
      <section className="form">
        <p>{t("key.saved", { hint: maskedHint })}</p>
        {onReplace ? (
          <button type="button" onClick={onReplace}>
            {t("key.replace")}
          </button>
        ) : null}
      </section>
    );
  }

  async function submit(): Promise<void> {
    if (mode === undefined) return;
    setPending(true);
    setError(undefined);
    try {
      const outcome = await onEnter(key, mode);
      if (outcome.ok) setKey("");
      else setError(describeProviderError(outcome.code));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="form" aria-labelledby={`${ids.key}-title`}>
      <h2 id={`${ids.key}-title`}>{t("key.title")}</h2>
      <p>{t("key.intro")}</p>

      <div className="form__field">
        <label htmlFor={ids.key}>{t("key.label")}</label>
        <input
          id={ids.key}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </div>

      {storageAvailable ? null : (
        <p role="status" className="form__notice">
          {t("key.storage_unavailable")}
        </p>
      )}

      <fieldset className="form__field">
        <legend>{t("key.mode.legend")}</legend>
        <div className="form__choice">
          <input
            id={`${ids.mode}-persistent`}
            type="radio"
            name={ids.mode}
            checked={mode === "persistent"}
            disabled={!storageAvailable}
            aria-describedby={`${ids.mode}-persistent-hint`}
            onChange={() => setMode("persistent")}
          />
          <label htmlFor={`${ids.mode}-persistent`}>{t("key.mode.persistent")}</label>
          <p id={`${ids.mode}-persistent-hint`} className="form__hint">
            {t("key.mode.persistent_hint")}
          </p>
        </div>
        <div className="form__choice">
          <input
            id={`${ids.mode}-session`}
            type="radio"
            name={ids.mode}
            checked={mode === "session"}
            aria-describedby={`${ids.mode}-session-hint`}
            onChange={() => setMode("session")}
          />
          <label htmlFor={`${ids.mode}-session`}>{t("key.mode.session")}</label>
          <p id={`${ids.mode}-session-hint`} className="form__hint">
            {t("key.mode.session_hint")}
          </p>
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="form__error">
          {t(error.messageKey, error.params)}
        </p>
      ) : null}

      <button type="button" disabled={pending || key.trim() === "" || mode === undefined} onClick={() => void submit()}>
        {pending ? t("key.checking") : t("key.save")}
      </button>
    </section>
  );
}
