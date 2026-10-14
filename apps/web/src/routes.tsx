import { BackIcon, ChatView, ConversationList, DataControls, KeyEntry, KeySettings, LanguageSettings, ModelEffortSettings, Onboarding, ProviderSettings, SettingsIcon, StatsPanel, ThemeSwitcher, ToneSelector, Workspace, useTranslation } from "@tarjuman/ui";
import type { ReactElement } from "react";
import type { AppController } from "./controller";
import type { AppServices } from "./composition-root";
import { useAppStore } from "./store";

export interface RoutesProps {
  controller: AppController;
  services: Pick<AppServices, "storageAvailable" | "providers" | "uiLocales">;
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
          providerIds={services.providers.map((offer) => offer.id)}
        />
      );
    case "key":
      return (
        <KeyEntry
          storageAvailable={services.storageAvailable}
          onEnter={controller.enterKey}
          providerId={state.profile?.providerId}
          showProvider={services.providers.length > 1}
        />
      );
    case "chat":
      return (
        <Workspace
          sidebar={({ onNavigate }) => (
            <>
              <ConversationList
                conversations={state.conversations}
                activeId={state.activeConversationId}
                onNew={() => {
                  onNavigate();
                  controller.newConversation();
                }}
                onOpen={(id) => {
                  onNavigate();
                  void controller.openConversation(id);
                }}
                onDelete={(id) => void controller.deleteConversation(id)}
              />
              {state.profile ? (
                <>
                  <button type="button" className="button button--secondary" onClick={() => state.navigate("settings")}>
                    <SettingsIcon aria-hidden="true" className="icon" />
                    <span>{t("settings.open")}</span>
                  </button>
                  <StatsPanel
                    records={state.usage}
                    configuredEffort={state.profile.configuredEffort}
                    onApplyEffort={(effort) => void controller.updateModelSettings({ effort })}
                  />
                  <ModelEffortSettings
                    models={services.providers.find((offer) => offer.id === state.profile?.providerId)?.models ?? []}
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
            </>
          )}
        >
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
        </Workspace>
      );
    case "settings":
      return (
        <div className="settings-screen">
          <button type="button" className="button button--quiet settings-screen__back" onClick={() => state.navigate("chat")}>
            <BackIcon aria-hidden="true" className="icon icon-directional" />
            <span>{t("common.back")}</span>
          </button>
          <h2 className="settings-screen__title">{t("common.settings")}</h2>
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
          <ThemeSwitcher variant="full" value={state.theme} onChange={controller.setTheme} />
          {state.profile ? (
            <ProviderSettings
              providerIds={services.providers.map((offer) => offer.id)}
              activeProviderId={state.profile.providerId}
              storedKeys={state.storedKeys}
              disabled={state.streaming}
              onSwitch={(providerId) => void controller.switchProvider(providerId)}
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
              providerId={state.profile?.providerId}
            />
          ) : null}
          <DataControls disabled={state.streaming} onDeleteAll={controller.deleteAllData} />
        </div>
      );
  }
}
