import type { SafeBlock } from "@tarjuman/core";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { ChatView, type ChatViewProps } from "../src/chat/ChatView";
import { GuardNotice } from "../src/chat/GuardNotice";
import { MessageBubble } from "../src/chat/MessageBubble";
import { SafeBlockRenderer } from "../src/chat/SafeBlockRenderer";
import { render } from "./render";

const noop = () => {};
const text = (t: string) => ({ type: "text" as const, text: t });
const para = (t: string): SafeBlock => ({ type: "paragraph", children: [text(t)] });

function chat(overrides: Partial<ChatViewProps> = {}) {
  return createElement(ChatView, {
    messages: [],
    streaming: false,
    onSend: noop,
    onStop: noop,
    onRetry: noop,
    onOpenKeySettings: noop,
    ...overrides,
  });
}

describe("SafeBlockRenderer", () => {
  it("renders every block kind", async () => {
    const blocks: SafeBlock[] = [
      { type: "heading", level: 1, children: [text("Title")] },
      {
        type: "paragraph",
        children: [
          text("a "),
          { type: "strong", children: [text("bold")] },
          { type: "emphasis", children: [text("em")] },
          { type: "code", text: "x" },
          { type: "break" },
        ],
      },
      { type: "list", ordered: true, items: [[para("one")], [para("two")]] },
      { type: "blockquote", children: [para("quoted")] },
      { type: "code_block", text: "let a = 1;" },
      { type: "table", header: [[text("h")]], rows: [[[text("c")]]] },
    ];
    const { html } = await render(createElement(SafeBlockRenderer, { blocks }));
    for (const tag of ["<h3 dir=\"auto\">", "<strong>", "<em>", "<ol>", "<blockquote>", "<pre>", "<table>"]) {
      expect(html).toContain(tag);
    }
  });

  it("turns markup in model text into literal text", async () => {
    const hostile = '<img src="https://evil.test/x.png"><script>alert(1)</script><iframe src="x"></iframe>';
    const { html } = await render(createElement(SafeBlockRenderer, { blocks: [para(hostile)] }));
    expect(html).not.toMatch(/<(img|script|iframe)/i);
    expect(html).toContain("&lt;img");
  });

  it("shows a link's real destination and opens it only through a hardened anchor", async () => {
    const link: SafeBlock = {
      type: "paragraph",
      children: [
        {
          type: "link",
          children: [text("click here")],
          destination: "https://evil.test/steal?k=1",
          destinationDisplay: "https://evil.test/steal?k=1",
        },
      ],
    };
    const { html, missing } = await render(createElement(SafeBlockRenderer, { blocks: [link] }));
    expect(missing).toEqual([]);
    // Nothing loads by itself: the only element that can carry the address is one plain anchor.
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).not.toMatch(/<(img|iframe|script|link|object|embed|video|audio|source)\b/i);
    expect(html).toContain("click here");
    // The real destination is visible next to the text, so the text cannot disguise it.
    expect(html).toMatch(/<code[^>]*>https:\/\/evil\.test\/steal\?k=1<\/code>/);
  });

  it("renders nothing for a node type it does not know", async () => {
    const image = { type: "image", src: "https://evil.test/x.png" } as unknown as SafeBlock;
    const { html } = await render(createElement(SafeBlockRenderer, { blocks: [image] }));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("evil.test");
  });
});

describe.each(["en", "es"])("ChatView in %s", (locale) => {
  it("shows the empty prompt, the Send button, and the masked key hint", async () => {
    const { html, missing } = await render(chat({ keyHint: "sk-ant-…0000" }), locale);
    expect(missing).toEqual([]);
    expect(html).toContain("sk-ant-…0000");
    expect(html).toContain("<textarea");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>/); // Send is disabled with nothing typed
  });

  it("replaces Send with Stop while streaming", async () => {
    const { html, missing } = await render(
      chat({ streaming: true, messages: [{ id: "a", author: "assistant", status: "streaming", blocks: [para("Hola")] }] }),
      locale,
    );
    expect(missing).toEqual([]);
    expect(html).toContain(locale === "en" ? ">Stop<" : ">Detener<");
    expect(html).not.toContain(locale === "en" ? ">Send<" : ">Enviar<");
    expect(html).toContain('aria-busy="true"');
  });

  it("offers a retry on an interrupted answer only when idle", async () => {
    const messages: ChatViewProps["messages"] = [
      { id: "u", author: "user", text: "Q" },
      { id: "a", author: "assistant", status: "interrupted", blocks: [para("Partial")] },
    ];
    const idle = await render(chat({ messages }), locale);
    expect(idle.missing).toEqual([]);
    expect(idle.html).toContain(locale === "en" ? "Try again" : "Intentar de nuevo");
    const busy = await render(chat({ messages, streaming: true }), locale);
    expect(busy.html).not.toContain(locale === "en" ? "Try again" : "Intentar de nuevo");
  });

  it("shows a provider error, and points to key settings only for key problems", async () => {
    const key = await render(chat({ error: { code: "invalid_credential" } }), locale);
    expect(key.missing).toEqual([]);
    expect(key.html).toContain('role="alert"');
    expect(key.html).toContain(locale === "en" ? "Open key settings" : "Abrir ajustes de la clave");
    const net = await render(chat({ error: { code: "network" } }), locale);
    expect(net.html).toContain('role="alert"');
    expect(net.html).not.toContain(locale === "en" ? "Open key settings" : "Abrir ajustes de la clave");
  });
});

describe.each(["en", "es"])("GuardNotice in %s", (locale) => {
  it("explains that key-shaped text was withheld and offers to dismiss it", async () => {
    const { html, missing } = await render(createElement(GuardNotice, { code: "key_shape_detected", onDismiss: noop }), locale);
    expect(missing).toEqual([]);
    expect(html).toContain('role="status"');
    expect(html).toContain(locale === "en" ? "looks like an API key" : "parece una clave de API");
    expect(html).toContain(locale === "en" ? ">Dismiss<" : ">Descartar<");
  });

  it("is shown by the chat view when a notice is set, and absent otherwise", async () => {
    const withNotice = await render(chat({ notice: { code: "key_shape_detected" }, onDismissNotice: noop }), locale);
    expect(withNotice.missing).toEqual([]);
    expect(withNotice.html).toContain("guard-notice");
    const without = await render(chat(), locale);
    expect(without.html).not.toContain("guard-notice");
  });
});

describe.each(["en", "es"])("MessageBubble streaming indicator in %s (003 US2)", (locale) => {
  const streaming = { id: "a", author: "assistant" as const, status: "streaming" as const, blocks: [para("Ser")] };

  it("shows the streaming label with a decorative icon while the answer streams", async () => {
    const { html, missing } = await render(createElement(MessageBubble, { message: streaming }), locale);
    expect(missing).toEqual([]);
    const indicator = /<p class="bubble__status"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "";
    expect(indicator).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(indicator.replace(/<[^>]+>/g, "").trim()).toBe(locale === "en" ? "Writing…" : "Escribiendo…");
  });

  it("is gone once the answer is complete", async () => {
    const { html } = await render(createElement(MessageBubble, { message: { ...streaming, status: "complete" as const } }), locale);
    expect(html).not.toContain("bubble__status");
    expect(html).not.toContain("<svg");
  });
});


describe.each(["en", "es"])("search in the chat, in %s", (locale) => {
  const live = {
    ref: "r1",
    sourceId: "youtube",
    sourceDisplay: "YouTube (youtube.com)",
    externalId: "aaaaaaaaaaa",
    title: "Escalada",
    channel: "Club",
    durationSeconds: 60,
    hasCaptions: true,
    audioLanguage: "es",
    type: "video" as const,
    priceLabel: "free" as const,
    accessNote: null,
    sponsored: false,
    affiliate: false,
    link: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    fetchedAt: "2026-10-14T00:00:00.000Z",
    fitNote: "Good fit.",
    difficulty: "about_right" as const,
  };

  it("shows the cards under the answer text", async () => {
    const { html, missing } = await render(
      chat({ messages: [{ id: "a", author: "assistant", status: "complete", blocks: [para("Here you go")], resources: [live] }] }),
      locale,
    );
    expect(missing).toEqual([]);
    expect(html.indexOf("Here you go")).toBeLessThan(html.indexOf("Escalada"));
    expect(html).toContain('class="resources"');
  });

  it("says it is searching instead of writing while a tool runs", async () => {
    const searching = await render(
      chat({ streaming: true, messages: [{ id: "a", author: "assistant", status: "streaming", blocks: [], searching: true }] }),
      locale,
    );
    expect(searching.missing).toEqual([]);
    expect(searching.html).toContain(locale === "en" ? "Searching YouTube…" : "Buscando en YouTube…");
  });

  it.each(["search_incomplete", "search_key_error", "search_quota"] as const)("shows the %s notice", async (code) => {
    const { html, missing } = await render(chat({ searchNotice: { code }, onOpenSearchSettings: noop }), locale);
    expect(missing).toEqual([]);
    expect(html).toContain('role="status"');
    const settings = locale === "en" ? "Open search settings" : "Abrir ajustes de búsqueda";
    if (code === "search_key_error") expect(html).toContain(settings);
    else expect(html).not.toContain(settings);
  });
});
