import type { Conversation, LearnerProfile, ProviderErrorCode } from "@tarjuman/core";
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
  conversations: Conversation[];
  activeConversationId: string | undefined;
  messages: ChatMessage[];
  streaming: boolean;
  error: { code: ProviderErrorCode; retryAfterSeconds?: number } | undefined;
  navigate: (route: RouteId) => void;
}

const initialData = {
  ready: false,
  route: "onboarding" as RouteId,
  profile: undefined,
  keyHint: undefined,
  conversations: [],
  activeConversationId: undefined,
  messages: [],
  streaming: false,
  error: undefined,
};

export const useAppStore = create<AppState>()((set) => ({
  ...initialData,
  navigate: (route) => set({ route }),
}));

/** Puts the store back to its first-run state. Tests use it between cases. */
export function resetAppStore(): void {
  useAppStore.setState(initialData);
}
