/**
 * Tells the other open Tarjuman tabs on this device that "delete all my data" is running
 * (001 FR-017a, security review finding 1). Without it another tab keeps its screen and its
 * session-only keys, and its next write recreates the deleted database.
 *
 * The deleting tab announces `delete_started` before it deletes anything and `delete_finished`
 * once it is done, whatever the outcome. A tab never hears its own announcements.
 */
export type TabSignal = "delete_started" | "delete_finished";

export interface OtherTabs {
  announce(signal: TabSignal): void;
  /** Calls `listener` for every signal another tab announces. Returns a function that removes it. */
  listen(listener: (signal: TabSignal) => void): () => void;
  close(): void;
}

/** Same name in every tab of this origin. Prefixed like every other Tarjuman browser key. */
export const OTHER_TABS_CHANNEL = "tarjuman.data";

const SIGNALS: ReadonlySet<unknown> = new Set<TabSignal>(["delete_started", "delete_finished"]);

/** The part of `BroadcastChannel` used here, so a test or an old browser can pass something else. */
export interface ChannelLike {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  close(): void;
}

function browserChannel(name: string): ChannelLike | undefined {
  return typeof BroadcastChannel === "function" ? new BroadcastChannel(name) : undefined;
}

/**
 * Where the browser has no `BroadcastChannel` this does nothing, and the other tab keeps the old
 * behavior (security review finding 1 then stands for that browser).
 */
export function createOtherTabs(open: (name: string) => ChannelLike | undefined = browserChannel): OtherTabs {
  const channel = open(OTHER_TABS_CHANNEL);
  return {
    announce(signal) {
      channel?.postMessage(signal);
    },
    listen(listener) {
      // Anything else on the channel is ignored: only the two fixed strings mean something.
      const onMessage = (event: { data: unknown }) => {
        if (SIGNALS.has(event.data)) listener(event.data as TabSignal);
      };
      channel?.addEventListener("message", onMessage);
      return () => channel?.removeEventListener("message", onMessage);
    },
    close() {
      channel?.close();
    },
  };
}

/** For wiring that has no other tabs to tell, such as tests of a single tab. */
export const noOtherTabs: OtherTabs = Object.freeze({
  announce: () => undefined,
  listen: () => () => undefined,
  close: () => undefined,
});
