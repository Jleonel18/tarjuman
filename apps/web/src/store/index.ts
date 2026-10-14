import type { Conversation, CredentialStorageMode, LearnerProfile, ProviderErrorCode, UsageRecord } from "@tarjuman/core";
import type { ChatMessage } from "@tarjuman/ui";
import { create } from "zustand";

/**
 * View state only. No domain logic lives here: the store remembers what is on screen, and
 * everything that matters (profile, conversations, keys) lives in `core` behind the ports. The
 * `AppController` is the only writer.
 */
export type RouteId = "onboarding" | "key" | "chat" | "settings";

export interface AppState {
  /** False until the first load from storage finishes. */
  ready: boolean;
  route: RouteId;
  profile: LearnerProfile | undefined;
  /** Masked hint of the stored key; never the key. */
  keyHint: string | undefined;
  /** Where the key in use is kept. */
  keyMode: CredentialStorageMode | undefined;
  conversations: Conversation[];
  activeConversationId: string | undefined;
  messages: ChatMessage[];
  /** Usage of the open conversation, oldest first. */
  usage: UsageRecord[];
  streaming: boolean;
  /** Set when the input guard withheld part of the last message (FR-011). */
  notice: { code: "key_shape_detected" } | undefined;
  error: { code: ProviderErrorCode; retryAfterSeconds?: number } | undefined;
  navigate: (route: RouteId) => void;
}

const initialData = {
  ready: false,
  route: "onboarding" as RouteId,
  profile: undefined,
  keyHint: undefined,
  keyMode: undefined,
  conversations: [],
  activeConversationId: undefined,
  messages: [],
  usage: [],
  streaming: false,
  notice: undefined,
  error: undefined,
};

export const useAppStore = create<AppState>()((set) => ({
  ...initialData,
  navigate: (route) => set({ route }),
}));

/** Puts the store back to its first-run state: after "delete all my data", and between test cases. */
export function resetAppStore(): void {
  useAppStore.setState(initialData);
}
