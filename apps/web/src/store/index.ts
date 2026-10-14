import type { Conversation, CredentialStorageMode, LearnerProfile, ProviderErrorCode, SavedResource, UsageRecord } from "@tarjuman/core";
import type { ChatMessage, ThemePreference } from "@tarjuman/ui";
import { create } from "zustand";

/**
 * View state only. No domain logic lives here: the store remembers what is on screen, and
 * everything that matters (profile, conversations, keys) lives in `core` behind the ports. The
 * `AppController` is the only writer.
 */
export type RouteId = "onboarding" | "key" | "chat" | "settings" | "saved";

export interface AppState {
  /** False until the first load from storage finishes. */
  ready: boolean;
  route: RouteId;
  profile: LearnerProfile | undefined;
  /** Masked hint of the stored key; never the key. */
  keyHint: string | undefined;
  /** Where the key in use is kept. */
  keyMode: CredentialStorageMode | undefined;
  /** Masked hint and mode of every provider's stored key (004 FR-004); never a key. */
  storedKeys: Readonly<Record<string, { hint: string; mode: CredentialStorageMode }>>;
  conversations: Conversation[];
  activeConversationId: string | undefined;
  messages: ChatMessage[];
  /** Usage of the open conversation, oldest first. */
  usage: UsageRecord[];
  streaming: boolean;
  /** Set when the input guard withheld part of the last message (FR-011). */
  notice: { code: "key_shape_detected" } | undefined;
  error: { code: ProviderErrorCode; retryAfterSeconds?: number } | undefined;
  /** What the last turn's searches did, when it matters (005 FR-010). */
  searchNotice: { code: "search_incomplete" | "search_key_error" | "search_quota" | "search_declined" } | undefined;
  /** The saved list, newest first, and the ids to show Saved on a card (005 US4). */
  saved: SavedResource[];
  savedIds: ReadonlySet<string>;
  /** The last refresh of an expired card did not work. */
  refreshFailed: boolean;
  /** The search switch (005 FR-018). */
  searchEnabled: boolean;
  /**
   * Set when the model asked to search a source the learner has not agreed to (005 FR-019). The app
   * shows the consent dialog; the message is sent again as a new turn only after Agree.
   */
  consentRequest: { sourceId: string; text: string } | undefined;
  /** The theme choice shown by both theme controls. Not part of the profile: it exists before onboarding. */
  theme: ThemePreference;
  navigate: (route: RouteId) => void;
}

const initialData = {
  ready: false,
  route: "onboarding" as RouteId,
  profile: undefined,
  keyHint: undefined,
  keyMode: undefined,
  storedKeys: {},
  conversations: [],
  activeConversationId: undefined,
  messages: [],
  usage: [],
  streaming: false,
  notice: undefined,
  error: undefined,
  searchNotice: undefined,
  saved: [] as SavedResource[],
  savedIds: new Set<string>() as ReadonlySet<string>,
  refreshFailed: false,
  searchEnabled: true,
  consentRequest: undefined,
  theme: "system" as ThemePreference,
};

export const useAppStore = create<AppState>()((set) => ({
  ...initialData,
  navigate: (route) => set({ route }),
}));

/** Puts the store back to its first-run state: after "delete all my data", and between test cases. */
export function resetAppStore(): void {
  useAppStore.setState(initialData);
}
