import type { CredentialStorageMode, EnterKeyOutcome } from "@tarjuman/core";
import { useId, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { describeProviderError } from "../errors/provider-error-messages";
import { FormError, FormNotice } from "../forms/FormMessage";
import { withKeyHint } from "./KeyHint";
import { providerName } from "./provider-names";

export interface KeyEntryProps {
  /** False in private mode or when the browser blocks storage: only session-only is offered. */
  storageAvailable: boolean;
  /** Set once a key is stored: the screen then shows only the masked hint (FR-015). */
  maskedHint?: string | undefined;
  /** Validates and stores the key (`KeyManager.enter`). Never called with an empty mode. */
  onEnter: (key: string, mode: CredentialStorageMode) => Promise<EnterKeyOutcome>;
  /** Asks to replace the stored key; the app then clears it and renders this screen again. */
  onReplace?: (() => void) | undefined;
  /** The provider this key is for. Its help text follows it (004 FR-020). */
  providerId?: string | undefined;
  /** Names the provider on screen; the app sets it when the learner had a choice. */
  showProvider?: boolean | undefined;
  /** `search` is the key of a search source (005): its own title, intro, and wrong-key message. */
  purpose?: "model" | "search" | undefined;
}

/** Where to get a key, per product provider. Written out so the catalog-key check sees them. */
const HELP_KEYS: Readonly<Record<string, string>> = {
  anthropic: "key.help.anthropic",
  gemini: "key.help.gemini",
  youtube: "key.help.youtube",
};
/** What the provider may do with what is sent (004 FR-020): only Gemini's free tier needs saying. */
const DISCLOSURE_KEYS: Readonly<Record<string, string>> = {
  gemini: "key.disclosure.gemini",
};

/**
 * Where the learner brings their own API key. The storage choice has no preselected option and
 * a plain-language trade-off for each (FR-016); the key is never shown again after entry.
 */
export function KeyEntry({
  storageAvailable,
  maskedHint,
  onEnter,
  onReplace,
  providerId,
  showProvider = false,
  purpose = "model",
}: KeyEntryProps): ReactElement {
  const { t } = useTranslation();
  const ids = { key: useId(), mode: useId() };
  const [key, setKey] = useState("");
  const [mode, setMode] = useState<CredentialStorageMode | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ messageKey: string; params: Record<string, string | number> } | undefined>(undefined);

  if (maskedHint !== undefined) {
    return (
      <section className="form screen-card">
        <p>{withKeyHint(t("key.saved", { hint: maskedHint }), maskedHint)}</p>
        {onReplace ? (
          <button type="button" className="button button--secondary form__submit" onClick={onReplace}>
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
      // Recognized locally as another provider's key: it was sent nowhere (004 FR-007).
      else if (outcome.code === "wrong_provider") {
        setError({
          messageKey: purpose === "search" ? "key.wrong_provider_search" : "key.wrong_provider",
          params: { provider: providerName(t, outcome.expectedProviderId) },
        });
      } else setError(describeProviderError(outcome.code));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="form screen-card" aria-labelledby={`${ids.key}-title`}>
      <h2 id={`${ids.key}-title`}>{t(purpose === "search" ? "key.search.title" : "key.title")}</h2>
      <p className="screen-card__intro">{t(purpose === "search" ? "key.search.intro" : "key.intro")}</p>
      {providerId !== undefined && showProvider ? (
        <p>{t("key.provider_in_use", { provider: providerName(t, providerId) })}</p>
      ) : null}
      {providerId !== undefined && HELP_KEYS[providerId] !== undefined ? (
        <p className="form__hint">{t(HELP_KEYS[providerId])}</p>
      ) : null}
      {providerId !== undefined && DISCLOSURE_KEYS[providerId] !== undefined ? (
        <FormNotice role={null}>{t(DISCLOSURE_KEYS[providerId])}</FormNotice>
      ) : null}

      <div className="form__field">
        <label htmlFor={ids.key}>{t(purpose === "search" ? "key.search.label" : "key.label")}</label>
        <input
          id={ids.key}
          className="key-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </div>

      {storageAvailable ? null : (
        <FormNotice role="status">{t("key.storage_unavailable")}</FormNotice>
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
        <FormError>{t(error.messageKey, error.params)}</FormError>
      ) : null}

      <button
        type="button"
        className="button button--primary form__submit"
        aria-busy={pending}
        disabled={pending || key.trim() === "" || mode === undefined}
        onClick={() => void submit()}
      >
        {pending ? t("key.checking") : t(purpose === "search" ? "key.search.save" : "key.save")}
      </button>
    </section>
  );
}
