import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { SearchSettings, type SearchSettingsProps } from "../src/settings/SearchSettings";
import { render } from "./render";

// Internet search settings (005 FR-018): the on/off switch and the YouTube key, which is stored
// like any other and shown only as a masked hint.

const props: SearchSettingsProps = {
  enabled: true,
  storageAvailable: true,
  onToggle: () => {},
  onEnterKey: async () => ({ ok: true as const, maskedHint: "AIza…0001" }),
  onReplaceKey: async () => ({ ok: true as const, maskedHint: "AIza…0002" }),
  onRemoveKey: () => {},
};

const show = (overrides: Partial<SearchSettingsProps> = {}, locale = "en") =>
  render(createElement(SearchSettings, { ...props, ...overrides }), locale);

describe("SearchSettings", () => {
  it.each(["en", "es"])("has every string in %s", async (locale) => {
    for (const overrides of [{}, { defaultAdding: true }, { keyHint: "AIza…0001", keyMode: "persistent" as const }, { enabled: false }]) {
      expect((await show(overrides, locale)).missing).toEqual([]);
    }
  });

  it("shows the switch on or off", async () => {
    expect((await show({ enabled: true })).html).toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
    expect((await show({ enabled: false })).html).not.toMatch(/type="checkbox"[^>]*checked/);
  });

  it("explains what is sent, and what is not", async () => {
    const { html } = await show();
    expect(html).toContain("search terms");
    expect(html).toContain("not your conversation");
  });

  it("offers to add a key, behind a button, when none is stored", async () => {
    const { html } = await show();
    expect(html).toContain("No search key yet");
    expect(html).toContain("Add search key");
    expect(html).not.toContain('type="password"');
  });

  it("asks for a key, with the help text, once the learner chooses to add one", async () => {
    const { html } = await show({ defaultAdding: true });
    expect(html).toContain('type="password"');
    expect(html).toContain("YouTube Data API v3");
    expect(html).toContain("HTTP referrer");
  });

  it("explains how to create the key as plain text, with no link that would add an origin", async () => {
    const { html } = await show({ defaultAdding: true });
    expect(html).not.toMatch(/<a\b/);
    expect(html).not.toContain("href=");
  });

  it("shows only the masked hint and where the key is kept once stored, with no key field", async () => {
    const { html } = await show({ keyHint: "AIza…0001", keyMode: "session" });
    expect(html).toContain("AIza…0001");
    expect(html).toContain("this session only");
    expect(html).not.toContain('type="password"');
    expect(html).toContain("Replace key");
    expect(html).toContain("Delete key");
  });

  it("disables the controls while an answer is streaming", async () => {
    const { html } = await show({ keyHint: "AIza…0001", keyMode: "persistent", disabled: true });
    expect(html.match(/disabled/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("names the key as the YouTube search key, with its own label and button", async () => {
    const { html } = await show({ defaultAdding: true });
    expect(html).toContain("YouTube search key");
    expect(html).toContain("Search API key");
    expect(html).toContain("Save search key");
  });
});
