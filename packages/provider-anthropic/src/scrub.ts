import { REDACTED } from "@tarjuman/core/adapter";

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
