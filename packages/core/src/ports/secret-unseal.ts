/**
 * ADAPTERS ONLY. Reading the raw secret is a separate module so the architecture rule can forbid
 * every other importer, including the core's own public `index.ts`.
 */
import type { SecretHandle } from "./secret-handle";
import { secretStore } from "./secret-store";

/** Returns the raw secret; never pass the result to anything but the provider. */
export function unsealSecret(handle: SecretHandle): string {
  const secret = secretStore.get(handle);
  if (secret === undefined) throw new Error("Unknown or already-destroyed SecretHandle.");
  return secret;
}
