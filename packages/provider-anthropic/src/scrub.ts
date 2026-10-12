const REDACTED = "[redacted]";

/** Anthropic key shape. Catches a key that is not the current one, such as a rotated key. */
const KEY_SHAPE = /sk-ant-[A-Za-z0-9_-]{8,}/g;

/**
 * Removes the secret, and anything shaped like an Anthropic key, from text that is about to leave
 * the adapter (an error message, a log line). It also removes the URL-encoded form.
 */
export function scrubSecret(text: string, secret: string): string {
  if (secret === "") return text.replace(KEY_SHAPE, REDACTED);
  return text
    .split(secret)
    .join(REDACTED)
    .split(encodeURIComponent(secret))
    .join(REDACTED)
    .replace(KEY_SHAPE, REDACTED);
}

/**
 * Redacts the secret from streamed text even when it is split across chunks. It holds back only
 * the tail of the text that could still turn out to be the start of the secret, so ordinary text
 * is never delayed.
 */
export class SecretStreamFilter {
  readonly #secret: string;
  #pending = "";

  constructor(secret: string) {
    this.#secret = secret;
  }

  push(delta: string): string {
    if (this.#secret === "") return delta;
    const text = (this.#pending + delta).split(this.#secret).join(REDACTED);
    const held = this.#partialSuffixLength(text);
    this.#pending = text.slice(text.length - held);
    return text.slice(0, text.length - held);
  }

  /** Releases whatever is still held; call once, when the stream ends. */
  flush(): string {
    const rest = this.#pending;
    this.#pending = "";
    return rest;
  }

  /** Length of the longest tail of `text` that is a proper prefix of the secret. */
  #partialSuffixLength(text: string): number {
    const longest = Math.min(text.length, this.#secret.length - 1);
    for (let length = longest; length > 0; length -= 1) {
      if (text.endsWith(this.#secret.slice(0, length))) return length;
    }
    return 0;
  }
}
