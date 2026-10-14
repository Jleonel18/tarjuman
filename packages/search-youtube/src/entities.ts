/**
 * The only HTML entities YouTube's API puts in titles and descriptions are the five below, so they
 * are all that is decoded. Anything else stays as text, and decoding runs once: `&amp;lt;` becomes
 * `&lt;`, never `<`. The result is shown as plain text and fenced as data for the model, never parsed.
 */
const TABLE: Readonly<Record<string, string>> = {
  "&#39;": "'",
  "&amp;": "&",
  "&quot;": '"',
  "&lt;": "<",
  "&gt;": ">",
};

export function decodeEntities(text: string): string {
  return text.replace(/&#39;|&amp;|&quot;|&lt;|&gt;/g, (entity) => TABLE[entity] ?? entity);
}
