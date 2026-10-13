import type { Conversation } from "@tarjuman/core";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { ConversationList } from "../src/conversations/ConversationList";
import { LanguageSettings } from "../src/settings/LanguageSettings";
import { render } from "./render";

const noop = () => {};

describe("LanguageSettings", () => {
  it.each(["en", "es"])("shows three separate selectors in %s with no missing key", async (locale) => {
    const { html, missing } = await render(
      createElement(LanguageSettings, {
        uiLanguage: locale,
        mediationLanguage: "es",
        targetLanguage: "he",
        uiLocales: ["en", "es"],
        validate: () => [],
        onChange: noop,
      }),
      locale,
    );
    expect(missing).toEqual([]);
    expect(html.match(/<select/g)).toHaveLength(3);
    expect(html).toContain('value="he"');
  });

  it("offers the test locale only when the app passes it", async () => {
    const props = { uiLanguage: "en", mediationLanguage: "es", targetLanguage: "ja", validate: () => [], onChange: noop };
    const prod = await render(createElement(LanguageSettings, { ...props, uiLocales: ["en", "es"] }));
    const dev = await render(createElement(LanguageSettings, { ...props, uiLocales: ["en", "es", "ar-XB"] }));
    expect(prod.html).not.toContain("ar-XB");
    expect(dev.html).toContain("ar-XB");
  });
});

describe("ConversationList language snapshot", () => {
  it("shows the languages each conversation was started with", async () => {
    const conversation: Conversation = {
      id: "c1",
      title: "Ser and estar",
      capabilityId: "language-qa",
      languageSnapshot: { mediation: "es", target: "ja" },
      createdAt: "2026-10-13T00:00:00.000Z",
      updatedAt: "2026-10-13T00:00:00.000Z",
    } as Conversation;
    const { html, missing } = await render(
      createElement(ConversationList, { conversations: [conversation], onNew: noop, onOpen: noop, onDelete: noop }),
    );
    expect(missing).toEqual([]);
    expect(html).toContain("Explained in Spanish, learning Japanese");
  });
});
