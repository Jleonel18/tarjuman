/**
 * Pseudo-RTL locale generator (FR-032, SC-006). Used only in dev and tests to prove layouts mirror
 * and bidirectional text behaves, without shipping an RTL interface language. Never offered to
 * users.
 *
 * What it does to each string:
 *  - reverses the order of words, so under a right-to-left base direction the text still reads
 *    left to right on screen and a tester can recognize it;
 *  - wraps it in RLM + RLE ... PDF so the base direction is right-to-left even without `dir`;
 *  - lengthens it by about 30 % to expose layouts that assume short labels;
 *  - leaves ICU arguments (`{name}`, `{count, plural, ...}` selectors) untouched and transforms only
 *    the human-readable text, including inside plural/select branches.
 */

const RLM = "‏";
const RLE = "‫";
const PDF = "‬";
const PAD = "·";

export const PSEUDO_RTL_LOCALE_TAG = "ar-XB";

export function pseudoRtl(message: string): string {
  const transformed = transformIcu(message);
  const visible = message.replace(/\{[^}]*\}/g, "").length || message.length;
  const padding = PAD.repeat(Math.max(1, Math.ceil(visible * 0.3)));
  return `${RLM}${RLE}${transformed} ${padding}${PDF}`;
}

export function pseudoRtlCatalog(catalog: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(catalog).map(([key, value]) => [key, pseudoRtl(value)]));
}

const BRANCHING = /^\s*[\w.]+\s*,\s*(plural|select|selectordinal)\s*,/;

function transformIcu(text: string): string {
  let out = "";
  let literal = "";
  let i = 0;
  const flush = () => {
    out += reverseWords(literal);
    literal = "";
  };
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "{") {
      const end = matchingBrace(text, i);
      if (end === -1) {
        literal += text.slice(i);
        break;
      }
      flush();
      out += `{${transformBlock(text.slice(i + 1, end))}}`;
      i = end + 1;
    } else {
      literal += ch;
      i += 1;
    }
  }
  flush();
  return out;
}

/** Content between braces: a plain argument stays as is; plural/select branch bodies are transformed. */
function transformBlock(content: string): string {
  const head = BRANCHING.exec(content);
  if (!head) return content;
  let out = head[0];
  let i = head[0].length;
  while (i < content.length) {
    const open = content.indexOf("{", i);
    if (open === -1) {
      out += content.slice(i);
      break;
    }
    const end = matchingBrace(content, open);
    if (end === -1) {
      out += content.slice(i);
      break;
    }
    out += `${content.slice(i, open)}{${transformIcu(content.slice(open + 1, end))}}`;
    i = end + 1;
  }
  return out;
}

function matchingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Reverses the order of whitespace-separated words, keeping each word's letters in place. */
function reverseWords(text: string): string {
  if (text.trim() === "") return text;
  const leading = /^\s*/.exec(text)![0];
  const trailing = /\s*$/.exec(text)![0];
  const words = text.trim().split(/\s+/);
  return `${leading}${words.reverse().join(" ")}${trailing}`;
}
