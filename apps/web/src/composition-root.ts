import languageQa from "@tarjuman/capability-language-qa";
import {
  CapabilityRegistry,
  ConversationService,
  KeyManager,
  Pipeline,
  ProviderCredentialValidator,
  type CredentialStore,
  type LearnerProfile,
  type ProviderPort,
  type StoragePort,
} from "@tarjuman/core";
import { ANTHROPIC_MODELS, AnthropicProvider, DEFAULT_MODEL_ID } from "@tarjuman/provider-anthropic";
import {
  IndexedDbStorage,
  MemoryStorage,
  WebCredentialStore,
  defaultSessionSecrets,
  type SessionSecrets,
  type CredentialRecordAccess,
} from "@tarjuman/storage-web";
import { createI18n, getShippedCatalog, registerCatalog, type I18n } from "@tarjuman/ui";

/**
 * The composition root: the one place that decides which concrete adapters the app uses. Nothing
 * else constructs storage or a provider, which is what the dependency-cruiser rules enforce.
 */
export interface AppServices {
  storage: StoragePort;
  /** False when the browser blocks IndexedDB: everything then lives in memory for this session. */
  storageAvailable: boolean;
  credentials: CredentialStore;
  registry: CapabilityRegistry;
  i18n: I18n;
  conversations: ConversationService;
  pipeline: Pipeline;
  keys: KeyManager;
  /** Model ids a profile may use, and the one a new profile starts with. */
  models: { ids: readonly string[]; defaultId: string };
}

/**
 * Builds the provider. `VITE_PROVIDER=mock` (the e2e build) swaps in the deterministic mock.
 * `VITE_PROVIDER=ollama` swaps in the local Ollama adapter, in the dev server only: the branch is
 * guarded by `import.meta.env.DEV`, so a production build drops it and never contains the adapter
 * (specs/002-free-dev-provider, SC-005).
 */
async function createProvider(): Promise<{ provider: ProviderPort; modelIds: string[]; defaultModelId: string }> {
  if (import.meta.env.VITE_PROVIDER === "mock") {
    // Subpath import: the package index also exports the contract suite, which needs vitest.
    const { MockProvider, MOCK_MODELS } = await import("@tarjuman/testing/mock-provider");
    return {
      provider: new MockProvider({ latencyMs: 15 }),
      modelIds: MOCK_MODELS.map((model) => model.id),
      defaultModelId: "mock-model",
    };
  }
  if (import.meta.env.DEV && import.meta.env.VITE_PROVIDER === "ollama") {
    const { DEFAULT_OLLAMA_MODEL_ID, OLLAMA_MODELS, OllamaProvider } = await import("@tarjuman/provider-ollama");
    const baseUrl = import.meta.env.VITE_OLLAMA_BASE_URL;
    return {
      provider: new OllamaProvider({
        ...(baseUrl ? { baseUrl } : {}),
        // Developer-only console output, not a user-facing string, so the i18n rule (Principle VIII)
        // does not apply. It logs the diagnostic object only: no request or message content.
        diagnose: (d) => console.warn("[tarjuman dev provider]", d.kind, d, "see docs/local-model.md#" + d.kind),
      }),
      modelIds: OLLAMA_MODELS.map((model) => model.id),
      defaultModelId: DEFAULT_OLLAMA_MODEL_ID,
    };
  }
  return {
    provider: new AnthropicProvider(),
    modelIds: ANTHROPIC_MODELS.map((model) => model.id),
    defaultModelId: DEFAULT_MODEL_ID,
  };
}

export interface AssembleOptions {
  provider: ProviderPort;
  modelIds: readonly string[];
  defaultModelId: string;
  storage: StoragePort & CredentialRecordAccess;
  storageAvailable: boolean;
  sessionSecrets: SessionSecrets;
  i18n: I18n;
}

/** Pure wiring: connects the pieces without reading the environment, so tests build the same graph. */
export function assembleServices(options: AssembleOptions): AppServices {
  const { provider, storage, i18n } = options;
  const credentials = new WebCredentialStore({ records: storage, sessionSecrets: options.sessionSecrets });

  const registry = new CapabilityRegistry();
  registry.register(languageQa);
  // Capability strings are namespaced `capability.<id>.*`, so they cannot replace core strings.
  for (const [locale, catalog] of Object.entries(languageQa.i18n)) registerCatalog(i18n, locale, catalog);

  const conversations = new ConversationService({
    storage,
    now: () => new Date().toISOString(),
    newId: () => crypto.randomUUID(),
  });
  const getProfile = async (): Promise<LearnerProfile> => {
    const profile = await storage.get<LearnerProfile>("profile", "profile");
    if (!profile) throw new Error("No profile: onboarding has not been completed.");
    return profile;
  };
  // Refusal templates come from the interface catalogs, which the core cannot import (FR-027).
  const refusalTemplate = (key: string, locale: string): string | undefined =>
    i18n.exists(key, { lng: locale }) ? i18n.t(key, { lng: locale }) : undefined;
  const pipeline = new Pipeline({
    provider,
    conversations,
    credentials,
    capabilities: registry,
    getProfile,
    refusalTemplate,
  });
  const keys = new KeyManager({
    validator: new ProviderCredentialValidator(provider),
    store: credentials,
    providerId: provider.id,
  });

  return {
    storage,
    storageAvailable: options.storageAvailable,
    credentials,
    registry,
    i18n,
    conversations,
    pipeline,
    keys,
    models: { ids: options.modelIds, defaultId: options.defaultModelId },
  };
}

export async function createAppServices(): Promise<AppServices> {
  // One in-memory holder shared by storage and the credential store, so "delete all my data"
  // also drops a session-only key.
  const indexedDb = new IndexedDbStorage({ sessionSecrets: defaultSessionSecrets });
  const storageAvailable = await indexedDb.isAvailable();

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

  const { provider, modelIds, defaultModelId } = await createProvider();
  return assembleServices({
    provider,
    modelIds,
    defaultModelId,
    storage: storageAvailable ? indexedDb : new MemoryStorage(),
    storageAvailable,
    sessionSecrets: defaultSessionSecrets,
    i18n,
  });
}
