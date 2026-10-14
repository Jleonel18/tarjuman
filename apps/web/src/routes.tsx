import { ChatView, ConversationList, DataControls, KeyEntry, KeySettings, LanguageSettings, ModelEffortSettings, Onboarding, StatsPanel, ToneSelector, useTranslation } from "@tarjuman/ui";
import type { ReactElement } from "react";
import type { AppController } from "./controller";
import type { AppServices } from "./composition-root";
import { useAppStore } from "./store";

export interface RoutesProps {
  controller: AppController;
  services: Pick<AppServices, "storageAvailable" | "models" | "uiLocales">;
}

/** First-run guard: onboarding, then key entry, then chat. `boot()` picks the starting screen. */
export function Routes({ controller, services }: RoutesProps): ReactElement {
  const { t, i18n } = useTranslation();
  const state = useAppStore();

  if (!state.ready) return <p>{t("common.loading")}</p>;

  switch (state.route) {
    case "onboarding":
      return (
        <Onboarding
          defaultMediationLanguage={i18n.language.split("-")[0] ?? i18n.language}
          validate={controller.validateDraft}
          onComplete={(draft) => void controller.completeOnboarding(draft)}
        />
      );
    case "key":
      return <KeyEntry storageAvailable={services.storageAvailable} onEnter={controller.enterKey} />;
    case "chat":
      return (
        <div className="workspace">
          <div className="workspace__side">
            <ConversationList
              conversations={state.conversations}
              activeId={state.activeConversationId}
              onNew={controller.newConversation}
              onOpen={(id) => void controller.openConversation(id)}
              onDelete={(id) => void controller.deleteConversation(id)}
            />
            {state.profile ? (
              <>
                <button type="button" onClick={() => state.navigate("settings")}>
                  {t("settings.open")}
                </button>
                <StatsPanel
                  records={state.usage}
                  configuredEffort={state.profile.configuredEffort}
                  onApplyEffort={(effort) => void controller.updateModelSettings({ effort })}
                />
                <ModelEffortSettings
                  models={services.models.list}
                  modelId={state.profile.modelId}
                  effort={state.profile.configuredEffort}
                  disabled={state.streaming}
                  onChange={(change) => void controller.updateModelSettings(change)}
                />
                <ToneSelector
                  toneId={state.profile.toneId}
                  disabled={state.streaming}
                  onChange={(toneId) => void controller.updateTone(toneId)}
                />
              </>
            ) : null}
          </div>
          <ChatView
            messages={state.messages}
            streaming={state.streaming}
            keyHint={state.keyHint}
            error={state.error}
            notice={state.notice}
            onDismissNotice={controller.dismissNotice}
            contextRatio={state.usage.at(-1)?.contextRatio}
            onNewConversation={controller.newConversation}
            onSend={(text) => void controller.send(text)}
            onStop={controller.stop}
            onRetry={(id) => void controller.retry(id)}
            onOpenKeySettings={controller.openKeySettings}
          />
        </div>
      );
    case "settings":
      return (
        <div className="settings-screen">
          <button type="button" onClick={() => state.navigate("chat")}>
            <span aria-hidden="true" className="icon-directional">
              ‹
            </span>{" "}
            {t("common.back")}
          </button>
          <h2 className="stats__title">{t("common.settings")}</h2>
          {state.profile ? (
            <LanguageSettings
              uiLanguage={i18n.language}
              mediationLanguage={state.profile.mediationLanguage}
              targetLanguage={state.profile.targetLanguage}
              uiLocales={services.uiLocales}
              disabled={state.streaming}
              validate={controller.validateLanguages}
              onChange={(change) => void controller.updateLanguages(change)}
            />
          ) : null}
          {state.keyHint !== undefined ? (
            <KeySettings
              maskedHint={state.keyHint}
              storageMode={state.keyMode}
              storageAvailable={services.storageAvailable}
              disabled={state.streaming}
              onReplace={controller.replaceKey}
              onDelete={() => void controller.removeKey()}
            />
          ) : null}
          <DataControls disabled={state.streaming} onDeleteAll={controller.deleteAllData} />
        </div>
      );
  }
}
