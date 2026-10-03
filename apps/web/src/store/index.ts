import { create } from "zustand";

/**
 * View state only. No domain logic lives here: the store remembers which screen is showing, and
 * everything that matters (profile, conversations, keys) lives in `core` behind the ports.
 */
export type RouteId = "onboarding" | "key" | "chat" | "settings";

export interface AppState {
  route: RouteId;
  navigate: (route: RouteId) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  route: "onboarding",
  navigate: (route) => set({ route }),
}));
