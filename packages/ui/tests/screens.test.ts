import type { Conversation } from "@tarjuman/core";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { ConversationList } from "../src/conversations/ConversationList";
import { KeyEntry } from "../src/key/KeyEntry";
import { Onboarding } from "../src/onboarding/Onboarding";
import { render } from "./render";

const noop = () => {};
const onboarding = () =>
  createElement(Onboarding, { defaultMediationLanguage: "es", validate: () => [], onComplete: noop });
const keyEntry = (props: { storageAvailable: boolean; maskedHint?: string }) =>
  createElement(KeyEntry, { onEnter: async () => ({ ok: true as const, maskedHint: "x" }), ...props });

const CONVERSATIONS: Conversation[] = [
  {
    id: "a",
    title: "Ser vs estar",
    capabilityId: "language-qa",
    languageSnapshot: { mediation: "es", target: "ja" },
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
  },
  {
    id: "b",
    title: "",
    capabilityId: "language-qa",
    languageSnapshot: { mediation: "es", target: "ja" },
    createdAt: "2026-10-02T10:00:00.000Z",
    updatedAt: "2026-10-02T10:00:00.000Z",
  },
];

describe.each(["en", "es"])("screens in %s", (locale) => {
  it("Onboarding renders every field and finds every catalog key", async () => {
    const { html, missing } = await render(onboarding(), locale);
    expect(missing).toEqual([]);
    expect(html.match(/<select/g)).toHaveLength(3);
    // Seven level options (A1 to C2 and "I don't know") plus the unselected target placeholder.
    expect(html).toContain('<option value="unknown"');
    expect(html).toContain('<option value="C2"');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>/); // Next is disabled until a target is chosen
  });

  it("KeyEntry offers two storage modes and neither is preselected", async () => {
    const { html, missing } = await render(keyEntry({ storageAvailable: true }), locale);
    expect(missing).toEqual([]);
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).not.toMatch(/checked/);
    expect(html).toContain('type="password"');
    expect(html).not.toContain('role="status"');
  });

  it("KeyEntry with unavailable storage explains it and disables the persistent mode", async () => {
    const { html, missing } = await render(keyEntry({ storageAvailable: false }), locale);
    expect(missing).toEqual([]);
    expect(html).toContain('role="status"');
    const persistent = html.match(/<input[^>]*persistent"[^>]*>/)?.[0] ?? "";
    expect(persistent).toContain("disabled");
    const session = html.match(/<input[^>]*-session"[^>]*>/)?.[0] ?? "";
    expect(session).not.toContain("disabled");
  });

  it("KeyEntry shows only the masked hint once a key is stored", async () => {
    const { html, missing } = await render(keyEntry({ storageAvailable: true, maskedHint: "sk-ant-…0000" }), locale);
    expect(missing).toEqual([]);
    expect(html).toContain("sk-ant-…0000");
    expect(html).not.toContain("<input");
  });

  it("ConversationList shows newest first, an untitled fallback, and no confirmation yet", async () => {
    const { html, missing } = await render(
      createElement(ConversationList, { conversations: CONVERSATIONS, onNew: noop, onOpen: noop, onDelete: noop }),
      locale,
    );
    expect(missing).toEqual([]);
    expect(html.indexOf("Ser vs estar")).toBeGreaterThan(html.indexOf("conversations__item"));
    // "b" is newer and has no title, so it comes first and uses the fallback.
    expect(html.indexOf(locale === "en" ? "Untitled conversation" : "Conversación sin título")).toBeLessThan(
      html.indexOf("Ser vs estar"),
    );
    expect(html).not.toContain('role="group"');
  });

  it("ConversationList shows an empty state", async () => {
    const { html, missing } = await render(
      createElement(ConversationList, { conversations: [], onNew: noop, onOpen: noop, onDelete: noop }),
      locale,
    );
    expect(missing).toEqual([]);
    expect(html).toContain("form__hint");
  });
});
