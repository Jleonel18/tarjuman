import MarkdownIt from "markdown-it";
import type { Token } from "markdown-it";
import type { SafeBlock, SafeInline } from "./types";

// `html: false` makes raw HTML in model output ordinary text. Linkify is off so nothing becomes
// a link that the model did not write explicitly.
const md = new MarkdownIt("default", { html: false, linkify: false, typographer: false });

// Only these schemes can become a link; the core has no `URL` type, so a pattern is used.
const SAFE_LINK_PATTERN = /^(?:https?:\/\/|mailto:)\S+$/i;

/** Parses Markdown into the restricted `SafeBlock` AST. Images and raw HTML are not representable. */
export function renderSafeBlocks(markdown: string): SafeBlock[] {
  const tokens = md.parse(markdown, {});
  return new BlockReader(tokens).readBlocks();
}

/**
 * Stream-safe: feed deltas as they arrive and get the AST for everything received so far.
 * Re-parsing the whole text keeps a half-received code fence or list well-formed.
 */
export class OutputGuard {
  #text = "";

  push(delta: string): SafeBlock[] {
    this.#text += delta;
    return renderSafeBlocks(this.#text);
  }
}

class BlockReader {
  #i = 0;
  constructor(private readonly tokens: Token[]) {}

  readBlocks(until?: string): SafeBlock[] {
    const blocks: SafeBlock[] = [];
    while (this.#i < this.tokens.length) {
      const token = this.tokens[this.#i];
      if (!token) break;
      if (until !== undefined && token.type === until) {
        this.#i += 1;
        return blocks;
      }
      this.#i += 1;
      const block = this.#block(token);
      if (block) blocks.push(block);
    }
    return blocks;
  }

  #block(token: Token): SafeBlock | undefined {
    switch (token.type) {
      case "paragraph_open":
        return { type: "paragraph", children: this.#inlineThenClose("paragraph_close") };
      case "heading_open": {
        const level = Math.min(6, Math.max(1, Number(token.tag.slice(1)) || 1)) as 1 | 2 | 3 | 4 | 5 | 6;
        return { type: "heading", level, children: this.#inlineThenClose("heading_close") };
      }
      case "blockquote_open":
        return { type: "blockquote", children: this.readBlocks("blockquote_close") };
      case "bullet_list_open":
        return { type: "list", ordered: false, items: this.#items("bullet_list_close") };
      case "ordered_list_open":
        return { type: "list", ordered: true, items: this.#items("ordered_list_close") };
      case "fence": {
        const language = token.info.trim().split(/\s+/)[0];
        return language
          ? { type: "code_block", language, text: token.content }
          : { type: "code_block", text: token.content };
      }
      case "code_block":
        return { type: "code_block", text: token.content };
      case "table_open":
        return this.#table();
      default:
        // Horizontal rules and anything else have no SafeBlock form and are dropped.
        return undefined;
    }
  }

  #inlineThenClose(close: string): SafeInline[] {
    let children: SafeInline[] = [];
    while (this.#i < this.tokens.length) {
      const token = this.tokens[this.#i];
      this.#i += 1;
      if (!token || token.type === close) break;
      if (token.type === "inline") children = readInline(token.children ?? []);
    }
    return children;
  }

  #items(close: string): SafeBlock[][] {
    const items: SafeBlock[][] = [];
    while (this.#i < this.tokens.length) {
      const token = this.tokens[this.#i];
      this.#i += 1;
      if (!token || token.type === close) break;
      if (token.type === "list_item_open") items.push(this.readBlocks("list_item_close"));
    }
    return items;
  }

  #table(): SafeBlock {
    const header: SafeInline[][] = [];
    const rows: SafeInline[][][] = [];
    let inHead = false;
    let row: SafeInline[][] = [];
    while (this.#i < this.tokens.length) {
      const token = this.tokens[this.#i];
      this.#i += 1;
      if (!token || token.type === "table_close") break;
      if (token.type === "thead_open") inHead = true;
      else if (token.type === "thead_close") inHead = false;
      else if (token.type === "tr_open") row = [];
      else if (token.type === "tr_close") {
        if (inHead) header.push(...row);
        else rows.push(row);
      } else if (token.type === "inline") row.push(readInline(token.children ?? []));
    }
    return { type: "table", header, rows };
  }
}

function readInline(tokens: Token[]): SafeInline[] {
  const reader = new InlineReader(tokens);
  return reader.read();
}

class InlineReader {
  #i = 0;
  constructor(private readonly tokens: Token[]) {}

  read(until?: string): SafeInline[] {
    const out: SafeInline[] = [];
    while (this.#i < this.tokens.length) {
      const token = this.tokens[this.#i];
      if (!token) break;
      this.#i += 1;
      if (until !== undefined && token.type === until) return out;
      switch (token.type) {
        case "text":
          pushText(out, token.content);
          break;
        case "code_inline":
          out.push({ type: "code", text: token.content });
          break;
        case "softbreak":
          pushText(out, "\n");
          break;
        case "hardbreak":
          out.push({ type: "break" });
          break;
        case "em_open":
          out.push({ type: "emphasis", children: this.read("em_close") });
          break;
        case "strong_open":
          out.push({ type: "strong", children: this.read("strong_close") });
          break;
        case "s_open":
          // No strikethrough node exists; keep the words.
          out.push(...this.read("s_close"));
          break;
        case "link_open":
          out.push(...this.#link(token));
          break;
        case "image":
          // Images are not representable and never auto-load; only the alt text survives.
          if (token.content) pushText(out, token.content);
          break;
        default:
          // `html_inline` cannot occur with `html: false`; any unknown inline token is dropped.
          break;
      }
    }
    return out;
  }

  #link(open: Token): SafeInline[] {
    const children = this.read("link_close");
    const destination = String(open.attrGet("href") ?? "");
    if (!isSafeLink(destination)) return children;
    return [{ type: "link", children, destination, destinationDisplay: destination }];
  }
}

function pushText(out: SafeInline[], text: string): void {
  const last = out[out.length - 1];
  if (last?.type === "text") last.text += text;
  else out.push({ type: "text", text });
}

function isSafeLink(destination: string): boolean {
  if (!SAFE_LINK_PATTERN.test(destination)) return false;
  for (const char of destination) if (char.charCodeAt(0) < 0x20) return false;
  return true;
}
