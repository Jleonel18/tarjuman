import Anthropic from "@anthropic-ai/sdk";
import type { SecretHandle } from "@tarjuman/core";
import { unsealSecret } from "@tarjuman/core/adapter";
import { ANTHROPIC_API_ORIGIN } from "./origin";

export interface AnthropicProviderOptions {
  /** Replaces the global `fetch`. Tests use it to run the real SDK without a network. */
  fetch?: Anthropic["fetch"] | ((input: never, init?: never) => Promise<Response>);
}

/**
 * A short-lived SDK client. The key is unsealed here, inside this package, and never leaves it.
 * `maxRetries: 0` is a cost-safety rule: the SDK default of 2 would silently repeat paid calls.
 */
export function createClient(secret: SecretHandle, options: AnthropicProviderOptions): Anthropic {
  return new Anthropic({
    apiKey: unsealSecret(secret),
    baseURL: ANTHROPIC_API_ORIGIN,
    dangerouslyAllowBrowser: true,
    maxRetries: 0,
    ...(options.fetch && { fetch: options.fetch as Anthropic["fetch"] }),
  });
}
