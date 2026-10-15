import { afterEach, describe, expect, it } from "vitest";
import { createOtherTabs, OTHER_TABS_CHANNEL, type OtherTabs, type TabSignal } from "../src/other-tabs";

// The signal "delete all my data" sends to the other open tabs (001 FR-017a). Runs on the
// runtime's own BroadcastChannel, which delivers between instances with the same name.

const opened: OtherTabs[] = [];
const open = (...args: Parameters<typeof createOtherTabs>): OtherTabs => {
  const tabs = createOtherTabs(...args);
  opened.push(tabs);
  return tabs;
};

afterEach(() => {
  for (const tabs of opened.splice(0)) tabs.close();
});

function nextSignal(tabs: OtherTabs): Promise<TabSignal> {
  return new Promise((resolve) => {
    const stop = tabs.listen((signal) => {
      stop();
      resolve(signal);
    });
  });
}

describe("createOtherTabs", () => {
  it("delivers delete_started and delete_finished to another tab, in order", async () => {
    const deleting = open();
    const other = open();
    const heard: TabSignal[] = [];
    const both = new Promise<void>((resolve) => {
      other.listen((signal) => {
        heard.push(signal);
        if (heard.length === 2) resolve();
      });
    });
    deleting.announce("delete_started");
    deleting.announce("delete_finished");
    await both;
    expect(heard).toEqual(["delete_started", "delete_finished"]);
  });

  it("does not deliver a tab's own announcement back to it", async () => {
    const deleting = open();
    const other = open();
    const own: TabSignal[] = [];
    deleting.listen((signal) => own.push(signal));
    const received = nextSignal(other);
    deleting.announce("delete_started");
    await received;
    expect(own).toEqual([]);
  });

  it("ignores anything that is not one of its signals", async () => {
    const other = open();
    const heard: TabSignal[] = [];
    other.listen((signal) => heard.push(signal));
    const stranger = new BroadcastChannel(OTHER_TABS_CHANNEL);
    for (const junk of ["reset", { type: "delete_started" }, 42, null, "DELETE_STARTED"]) stranger.postMessage(junk);
    const received = nextSignal(other);
    stranger.postMessage("delete_finished");
    await received;
    stranger.close();
    expect(heard).toEqual(["delete_finished"]);
  });

  it("stops calling a listener once it is removed", async () => {
    const deleting = open();
    const other = open();
    const removed: TabSignal[] = [];
    other.listen((signal) => removed.push(signal))();
    const received = nextSignal(other);
    deleting.announce("delete_started");
    await received;
    expect(removed).toEqual([]);
  });

  it("is a silent no-op where the browser has no BroadcastChannel", () => {
    const tabs = open(() => undefined);
    expect(() => tabs.announce("delete_started")).not.toThrow();
    expect(typeof tabs.listen(() => undefined)).toBe("function");
    expect(() => tabs.close()).not.toThrow();
  });
});
