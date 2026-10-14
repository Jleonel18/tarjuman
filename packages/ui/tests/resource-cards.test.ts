import type { ResourceCard, StoredResourceCard } from "@tarjuman/core";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { ResourceCards } from "../src/chat/ResourceCards";
import { render } from "./render";

// Resource cards (005 FR-005, FR-011, FR-013): everything a card shows comes from the source or is
// labelled as the model's estimate. No images, no frames, one hardened link.

const noop = () => {};

function card(overrides: Partial<ResourceCard> = {}): ResourceCard {
  return {
    ref: "r1",
    sourceId: "youtube",
    sourceDisplay: "YouTube (youtube.com)",
    externalId: "aaaaaaaaaaa",
    title: "Escalada para principiantes",
    channel: "Club Vertical",
    durationSeconds: 3723,
    hasCaptions: true,
    audioLanguage: "es",
    type: "video",
    priceLabel: "free",
    accessNote: null,
    sponsored: false,
    affiliate: false,
    link: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    fetchedAt: "2026-10-14T12:00:00.000Z",
    fitNote: "Slow Spanish with captions, a good fit for B1.",
    difficulty: "about_right",
    ...overrides,
  };
}

const show = (cards: StoredResourceCard[], locale = "en", props: Record<string, unknown> = {}) =>
  render(createElement(ResourceCards, { cards, ...props }), locale);

describe("ResourceCards", () => {
  it("shows title, source and channel, type, duration, captions, language, price, difficulty estimate, and fit note", async () => {
    const { html, missing } = await show([card()]);
    expect(missing).toEqual([]);
    expect(html).toContain("Escalada para principiantes");
    expect(html).toContain("YouTube (youtube.com) · Club Vertical");
    expect(html).toContain("Video");
    expect(html).toContain("1:02:03");
    expect(html).toContain("Has captions");
    expect(html).toContain("Language: Spanish");
    expect(html).toContain("Free");
    expect(html).toContain("About right for you (estimate)");
    expect(html).toContain("Slow Spanish with captions, a good fit for B1.");
  });

  it("formats short durations as m:ss and omits an unknown one", async () => {
    expect((await show([card({ durationSeconds: 245 })])).html).toContain("4:05");
    expect((await show([card({ durationSeconds: null })])).html).not.toContain("Duration");
  });

  it("says plainly when captions or the language are not confirmed", async () => {
    const { html } = await show([card({ hasCaptions: null, audioLanguage: null })]);
    expect(html).toContain("Captions not confirmed");
    expect(html).toContain("Language not confirmed");
  });

  it("shows an access note only when there is one", async () => {
    expect((await show([card()])).html).not.toMatch(/Age-restricted|every country/);
    expect((await show([card({ accessNote: "region_restricted" })])).html).toContain("Not available in every country");
    expect((await show([card({ accessNote: "age_restricted" })])).html).toContain("Age-restricted");
  });

  it("shows the sponsored and affiliate labels only when true", async () => {
    const plain = (await show([card()])).html;
    expect(plain).not.toContain("Sponsored");
    expect(plain).not.toContain("Affiliate");
    const labelled = (await show([card({ sponsored: true, affiliate: true })])).html;
    expect(labelled).toContain("Sponsored");
    expect(labelled).toContain("Affiliate link");
  });

  it("labels the price from the source's own data", async () => {
    for (const [price, label] of [
      ["paid", "Paid"],
      ["free_with_limits", "Free with limits"],
      ["unknown", "Price not confirmed"],
    ] as const) {
      expect((await show([card({ priceLabel: price })])).html).toContain(label);
    }
  });

  it("opens the card's link in a new tab through a hardened anchor, with the destination readable", async () => {
    const { html } = await show([card()]);
    expect(html).toContain('href="https://www.youtube.com/watch?v=aaaaaaaaaaa"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain("Open on YouTube (youtube.com)");
  });

  it("renders no link at all when the address is not https", async () => {
    const { html } = await show([card({ link: "javascript:alert(1)" })]);
    expect(html).not.toContain("href=");
    expect(html).not.toContain("javascript");
  });

  it("loads nothing: no image, frame, script, or inline style", async () => {
    const { html } = await show([card({ title: '<img src="https://evil.example/x.png"><iframe src="x"></iframe>' })]);
    expect(html).not.toMatch(/<(img|iframe|script|video|audio|embed|object)/i);
    expect(html).not.toContain(" style=");
    expect(html).toContain("&lt;img");
  });

  it("shows model text and source text as text, with dir=auto for any script", async () => {
    const { html } = await show([card({ title: "[x](https://evil.example) <b>bold</b>", fitNote: "[go](https://evil.example)" })]);
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(html).not.toContain('href="https://evil.example"');
    expect(html).toMatch(/class="resource__title"[^>]*dir="auto"/);
  });

  it("lists the cards in the order given, as a list", async () => {
    const { html } = await show([card({ ref: "r1", title: "First" }), card({ ref: "r2", externalId: "bbbbbbbbbbb", title: "Second" })]);
    expect(html).toContain("<ol");
    expect(html.indexOf("First")).toBeLessThan(html.indexOf("Second"));
  });

  it("offers Save only when the app handles it, and shows Saved for a saved card", async () => {
    expect((await show([card()])).html).not.toContain("Save");
    const withSave = await show([card()], "en", { onSave: noop });
    expect(withSave.html).toContain("Save");
    const saved = await show([card()], "en", { onSave: noop, savedIds: new Set(["youtube:aaaaaaaaaaa"]) });
    expect(saved.html).toContain("Saved");
    expect(saved.html).toContain("disabled");
  });

  it("shows an expired card without any source data and offers Refresh", async () => {
    const expired: StoredResourceCard = { expired: true, sourceId: "youtube", externalId: "aaaaaaaaaaa", fetchedAt: "2026-08-01T00:00:00.000Z" };
    const { html } = await show([expired], "en", { onRefresh: noop });
    expect(html).toContain("older than 30 days");
    expect(html).toContain("Refresh");
    expect(html).not.toContain("watch?v=");
  });

  it("has every string in Spanish too", async () => {
    const { html, missing } = await show([card({ sponsored: true, accessNote: "age_restricted" })], "es", { onSave: noop });
    expect(missing).toEqual([]);
    expect(html).toContain("Idioma: español");
    expect(html).toContain("Patrocinado");
    expect(html).toContain("Guardar");
  });

  it("renders nothing for an empty list", async () => {
    expect((await show([])).html).toBe("");
  });
});
