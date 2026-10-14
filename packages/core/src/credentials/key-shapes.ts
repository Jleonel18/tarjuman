/**
 * The known API key shapes, per provider (specs/004-gemini-provider, data-model.md → KeyShape).
 * Plain data: the core names provider ids as strings and imports no adapter.
 *
 * Used to mask a key for display, to recognize a key typed for the wrong provider before it is
 * sent anywhere (FR-007), and by the input guard to withhold keys pasted into the chat (FR-010).
 */
export interface KeyShape {
  providerId: string;
  /** Unanchored and without flags, so they can be searched for inside a longer token. */
  patterns: readonly { pattern: RegExp; maskPrefix: string }[];
}

export const KEY_SHAPES: readonly KeyShape[] = [
  { providerId: "anthropic", patterns: [{ pattern: /sk-ant-[A-Za-z0-9_-]{8,}/, maskPrefix: "sk-ant-" }] },
  {
    providerId: "gemini",
    // Standard keys (`AIza` + 35) are being phased out; AI Studio now issues auth keys (`AQ.`),
    // 53 characters in the one live sample (research R2), so 30+ leaves room without matching words.
    patterns: [
      { pattern: /AIza[A-Za-z0-9_-]{35}/, maskPrefix: "AIza" },
      { pattern: /AQ\.[A-Za-z0-9_-]{30,}/, maskPrefix: "AQ." },
    ],
  },
];

function anchored(pattern: RegExp): RegExp {
  return new RegExp(`^(?:${pattern.source})$`);
}

function matchWhole(key: string): { providerId: string; maskPrefix: string } | undefined {
  for (const shape of KEY_SHAPES) {
    for (const { pattern, maskPrefix } of shape.patterns) {
      if (anchored(pattern).test(key)) return { providerId: shape.providerId, maskPrefix };
    }
  }
  return undefined;
}

/** True when the provider's keys have a known shape, so a key can be judged as "not this provider's". */
export function hasKeyShape(providerId: string): boolean {
  return KEY_SHAPES.some((shape) => shape.providerId === providerId);
}

/** The provider a whole key belongs to, judged by its shape alone; `undefined` when unknown. */
export function providerOfKey(key: string): string | undefined {
  return matchWhole(key.trim())?.providerId;
}

/** The provider of the first known key shape found anywhere in `text`, e.g. `NAME=sk-ant-…`. */
export function findKeyShape(text: string): string | undefined {
  for (const shape of KEY_SHAPES) {
    if (shape.patterns.some(({ pattern }) => pattern.test(text))) return shape.providerId;
  }
  return undefined;
}

/** `AQ.…a1b2` (FR-015 of 001): a recognized prefix and the last four characters, nothing else. */
export function maskKey(key: string): string {
  const trimmed = key.trim();
  const prefix = matchWhole(trimmed)?.maskPrefix ?? "";
  return `${prefix}…${trimmed.slice(-4)}`;
}
