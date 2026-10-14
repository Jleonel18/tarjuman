import type { DeleteAllOutcome } from "@tarjuman/core";
import { useId, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";

export interface DataControlsProps {
  /** Deletes everything on the device (`DataController.deleteAll`). On success the app returns to onboarding. */
  onDeleteAll: () => Promise<DeleteAllOutcome>;
  disabled?: boolean | undefined;
}

type Step = "idle" | "confirming" | "deleting" | "failed";

/**
 * "Delete all my data" (FR-017): one action behind an explicit confirmation step. A deletion that
 * cannot be verified shows a visible failure and never a success message (SC-007).
 */
export function DataControls({ onDeleteAll, disabled = false }: DataControlsProps): ReactElement {
  const { t } = useTranslation();
  const titleId = useId();
  const [step, setStep] = useState<Step>("idle");

  async function confirm(): Promise<void> {
    setStep("deleting");
    let outcome: DeleteAllOutcome;
    try {
      outcome = await onDeleteAll();
    } catch {
      outcome = { ok: false, code: "not_verified" };
    }
    // On success the app leaves this screen; only a failure stays here to be shown.
    if (!outcome.ok) setStep("failed");
  }

  return (
    <section className="form" aria-labelledby={titleId}>
      <h2 id={titleId} className="stats__title">
        {t("settings.data.title")}
      </h2>
      <p className="form__hint">{t("settings.data.hint")}</p>

      {step === "confirming" || step === "deleting" ? (
        <>
          <p className="form__notice">
            {t("settings.data.confirm_text")}
          </p>
          <div className="settings-actions">
            <button type="button" disabled={step === "deleting"} onClick={() => void confirm()}>
              {step === "deleting" ? t("settings.data.deleting") : t("settings.data.confirm")}
            </button>
            <button type="button" disabled={step === "deleting"} onClick={() => setStep("idle")}>
              {t("common.cancel")}
            </button>
          </div>
        </>
      ) : (
        <>
          {step === "failed" ? (
            <p role="alert" className="form__error">
              {t("settings.data.failed")}
            </p>
          ) : null}
          <div className="settings-actions">
            <button type="button" disabled={disabled} onClick={() => setStep("confirming")}>
              {t("settings.data.delete_all")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
