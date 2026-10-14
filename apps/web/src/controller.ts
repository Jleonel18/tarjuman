import {
  CONFIGURABLE_EFFORTS,
  DEFAULT_EFFORT,
  DEFAULT_TONE_ID,
  DEFAULT_UI_LOCALE,
  guardInput,
  isShippedUiLocale,
  renderSafeBlocks,
  TEST_ONLY_LOCALES,
  TONE_PRESETS,
  WITHHELD_MARKER,
  validateProfile,
  type CredentialStorageMode,
  type DeleteAllOutcome,
  type Effort,
  type EnterKeyOutcome,
  type LearnerProfile,
  type Message,
  type Segment,
  type ProfileInput,
  type ProfileIssue,
} from "@tarjuman/core";
import { applyTheme, type ChatMessage, type LanguageValues, type OnboardingDraft, type ThemePreference, type ThemeRoot } from "@tarjuman/ui";
import type { AppServices } from "./composition-root";
import { resetAppStore, useAppStore } from "./store";

const CAPABILITY_ID = "language-qa";
const PENDING_USER_ID = "pending-user";
const PENDING_REPLY_ID = "pending-reply";

/**
 * What the learner typed, as shown back to them. Pasted material is not part of it, and a token the
 * input guard withheld shows as `withheldLabel` (a catalog string), so a key is never on screen.
 */
function typedText(segments: readonly Segment[], withheldLabel: string | undefined): string {
  return segments
    .map((segment) => {
      if (segment.trust === "user") return segment.text;
      if (segment.trust === "trusted" && segment.text === WITHHELD_MARKER) return withheldLabel ?? "";
      return "";
    })
    .join("");
}

/** Turns stored messages into what the chat shows. Model text goes through the OutputGuard here. */
export function toChatMessages(messages: readonly Message[], withheldLabel?: string): ChatMessage[] {
  const result: ChatMessage[] = [];
  for (const message of messages) {
    if (message.author === "user") {
      result.push({ id: message.id, author: "user", text: typedText(message.segments, withheldLabel) });
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
export interface AppControllerOptions {
  /** Where the theme is applied. Defaults to <html>; tests pass a stand-in. */
  themeRoot?: ThemeRoot | undefined;
}

export class AppController {
  readonly #services: AppServices;
  readonly #themeRoot: ThemeRoot | undefined;
  #abort: AbortController | undefined;

  constructor(services: AppServices, options: AppControllerOptions = {}) {
    this.#services = services;
    this.#themeRoot = "themeRoot" in options ? options.themeRoot : globalThis.document?.documentElement;
  }

  async boot(): Promise<void> {
    const { storage, credentials, conversations, i18n } = this.#services;
    const profile = await storage.get<LearnerProfile>("profile", "profile");
    // A test locale chosen at start (`?locale=`) is kept; otherwise the saved interface language wins.
    const testLocaleActive = (TEST_ONLY_LOCALES as readonly string[]).includes(i18n.language);
    if (profile && isShippedUiLocale(profile.uiLanguage) && !testLocaleActive) await i18n.changeLanguage(profile.uiLanguage);
    const key = await credentials.describe();
    const list = await conversations.list();
    const latest = list[0] === undefined ? undefined : await conversations.open(list[0].id);
    const usage = latest ? await conversations.usageOf(latest.conversation.id) : [];

    useAppStore.setState({
      ready: true,
      profile,
      keyHint: key?.maskedHint,
      keyMode: key?.storageMode,
      conversations: list,
      activeConversationId: latest?.conversation.id,
      messages: latest ? toChatMessages(latest.messages, this.#withheldLabel()) : [],
      usage,
      route: profile === undefined ? "onboarding" : key === undefined ? "key" : "chat",
      // theme-init.js has already applied it before first paint; this lets the controls show it.
      theme: this.#services.themes.get(),
    });
  }

  /**
   * Light, dark, or follow the device (003 FR-003). Takes effect at once, with no reload, and does
   * not touch a running answer. Works before onboarding, because it is not part of the profile.
   */
  setTheme = (preference: ThemePreference): void => {
    this.#services.themes.set(preference);
    if (this.#themeRoot) applyTheme(preference, this.#themeRoot);
    useAppStore.setState({ theme: preference });
  };

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
    if (outcome.ok) useAppStore.setState({ keyHint: outcome.maskedHint, keyMode: mode, route: "chat", error: undefined });
    return outcome;
  };

  /** Replaces the key from the settings screen. A rejected key keeps the old one (US7-1). */
  replaceKey = async (key: string, mode: CredentialStorageMode): Promise<EnterKeyOutcome> => {
    const outcome = await this.#services.keys.replace(key, mode);
    if (outcome.ok) useAppStore.setState({ keyHint: outcome.maskedHint, keyMode: mode, error: undefined });
    return outcome;
  };

  /** Deletes the key. The profile and history stay; the app asks for a key again. */
  removeKey = async (): Promise<void> => {
    if (useAppStore.getState().streaming) return;
    await this.#services.keys.remove();
    useAppStore.setState({ keyHint: undefined, keyMode: undefined, route: "key", error: undefined });
  };

  /**
   * "Delete all my data" (FR-017). On success the screen state is dropped too and the app is back
   * at first-run onboarding. A deletion that could not be verified leaves the screen as it is, so
   * the settings screen can say so.
   */
  deleteAllData = async (): Promise<DeleteAllOutcome> => {
    if (useAppStore.getState().streaming) return { ok: false, code: "not_verified" };
    const outcome = await this.#services.data.deleteAll();
    if (outcome.ok) {
      // The stored choice is gone with everything else (003 FR-003a), so the device decides again.
      if (this.#themeRoot) applyTheme("system", this.#themeRoot);
      resetAppStore();
      useAppStore.setState({ ready: true, route: "onboarding", theme: "system" });
    }
    return outcome;
  };

  /** Where a key error sends the learner: the settings screen, to replace the key. */
  openKeySettings = (): void => {
    useAppStore.setState({ route: "settings" });
  };

  newConversation = (): void => {
    if (useAppStore.getState().streaming) return;
    useAppStore.setState({ activeConversationId: undefined, messages: [], usage: [], error: undefined });
  };

  openConversation = async (id: string): Promise<void> => {
    if (useAppStore.getState().streaming) return;
    const opened = await this.#services.conversations.open(id);
    if (!opened) return;
    useAppStore.setState({
      activeConversationId: id,
      messages: toChatMessages(opened.messages, this.#withheldLabel()),
      usage: await this.#services.conversations.usageOf(id),
      error: undefined,
    });
  };

  deleteConversation = async (id: string): Promise<void> => {
    if (useAppStore.getState().streaming) return;
    await this.#services.conversations.delete(id);
    const wasActive = useAppStore.getState().activeConversationId === id;
    useAppStore.setState({
      conversations: await this.#services.conversations.list(),
      ...(wasActive && { activeConversationId: undefined, messages: [], usage: [], error: undefined }),
    });
  };

  /**
   * Changes the model or the effort for the next question. Unknown models and effort levels the
   * app does not offer are ignored, so a stale or forged value cannot reach the profile.
   */
  updateModelSettings = async (change: { modelId?: string; effort?: Effort }): Promise<void> => {
    const profile = useAppStore.getState().profile;
    if (!profile || useAppStore.getState().streaming) return;
    const modelId =
      change.modelId !== undefined && this.#services.models.ids.includes(change.modelId)
        ? change.modelId
        : profile.modelId;
    const configuredEffort =
      change.effort !== undefined && CONFIGURABLE_EFFORTS.includes(change.effort)
        ? change.effort
        : profile.configuredEffort;
    if (modelId === profile.modelId && configuredEffort === profile.configuredEffort) return;
    const updated: LearnerProfile = { ...profile, modelId, configuredEffort, updatedAt: new Date().toISOString() };
    await this.#services.storage.put("profile", updated);
    useAppStore.setState({ profile: updated });
  };

  /**
   * The core's verdict on the three language settings as they would become. A test-only interface
   * locale is not part of a stored profile, so it is checked as the shipped language in use.
   */
  validateLanguages = (candidate: LanguageValues): readonly ProfileIssue[] => {
    const profile = useAppStore.getState().profile;
    if (!profile) return [];
    const result = validateProfile(this.#languageInput(profile, candidate), { knownModelIds: this.#services.models.ids });
    return result.ok ? [] : result.issues;
  };

  /**
   * Changes the interface, explanation or target language, each on its own. Nothing is stored when
   * the core rejects the result (explanation language equal to the target). The interface language
   * takes effect at once; it applies to the next question, not the running answer, for the others.
   */
  updateLanguages = async (change: Partial<LanguageValues>): Promise<void> => {
    const profile = useAppStore.getState().profile;
    if (!profile || useAppStore.getState().streaming) return;
    const candidate: LanguageValues = {
      uiLanguage: change.uiLanguage ?? this.#services.i18n.language,
      mediationLanguage: change.mediationLanguage ?? profile.mediationLanguage,
      targetLanguage: change.targetLanguage ?? profile.targetLanguage,
    };
    const result = validateProfile(this.#languageInput(profile, candidate), { knownModelIds: this.#services.models.ids });
    if (!result.ok) return;
    if (change.uiLanguage !== undefined && this.#services.uiLocales.includes(change.uiLanguage)) {
      await this.#services.i18n.changeLanguage(change.uiLanguage);
    }
    const { uiLanguage, mediationLanguage, targetLanguage } = result.value;
    if (
      uiLanguage === profile.uiLanguage &&
      mediationLanguage === profile.mediationLanguage &&
      targetLanguage === profile.targetLanguage
    ) {
      return;
    }
    const updated: LearnerProfile = { ...profile, uiLanguage, mediationLanguage, targetLanguage, updatedAt: new Date().toISOString() };
    await this.#services.storage.put("profile", updated);
    useAppStore.setState({ profile: updated });
  };

  /** Changes the tone for the next question. An id that is not a known preset is ignored. */
  updateTone = async (toneId: string): Promise<void> => {
    const profile = useAppStore.getState().profile;
    if (!profile || useAppStore.getState().streaming) return;
    if (!TONE_PRESETS.some((p) => p.id === toneId) || toneId === profile.toneId) return;
    const updated: LearnerProfile = { ...profile, toneId, updatedAt: new Date().toISOString() };
    await this.#services.storage.put("profile", updated);
    useAppStore.setState({ profile: updated });
  };

  dismissNotice = (): void => {
    useAppStore.setState({ notice: undefined });
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
    useAppStore.setState({ streaming: true, error: undefined, notice: undefined });
    let conversationId = state.activeConversationId;
    try {
      if (conversationId === undefined) {
        const created = await conversations.create({
          capabilityId: CAPABILITY_ID,
          languageSnapshot: { mediation: profile.mediationLanguage, target: profile.targetLanguage },
        });
        conversationId = created.id;
        useAppStore.setState({ activeConversationId: conversationId, usage: [] });
      }
      const shown = useAppStore.getState().messages;
      useAppStore.setState({
        messages: [
          ...shown,
          // The same view the stored message will have, so a pasted key is never shown, even briefly.
          { id: PENDING_USER_ID, author: "user", text: typedText(guardInput({ userText: text }).segments, this.#withheldLabel()) },
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
        } else if (event.type === "guard_warning") {
          useAppStore.setState({ notice: { code: event.code } });
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
      ...(opened && {
        messages: toChatMessages(opened.messages, this.#withheldLabel()),
        usage: await conversations.usageOf(opened.conversation.id),
      }),
    });
  }

  #withheldLabel(): string {
    return this.#services.i18n.t("chat.withheld");
  }

  #languageInput(profile: LearnerProfile, candidate: LanguageValues): ProfileInput {
    return {
      level: profile.level,
      interests: profile.interests,
      toneId: profile.toneId,
      configuredEffort: profile.configuredEffort,
      modelId: profile.modelId,
      uiLanguage: isShippedUiLocale(candidate.uiLanguage) ? candidate.uiLanguage : profile.uiLanguage,
      mediationLanguage: candidate.mediationLanguage,
      targetLanguage: candidate.targetLanguage,
    };
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
