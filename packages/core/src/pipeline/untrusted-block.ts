import type { UntrustedMaterial } from "./types";

/** Escapes angle brackets so text can never open or close one of our delimiters. */
export function neutralize(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Fences text we do not control in a labeled data block. Every `<`, `>` and `&` in the payload is
 * escaped, so no spelling of the closing tag (case, spaces, entities) can end the block early.
 */
export function wrapUntrusted(source: UntrustedMaterial["source"], text: string): string {
  return `<untrusted_data source="${source}">\n${neutralize(text)}\n</untrusted_data>`;
}
