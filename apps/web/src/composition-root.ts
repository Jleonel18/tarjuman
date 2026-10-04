import languageQa from "@tarjuman/capability-language-qa";
import { CapabilityRegistry } from "@tarjuman/core";
import { IndexedDbStorage, WebCredentialStore, defaultSessionSecrets } from "@tarjuman/storage-web";
import { createI18n, getShippedCatalog, registerCatalog, type I18n } from "@tarjuman/ui";

/**
 * The composition root: the one place that decides which concrete adapters the app uses. Nothing
 * else constructs storage or a provider, which is what the dependency-cruiser rules enforce.
 *
 * The provider and the pipeline are wired here in T067 (US1).
 */
export interface AppServices {
  storage: IndexedDbStorage;
  credentials: WebCredentialStore;
  registry: CapabilityRegistry;
  i18n: I18n;
}

export async function createAppServices(): Promise<AppServices> {
  // One in-memory holder shared by storage and the credential store, so "delete all my data"
  // also drops a session-only key.
  const storage = new IndexedDbStorage({ sessionSecrets: defaultSessionSecrets });
  const credentials = new WebCredentialStore({ records: storage, sessionSecrets: defaultSessionSecrets });
  const registry = new CapabilityRegistry();
  registry.register(languageQa);

  const i18n = await createI18n(
    import.meta.env.DEV
      ? { onMissingKey: (locale, key) => console.warn(`Missing translation [${locale}] ${key}`) }
      : {},
  );

  // The pseudo-RTL locale proves layouts mirror (FR-032). It exists only in dev and in builds made
  // with VITE_PSEUDO_RTL=1 (the e2e build); a normal production build drops this branch entirely.
  if (import.meta.env.DEV || import.meta.env.VITE_PSEUDO_RTL === "1") {
    const { PSEUDO_RTL_LOCALE_TAG, pseudoRtlCatalog } = await import("@tarjuman/testing/pseudo-rtl");
    registerCatalog(i18n, PSEUDO_RTL_LOCALE_TAG, pseudoRtlCatalog(getShippedCatalog("en") ?? {}));
  }

  return { storage, credentials, registry, i18n };
}
