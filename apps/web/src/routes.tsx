import { ChatView, ConversationList, KeyEntry, Onboarding, useTranslation } from "@tarjuman/ui";
import type { ReactElement } from "react";
import type { AppController } from "./controller";
import type { AppServices } from "./composition-root";
import { useAppStore } from "./store";

export interface RoutesProps {
  controller: AppController;
  services: Pick<AppServices, "storageAvailable">;
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
          defaultMediationLanguage={i18n.language}
          validate={controller.validateDraft}
          onComplete={(draft) => void controller.completeOnboarding(draft)}
        />
      );
    case "key":
      return <KeyEntry storageAvailable={services.storageAvailable} onEnter={controller.enterKey} />;
    case "chat":
      return (
        <div className="workspace">
          <ConversationList
            conversations={state.conversations}
            activeId={state.activeConversationId}
            onNew={controller.newConversation}
            onOpen={(id) => void controller.openConversation(id)}
            onDelete={(id) => void controller.deleteConversation(id)}
          />
          <ChatView
            messages={state.messages}
            streaming={state.streaming}
            keyHint={state.keyHint}
            error={state.error}
            onSend={(text) => void controller.send(text)}
            onStop={controller.stop}
            onRetry={(id) => void controller.retry(id)}
            onOpenKeySettings={controller.openKeySettings}
          />
        </div>
      );
    case "settings":
      // Settings arrive with their own user stories (US5 to US7).
      return <p>{t("common.loading")}</p>;
  }
}
