import {
  DEFAULT_EFFORT,
  DEFAULT_TONE_ID,
  DEFAULT_UI_LOCALE,
  isShippedUiLocale,
  renderSafeBlocks,
  validateProfile,
  type CredentialStorageMode,
  type EnterKeyOutcome,
  type LearnerProfile,
  type Message,
  type ProfileInput,
  type ProfileIssue,
} from "@tarjuman/core";
import type { ChatMessage, OnboardingDraft } from "@tarjuman/ui";
import type { AppServices } from "./composition-root";
import { useAppStore } from "./store";

const CAPABILITY_ID = "language-qa";
const PENDING_USER_ID = "pending-user";
const PENDING_REPLY_ID = "pending-reply";

/** Turns stored messages into what the chat shows. Model text goes through the OutputGuard here. */
export function toChatMessages(messages: readonly Message[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  for (const message of messages) {
    if (message.author === "user") {
      const text = message.segments
        .filter((segment) => segment.trust === "user")
        .map((segment) => segment.text)
        .join("\n\n");
      result.push({ id: message.id, author: "user", text });
    } else if (message.author === "assistant") {
      const text = message.segments.map((segment) => segment.text).join("");
      // A turn that failed before any text arrived leaves an empty message; the error says why.
      if (text === "" && message.status !== "streaming") continue;
      result.push({ id: message.id, author: "assistant", status: message.status, blocks: renderSafeBlocks(text) });
    }
  }
  return result;
}

/**
 * The use cases of the app: load, onboard, enter a key, ask. It connects the UI to the core and
 * is the only writer of the store. It never sees a secret (keys go straight to `KeyManager`) and
 * never reaches a provider (every model call goes through the pipeline).
 */
export class AppController {
  readonly #services: AppServices;
  #abort: AbortController | undefined;

  constructor(services: AppServices) {
    this.#services = services;
  }

  async boot(): Promise<void> {
    const { storage, credentials, conversations, i18n } = this.#services;
    const profile = await storage.get<LearnerProfile>("profile", "profile");
    if (profile && isShippedUiLocale(profile.uiLanguage)) await i18n.changeLanguage(profile.uiLanguage);
    const key = await credentials.describe();
    const list = await conversations.list();
    const latest = list[0] === undefined ? undefined : await conversations.open(list[0].id);

    useAppStore.setState({
      ready: true,
      profile,
      keyHint: key?.maskedHint,
      conversations: list,
      activeConversationId: latest?.conversation.id,
      messages: latest ? toChatMessages(latest.messages) : [],
      route: profile === undefined ? "onboarding" : key === undefined ? "key" : "chat",
    });
  }

  /** Reports problems with a draft using the core's profile rules; nothing is stored. */
  validateDraft = (draft: OnboardingDraft): readonly ProfileIssue[] => {
    const result = validateProfile(this.#profileInput(draft), { knownModelIds: this.#services.models.ids });
    return result.ok ? [] : result.issues;
  };

  completeOnboarding = async (draft: OnboardingDraft): Promise<void> => {
    const result = validateProfile(this.#profileInput(draft), { knownModelIds: this.#services.models.ids });
    if (!result.ok) return;
    const now = new Date().toISOString();
    const profile: LearnerProfile = { id: "profile", ...result.value, createdAt: now, updatedAt: now };
    await this.#services.storage.put("profile", profile);
    useAppStore.setState({ profile, route: useAppStore.getState().keyHint === undefined ? "key" : "chat" });
  };

  enterKey = async (key: string, mode: CredentialStorageMode): Promise<EnterKeyOutcome> => {
    const outcome = await this.#services.keys.enter(key, mode);
    if (outcome.ok) useAppStore.setState({ keyHint: outcome.maskedHint, route: "chat", error: undefined });
    return outcome;
  };

  openKeySettings = (): void => {
    useAppStore.setState({ route: "key" });
  };

  newConversation = (): void => {
    if (useAppStore.getState().streaming) return;
    useAppStore.setState({ activeConversationId: undefined, messages: [], error: undefined });
  };

  openConversation = async (id: string): Promise<void> => {
    if (useAppStore.getState().streaming) return;
    const opened = await this.#services.conversations.open(id);
    if (!opened) return;
    useAppStore.setState({
      activeConversationId: id,
      messages: toChatMessages(opened.messages),
      error: undefined,
    });
  };

  deleteConversation = async (id: string): Promise<void> => {
    if (useAppStore.getState().streaming) return;
    await this.#services.conversations.delete(id);
    const wasActive = useAppStore.getState().activeConversationId === id;
    useAppStore.setState({
      conversations: await this.#services.conversations.list(),
      ...(wasActive && { activeConversationId: undefined, messages: [], error: undefined }),
    });
  };

  stop = (): void => {
    this.#abort?.abort();
  };

  /**
   * Asks the pipeline one question and shows the answer as it streams. Stopping or a dropped
   * connection leaves the partial answer, marked interrupted. Nothing here retries on its own.
   */
  send = async (text: string): Promise<void> => {
    const { pipeline, conversations } = this.#services;
    const state = useAppStore.getState();
    const profile = state.profile;
    if (state.streaming || !profile || text.trim() === "") return;

    const abort = new AbortController();
    this.#abort = abort;
    useAppStore.setState({ streaming: true, error: undefined });
    let conversationId = state.activeConversationId;
    try {
      if (conversationId === undefined) {
        const created = await conversations.create({
          capabilityId: CAPABILITY_ID,
          languageSnapshot: { mediation: profile.mediationLanguage, target: profile.targetLanguage },
        });
        conversationId = created.id;
        useAppStore.setState({ activeConversationId: conversationId });
      }
      const shown = useAppStore.getState().messages;
      useAppStore.setState({
        messages: [
          ...shown,
          { id: PENDING_USER_ID, author: "user", text },
          { id: PENDING_REPLY_ID, author: "assistant", status: "streaming", blocks: [] },
        ],
      });

      for await (const event of pipeline.run(
        { conversationId, capabilityId: CAPABILITY_ID, userText: text },
        abort.signal,
      )) {
        if (event.type === "render") {
          useAppStore.setState((s) => ({
            messages: s.messages.map((m) =>
              m.id === PENDING_REPLY_ID && m.author === "assistant" ? { ...m, blocks: event.blocks } : m,
            ),
          }));
        } else if (event.type === "error") {
          useAppStore.setState({
            error: {
              code: event.code,
              ...(event.retryAfterSeconds !== undefined && { retryAfterSeconds: event.retryAfterSeconds }),
            },
          });
        }
      }
    } catch {
      useAppStore.setState({ error: { code: "unknown" } });
    } finally {
      this.#abort = undefined;
      await this.#refresh(conversationId);
      useAppStore.setState({ streaming: false });
    }
  };

  /**
   * Asks again after an interrupted answer. The pipeline starts a fresh turn, so the question
   * appears again in the history; the interrupted answer stays visible, marked incomplete.
   */
  retry = async (messageId: string): Promise<void> => {
    const { messages } = useAppStore.getState();
    const at = messages.findIndex((m) => m.id === messageId);
    const question = messages.slice(0, at).findLast((m) => m.author === "user");
    if (question?.author === "user") await this.send(question.text);
  };

  /** Reloads what storage holds, which is the truth once a turn has ended. */
  async #refresh(conversationId: string | undefined): Promise<void> {
    const { conversations } = this.#services;
    const list = await conversations.list();
    const opened = conversationId === undefined ? undefined : await conversations.open(conversationId);
    useAppStore.setState({
      conversations: list,
      ...(opened && { messages: toChatMessages(opened.messages) }),
    });
  }

  #profileInput(draft: OnboardingDraft): ProfileInput {
    const language = this.#services.i18n.language;
    return {
      uiLanguage: isShippedUiLocale(language) ? language : DEFAULT_UI_LOCALE,
      mediationLanguage: draft.mediationLanguage,
      targetLanguage: draft.targetLanguage,
      level: draft.level,
      interests: draft.interests,
      toneId: DEFAULT_TONE_ID,
      configuredEffort: DEFAULT_EFFORT,
      modelId: this.#services.models.defaultId,
    };
  }
}
