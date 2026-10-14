import type { TFunction } from "i18next";

/**
 * Catalog keys for the product providers' display names (004). Written out in full so the
 * catalog-key check sees them. Dev and test providers (`mock`, `ollama`) are not product names and
 * have no catalog entry: they show their id.
 */
const PROVIDER_NAME_KEYS: Readonly<Record<string, string>> = {
  anthropic: "provider.name.anthropic",
  gemini: "provider.name.gemini",
};

export function providerName(t: TFunction, providerId: string): string {
  const key = PROVIDER_NAME_KEYS[providerId];
  return key === undefined ? providerId : t(key);
}
