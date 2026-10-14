/**
 * The known API key shapes, per credential id (specs/004-gemini-provider and 005-resource-curation,
 * data-model.md → KeyShape). Plain data: the core names ids as strings and imports no adapter.
 *
 * Used to mask a key for display, to recognize a key typed for the wrong place before it is
 * sent anywhere (FR-007), and by the input guard to withhold keys pasted into the chat (FR-010).
 */
export interface KeyShape {
  /**
   * The credential ids (a provider id or a search source id) this shape is valid for. The first is
   * the one named when a key is typed for the wrong place. A Google Cloud `AIza…` key serves both
   * `gemini` and `youtube` (005 data-model → KeyShape).
   */
  credentialIds: readonly string[];
  /** Unanchored and without flags, so they can be searched for inside a longer token. */
  patterns: readonly { pattern: RegExp; maskPrefix: string }[];
}

export const KEY_SHAPES: readonly KeyShape[] = [
  { credentialIds: ["anthropic"], patterns: [{ pattern: /sk-ant-[A-Za-z0-9_-]{8,}/, maskPrefix: "sk-ant-" }] },
  // Standard Google Cloud keys (`AIza` + 35): valid for Gemini and for the YouTube Data API.
  { credentialIds: ["gemini", "youtube"], patterns: [{ pattern: /AIza[A-Za-z0-9_-]{35}/, maskPrefix: "AIza" }] },
  {
    credentialIds: ["gemini"],
    // AI Studio now issues auth keys (`AQ.`), 53 characters in the one live sample (004 research R2),
    // so 30+ leaves room without matching words. They are Gemini-only.
    patterns: [{ pattern: /AQ\.[A-Za-z0-9_-]{30,}/, maskPrefix: "AQ." }],
  },
];

function anchored(pattern: RegExp): RegExp {
  return new RegExp(`^(?:${pattern.source})$`);
}

function matchWhole(key: string): { credentialIds: readonly string[]; maskPrefix: string } | undefined {
  for (const shape of KEY_SHAPES) {
    for (const { pattern, maskPrefix } of shape.patterns) {
      if (anchored(pattern).test(key)) return { credentialIds: shape.credentialIds, maskPrefix };
    }
  }
  return undefined;
}

/** True when the credential id's keys have a known shape, so a key can be judged as "not this one's". */
export function hasKeyShape(credentialId: string): boolean {
  return KEY_SHAPES.some((shape) => shape.credentialIds.includes(credentialId));
}

/** Every credential id a whole key is valid for, judged by its shape alone; `undefined` when unknown. */
export function credentialIdsOfKey(key: string): readonly string[] | undefined {
  return matchWhole(key.trim())?.credentialIds;
}

/** False only when the key's shape is known and the credential id is not one it is valid for. */
export function isKeyFor(key: string, credentialId: string): boolean {
  const ids = credentialIdsOfKey(key);
  return ids === undefined || ids.includes(credentialId);
}

/** The first credential id a whole key belongs to, judged by its shape alone; `undefined` when unknown. */
export function providerOfKey(key: string): string | undefined {
  return credentialIdsOfKey(key)?.[0];
}

/** The first id of the first known key shape found anywhere in `text`, e.g. `NAME=sk-ant-…`. */
export function findKeyShape(text: string): string | undefined {
  for (const shape of KEY_SHAPES) {
    if (shape.patterns.some(({ pattern }) => pattern.test(text))) return shape.credentialIds[0];
  }
  return undefined;
}

/** `AQ.…a1b2` (FR-015 of 001): a recognized prefix and the last four characters, nothing else. */
export function maskKey(key: string): string {
  const trimmed = key.trim();
  const prefix = matchWhole(trimmed)?.maskPrefix ?? "";
  return `${prefix}…${trimmed.slice(-4)}`;
}
