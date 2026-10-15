import {
  CONFIGURABLE_EFFORTS,
  DEFAULT_EFFORT,
  DEFAULT_TONE_ID,
  DEFAULT_UI_LOCALE,
  guardInput,
  isExpired,
  isShippedUiLocale,
  renderSafeBlocks,
  TEST_ONLY_LOCALES,
  TONE_PRESETS,
  WITHHELD_MARKER,
  readStoredProfile,
  validateProfile,
  type CredentialStorageMode,
  type DeleteAllOutcome,
  type Effort,
  type EnterKeyOutcome,
  type ExpiredResourceCard,
  type ResourceCard,
  type LearnerProfile,
  type Message,
  type Segment,
  type ProfileInput,
  type ProfileIssue,
  type StoredProfile,
} from "@tarjuman/core";
import { applyTheme, type ChatMessage, type LanguageValues, type OnboardingDraft, type ThemePreference, type ThemeRoot } from "@tarjuman/ui";
import type { AppServices, ProviderOffer } from "./composition-root";
import type { TabSignal } from "./other-tabs";
import { resetAppStore, useAppStore } from "./store";

const CAPABILITY_ID = "language-qa";
const PENDING_USER_ID = "pending-user";
const PENDING_REPLY_ID = "pending-reply";
/** The search source of this build, and the credential id of its key (005). */
const SEARCH_SOURCE_ID = "youtube";

/**
 * How long a tab that heard `delete_started` waits for `delete_finished` before it restarts anyway
 * (001 FR-017a). Restarting earlier could reopen the database while the other tab still verifies it.
 */
export const RESTART_FALLBACK_MS = 5000;

const SEARCH_NOTICES: ReadonlySet<string> = new Set(["search_incomplete", "search_key_error", "search_quota"]);

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
      // A turn that searched shows only its cards' own links as links (005 FR-013).
      const blocks =
        message.searchCount !== undefined && message.searchCount > 0
          ? renderSafeBlocks(text, {
              allowedLinks: new Set((message.resources ?? []).flatMap((card) => (isExpired(card) ? [] : [card.link]))),
            })
          : renderSafeBlocks(text);
      result.push({
        id: message.id,
        author: "assistant",
        status: message.status,
        blocks,
        ...(message.resources !== undefined && { resources: message.resources }),
      });
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
  /** Another tab is deleting all data: this tab writes nothing more and waits to restart. */
  #stopped = false;
  #restartTimer: ReturnType<typeof setTimeout> | undefined;
  #restarted = false;

  constructor(services: AppServices, options: AppControllerOptions = {}) {
    this.#services = services;
    this.#themeRoot = "themeRoot" in options ? options.themeRoot : globalThis.document?.documentElement;
  }

  async boot(): Promise<void> {
    const { storage, credentials, conversations, i18n } = this.#services;
    this.#services.otherTabs.listen(this.#onOtherTab);
    // A profile saved before 004 has no provider: it is read as Anthropic's (FR-002).
    const profile = readStoredProfile(await storage.get<StoredProfile>("profile", "profile"));
    // A test locale chosen at start (`?locale=`) is kept; otherwise the saved interface language wins.
    const testLocaleActive = (TEST_ONLY_LOCALES as readonly string[]).includes(i18n.language);
    if (profile && isShippedUiLocale(profile.uiLanguage) && !testLocaleActive) await i18n.changeLanguage(profile.uiLanguage);
    const key = profile ? await credentials.describe(profile.providerId) : undefined;
    const storedKeys = await this.#storedKeys();
    const list = await conversations.list();
    const latest = list[0] === undefined ? undefined : await conversations.open(list[0].id);
    const usage = latest ? await conversations.usageOf(latest.conversation.id) : [];

    useAppStore.setState({
      ready: true,
      profile,
      keyHint: key?.maskedHint,
      keyMode: key?.storageMode,
      storedKeys,
      conversations: list,
      activeConversationId: latest?.conversation.id,
      messages: latest ? toChatMessages(latest.messages, this.#withheldLabel()) : [],
      usage,
      route: profile === undefined ? "onboarding" : key === undefined ? "key" : "chat",
      // theme-init.js has already applied it before first paint; this lets the controls show it.
      theme: this.#services.themes.get(),
      searchEnabled: await this.#services.searchSettings.isEnabled(),
      ...(await this.#savedState()),
    });
  }

  /** The saved list and the ids marked on cards. */
  async #savedState() {
    const saved = await this.#services.saved.list();
    return { saved, savedIds: new Set(saved.map((item) => item.id)) as ReadonlySet<string> };
  }

  /** Keeps a card for later. Only the learner's click does this; no tool can (005 US4). */
  saveResource = async (card: ResourceCard): Promise<void> => {
    await this.#services.saved.save(card);
    useAppStore.setState(await this.#savedState());
  };

  removeSavedResource = async (item: { sourceId: string; externalId: string }): Promise<void> => {
    await this.#services.saved.remove(item);
    useAppStore.setState(await this.#savedState());
  };

  openSaved = async (): Promise<void> => {
    useAppStore.setState({ route: "saved", refreshFailed: false, ...(await this.#savedState()) });
  };

  /**
   * Fetches an expired card again: one request, by the learner's own action, never retried. Whatever
   * the outcome, the screen shows what storage holds afterwards.
   */
  refreshResource = async (card: ExpiredResourceCard): Promise<void> => {
    const outcome = await this.#services.retention.refresh(card.sourceId, card.externalId, new AbortController().signal);
    const conversationId = useAppStore.getState().activeConversationId;
    useAppStore.setState({ refreshFailed: !outcome.ok, ...(await this.#savedState()) });
    if (conversationId !== undefined) await this.#refresh(conversationId);
  };

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
    const result = validateProfile(this.#profileInput(draft), { modelsByProvider: this.#modelsByProvider() });
    return result.ok ? [] : result.issues;
  };

  completeOnboarding = async (draft: OnboardingDraft): Promise<void> => {
    const result = validateProfile(this.#profileInput(draft), { modelsByProvider: this.#modelsByProvider() });
    if (!result.ok) return;
    const now = new Date().toISOString();
    const profile: LearnerProfile = { id: "profile", ...result.value, createdAt: now, updatedAt: now };
    await this.#services.storage.put("profile", profile);
    useAppStore.setState({ profile, route: useAppStore.getState().keyHint === undefined ? "key" : "chat" });
  };

  /** Validates and stores a key for the active provider; no other provider sees it (004 FR-007). */
  enterKey = async (key: string, mode: CredentialStorageMode): Promise<EnterKeyOutcome> => {
    const providerId = useAppStore.getState().profile?.providerId;
    if (providerId === undefined) return { ok: false, code: "bad_request" };
    const outcome = await this.#services.keys.enter(providerId, key, mode);
    if (outcome.ok) {
      useAppStore.setState({ keyHint: outcome.maskedHint, keyMode: mode, route: "chat", error: undefined, storedKeys: await this.#storedKeys() });
    }
    return outcome;
  };

  /** Replaces the key from the settings screen. A rejected key keeps the old one (US7-1). */
  replaceKey = async (key: string, mode: CredentialStorageMode): Promise<EnterKeyOutcome> => {
    const providerId = useAppStore.getState().profile?.providerId;
    if (providerId === undefined) return { ok: false, code: "bad_request" };
    const outcome = await this.#services.keys.replace(providerId, key, mode);
    if (outcome.ok) {
      useAppStore.setState({ keyHint: outcome.maskedHint, keyMode: mode, error: undefined, storedKeys: await this.#storedKeys() });
    }
    return outcome;
  };

  /** Deletes the key. The profile and history stay; the app asks for a key again. */
  removeKey = async (): Promise<void> => {
    const { streaming, profile } = useAppStore.getState();
    if (streaming || !profile) return;
    await this.#services.keys.remove(profile.providerId);
    useAppStore.setState({ keyHint: undefined, keyMode: undefined, route: "key", error: undefined, storedKeys: await this.#storedKeys() });
  };

  /**
   * Makes another offered provider the active one (004 US2). The model resets to that provider's
   * default and the effort is kept (the pipeline drops it for a model without effort). Every key and
   * conversation stays. Without a key for the new provider the key screen opens, so nothing can be
   * sent until one is validated.
   */
  switchProvider = async (providerId: string): Promise<void> => {
    const { profile, streaming } = useAppStore.getState();
    const offer = this.#offer(providerId);
    if (!profile || streaming || !offer || providerId === profile.providerId) return;
    const updated: LearnerProfile = {
      ...profile,
      providerId,
      modelId: offer.defaultModelId,
      updatedAt: new Date().toISOString(),
    };
    await this.#services.storage.put("profile", updated);
    const key = await this.#services.credentials.describe(providerId);
    useAppStore.setState({
      profile: updated,
      keyHint: key?.maskedHint,
      keyMode: key?.storageMode,
      error: undefined,
      ...(key === undefined && { route: "key" as const }),
    });
  };

  /**
   * "Delete all my data" (FR-017). On success the screen state is dropped too and the app is back
   * at first-run onboarding. A deletion that could not be verified leaves the screen as it is, so
   * the settings screen can say so.
   */
  deleteAllData = async (): Promise<DeleteAllOutcome> => {
    if (useAppStore.getState().streaming) return { ok: false, code: "not_verified" };
    // The other tabs stop writing before anything is deleted, and restart once it is over (FR-017a).
    const { otherTabs } = this.#services;
    otherTabs.announce("delete_started");
    let outcome: DeleteAllOutcome;
    try {
      outcome = await this.#services.data.deleteAll();
    } finally {
      otherTabs.announce("delete_finished");
    }
    if (outcome.ok) {
      // The stored choice is gone with everything else (003 FR-003a), so the device decides again.
      if (this.#themeRoot) applyTheme("system", this.#themeRoot);
      resetAppStore();
      useAppStore.setState({ ready: true, route: "onboarding", theme: "system" });
    }
    return outcome;
  };

  /**
   * Another tab announced "delete all my data" (001 FR-017a). This tab stops writing at once (an
   * answer in flight is aborted and cannot store anything), forgets its session-only keys and its
   * screen, and shows the loading line until it restarts: when the deletion has finished, or after
   * `RESTART_FALLBACK_MS` if it never hears that it did.
   */
  #onOtherTab = (signal: TabSignal): void => {
    if (!this.#stopped) {
      this.#stopped = true;
      this.#services.stopWriting();
      this.#abort?.abort();
      resetAppStore();
    }
    if (signal === "delete_finished") this.#restart();
    else this.#restartTimer ??= setTimeout(() => this.#restart(), RESTART_FALLBACK_MS);
  };

  #restart(): void {
    if (this.#restarted) return;
    this.#restarted = true;
    clearTimeout(this.#restartTimer);
    this.#services.restart();
  }

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
      change.modelId !== undefined && this.#modelIdsOf(profile.providerId).includes(change.modelId)
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
    const result = validateProfile(this.#languageInput(profile, candidate), { modelsByProvider: this.#modelsByProvider() });
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
    const result = validateProfile(this.#languageInput(profile, candidate), { modelsByProvider: this.#modelsByProvider() });
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

  dismissSearchNotice = (): void => {
    useAppStore.setState({ searchNotice: undefined });
  };

  /** Turns search on or off (005 FR-018). Off means no search request is made at all. */
  setSearchEnabled = async (enabled: boolean): Promise<void> => {
    // The switch moves at once; the choice is stored right after.
    useAppStore.setState({ searchEnabled: enabled });
    await this.#services.searchSettings.setEnabled(enabled);
  };

  /** Validates and stores the search key (credential id `youtube`); no other credential sees it. */
  enterSearchKey = async (key: string, mode: CredentialStorageMode): Promise<EnterKeyOutcome> => {
    const outcome = await this.#services.keys.enter(SEARCH_SOURCE_ID, key, mode);
    if (outcome.ok) useAppStore.setState({ storedKeys: await this.#storedKeys() });
    return outcome;
  };

  /** Replaces the search key; a rejected key keeps the old one. */
  replaceSearchKey = async (key: string, mode: CredentialStorageMode): Promise<EnterKeyOutcome> => {
    const outcome = await this.#services.keys.replace(SEARCH_SOURCE_ID, key, mode);
    if (outcome.ok) useAppStore.setState({ storedKeys: await this.#storedKeys() });
    return outcome;
  };

  removeSearchKey = async (): Promise<void> => {
    if (useAppStore.getState().streaming) return;
    await this.#services.keys.remove(SEARCH_SOURCE_ID);
    useAppStore.setState({ storedKeys: await this.#storedKeys() });
  };

  /**
   * The learner agrees to send searches to the source the model asked for (005 FR-019). Consent is
   * recorded against the source's current terms version, and the same message is sent again as a
   * new turn: the learner's own action, not a retry.
   */
  agreeToSearch = async (): Promise<void> => {
    const request = useAppStore.getState().consentRequest;
    if (!request) return;
    const version = this.#services.search.termsVersionOf(request.sourceId);
    if (version !== undefined) await this.#services.searchSettings.recordConsent(request.sourceId, version);
    useAppStore.setState({ consentRequest: undefined });
    await this.send(request.text);
  };

  /** The learner declines: nothing is sent or searched, and a short note says so. */
  declineSearch = (): void => {
    useAppStore.setState({ consentRequest: undefined, searchNotice: { code: "search_declined" } });
  };

  /** Where a search-key problem sends the learner: the settings screen. */
  openSearchSettings = (): void => {
    useAppStore.setState({ route: "settings", searchNotice: undefined });
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
    useAppStore.setState({ streaming: true, error: undefined, notice: undefined, searchNotice: undefined });
    let conversationId = state.activeConversationId;
    try {
      if (conversationId === undefined) {
        const created = await conversations.create({
          capabilityId: CAPABILITY_ID,
          languageSnapshot: { mediation: profile.mediationLanguage, target: profile.targetLanguage },
        });
        conversationId = created.id;
        if (this.#stopped) return;
        useAppStore.setState({ activeConversationId: conversationId, usage: [] });
      }
      // Another tab started deleting all data while the conversation was being created.
      if (this.#stopped) return;
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
        // Another tab is deleting all data: the screen was reset, and nothing more is shown.
        if (this.#stopped) break;
        if (event.type === "render") {
          useAppStore.setState((s) => ({
            messages: s.messages.map((m) =>
              m.id === PENDING_REPLY_ID && m.author === "assistant" ? { ...m, blocks: event.blocks, searching: false } : m,
            ),
          }));
        } else if (event.type === "status") {
          useAppStore.setState((s) => ({
            messages: s.messages.map((m) =>
              m.id === PENDING_REPLY_ID && m.author === "assistant" ? { ...m, searching: true } : m,
            ),
          }));
        } else if (event.type === "resources") {
          useAppStore.setState((s) => ({
            messages: s.messages.map((m) =>
              m.id === PENDING_REPLY_ID && m.author === "assistant" ? { ...m, resources: event.cards } : m,
            ),
          }));
        } else if (event.type === "notice" && SEARCH_NOTICES.has(event.code)) {
          useAppStore.setState({ searchNotice: { code: event.code as "search_incomplete" | "search_key_error" | "search_quota" } });
        } else if (event.type === "done" && event.status === "consent_required" && event.sourceId !== undefined) {
          useAppStore.setState({ consentRequest: { sourceId: event.sourceId, text } });
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
      if (!this.#stopped) useAppStore.setState({ error: { code: "unknown" } });
    } finally {
      this.#abort = undefined;
      // A stopped tab reads nothing back: its storage refuses, and its screen stays reset.
      if (!this.#stopped) {
        await this.#refresh(conversationId);
        useAppStore.setState({ streaming: false });
      }
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

  /** Hints of every stored key, by provider. Never the keys: `describe` cannot return one. */
  async #storedKeys(): Promise<Record<string, { hint: string; mode: CredentialStorageMode }>> {
    const list = await this.#services.credentials.list();
    return Object.fromEntries(list.map((d) => [d.providerId, { hint: d.maskedHint, mode: d.storageMode }]));
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
      providerId: profile.providerId,
      modelId: profile.modelId,
      uiLanguage: isShippedUiLocale(candidate.uiLanguage) ? candidate.uiLanguage : profile.uiLanguage,
      mediationLanguage: candidate.mediationLanguage,
      targetLanguage: candidate.targetLanguage,
    };
  }

  /** The provider offer with this id, if the build offers it. */
  #offer(providerId: string): ProviderOffer | undefined {
    return this.#services.providers.find((offer) => offer.id === providerId);
  }

  #modelIdsOf(providerId: string): string[] {
    return this.#offer(providerId)?.models.map((model) => model.id) ?? [];
  }

  #modelsByProvider(): Record<string, string[]> {
    return Object.fromEntries(this.#services.providers.map((offer) => [offer.id, this.#modelIdsOf(offer.id)]));
  }

  #profileInput(draft: OnboardingDraft): ProfileInput {
    const language = this.#services.i18n.language;
    // With one provider there is nothing to choose; with several, the learner must pick (004 FR-001).
    const only = this.#services.providers.length === 1 ? this.#services.providers[0]?.id : undefined;
    const providerId = draft.providerId ?? only ?? "";
    return {
      uiLanguage: isShippedUiLocale(language) ? language : DEFAULT_UI_LOCALE,
      mediationLanguage: draft.mediationLanguage,
      targetLanguage: draft.targetLanguage,
      level: draft.level,
      interests: draft.interests,
      toneId: DEFAULT_TONE_ID,
      configuredEffort: DEFAULT_EFFORT,
      providerId,
      modelId: this.#offer(providerId)?.defaultModelId ?? "",
    };
  }
}
