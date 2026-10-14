import type { ExpiredResourceCard, ResourceCard, SavedResource } from "@tarjuman/core";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { SavedResources } from "../src/resources/SavedResources";
import { render } from "./render";

const noop = () => {};
const live: ResourceCard = {
  ref: "r1",
  sourceId: "youtube",
  sourceDisplay: "YouTube (youtube.com)",
  externalId: "aaaaaaaaaaa",
  title: "Escalada",
  channel: "Club",
  durationSeconds: 100,
  hasCaptions: true,
  audioLanguage: "es",
  type: "video",
  priceLabel: "free",
  accessNote: null,
  sponsored: false,
  affiliate: false,
  link: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
  fetchedAt: "2026-10-14T00:00:00.000Z",
  fitNote: "Good fit.",
  difficulty: "about_right",
};
const expired: ExpiredResourceCard = { expired: true, sourceId: "youtube", externalId: "bbbbbbbbbbb", fetchedAt: "2026-08-01T00:00:00.000Z" };
const item = (card: SavedResource["card"], id: string): SavedResource => ({ id, card, savedAt: "2026-10-14T00:00:00.000Z" });

const show = (items: SavedResource[], locale = "en") =>
  render(createElement(SavedResources, { items, onRemove: noop, onRefresh: noop }), locale);

describe.each(["en", "es"])("SavedResources in %s", (locale) => {
  it("has every string", async () => {
    for (const items of [[], [item(live, "youtube:aaaaaaaaaaa"), item(expired, "youtube:bbbbbbbbbbb")]]) {
      expect((await show(items, locale)).missing).toEqual([]);
    }
  });

  it("says so when nothing is saved", async () => {
    const { html } = await show([], locale);
    expect(html).toContain(locale === "en" ? "Nothing saved yet" : "Aún no guardaste nada");
    expect(html).not.toContain("<ol");
  });
});

describe("SavedResources", () => {
  it("lists each saved card with its labels, a Remove button, and no Save button", async () => {
    const { html } = await show([item(live, "youtube:aaaaaaaaaaa")]);
    expect(html).toContain("Escalada");
    expect(html).toContain("Good fit.");
    expect(html).toContain("Remove from saved");
    expect(html).not.toMatch(/>Save</);
    expect(html).toContain('href="https://www.youtube.com/watch?v=aaaaaaaaaaa"');
  });

  it("shows an expired card without source data, with Refresh and Remove", async () => {
    const { html } = await show([item(expired, "youtube:bbbbbbbbbbb")]);
    expect(html).toContain("older than 30 days");
    expect(html).toContain("Refresh");
    expect(html).toContain("Remove from saved");
    expect(html).not.toContain("watch?v=");
  });

  it("keeps the order it was given (the store sorts newest first)", async () => {
    const second = { ...live, externalId: "ccccccccccc", title: "Second" };
    const { html } = await show([item(live, "a"), item(second, "b")]);
    expect(html.indexOf("Escalada")).toBeLessThan(html.indexOf("Second"));
  });

  it("shows a message when a refresh failed", async () => {
    const { html } = await render(createElement(SavedResources, { items: [], onRemove: noop, onRefresh: noop, refreshFailed: true }));
    expect(html).toContain("Could not refresh");
  });
});
