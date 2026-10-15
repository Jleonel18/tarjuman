import languageQa from "@tarjuman/capability-language-qa";
import resourceCuration from "@tarjuman/capability-resource-curation";
import {
  CapabilityRegistry,
  CompositeCredentialValidator,
  SearchBroker,
  SearchCredentialValidator,
  SearchSettingsStore,
  availableUiLocales,
  ConversationService,
  DataController,
  KeyManager,
  Pipeline,
  ProviderCredentialValidator,
  ResourceRetention,
  SavedResourcesStore,
  type CredentialStore,
  readStoredProfile,
  type LearnerProfile,
  type ModelInfo,
  type ProviderPort,
  type SearchPort,
  type StoragePort,
  type StoredProfile,
} from "@tarjuman/core";
import { AnthropicProvider, DEFAULT_MODEL_ID } from "@tarjuman/provider-anthropic";
import { DEFAULT_GEMINI_MODEL_ID, GeminiProvider } from "@tarjuman/provider-gemini";
import { YouTubeSearch } from "@tarjuman/search-youtube";
import {
  IndexedDbStorage,
  MemoryStorage,
  ThemePreferenceStore,
  WebCredentialStore,
  defaultSessionSecrets,
  type SessionSecrets,
  type CredentialRecordAccess,
} from "@tarjuman/storage-web";
import { createI18n, getShippedCatalog, registerCatalog, type I18n } from "@tarjuman/ui";
import { createOtherTabs, noOtherTabs, type OtherTabs } from "./other-tabs";

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
  /** Interface languages the user can pick. Includes the pseudo-RTL test locale only in dev and test builds. */
  uiLocales: readonly string[];
  conversations: ConversationService;
  pipeline: Pipeline;
  keys: KeyManager;
  /** "Delete all my data". */
  data: DataController;
  /** The providers the learner can choose from, in display order, with their models (004). */
  providers: readonly ProviderOffer[];
  /** The light, dark, or follow-system choice, kept on the device (003). */
  themes: ThemePreferenceStore;
  /** Search on/off and consent per source (005). */
  searchSettings: SearchSettingsStore;
  /** Holds the search sources; the controller asks it for terms versions and card refreshes (005). */
  search: SearchBroker;
  /** The search sources this build offers, which are also credential ids. Empty: no search. */
  searchSourceIds: readonly string[];
  /** The saved list (005 US4). */
  saved: SavedResourcesStore;
  /** The 30-day rule for everything fetched from a search source (005 FR-021). */
  retention: ResourceRetention;
  /** The other open Tarjuman tabs, told when "delete all my data" runs (001 FR-017a). */
  otherTabs: OtherTabs;
  /**
   * Another tab is deleting all data: refuse every storage operation from now on and drop the
   * session-only keys. Cannot be undone; `restart` follows.
   */
  stopWriting(): void;
  /** Starts this tab again from nothing (a reload), as a fresh visit would. */
  restart(): void;
}

/** One provider the build offers, as the UI and the controller see it: no `ProviderPort` (004). */
export interface ProviderOffer {
  id: string;
  models: readonly ModelInfo[];
  /** The model a profile starts with, and resets to when the learner switches to this provider. */
  defaultModelId: string;
}

/** A concrete provider and the model a new profile on it starts with. */
export interface ProviderEntry {
  provider: ProviderPort;
  defaultModelId: string;
}

/**
 * Builds the providers the app offers, in display order (004 research R15). `VITE_PROVIDER=mock`
 * (the e2e build) swaps in deterministic mocks. `VITE_PROVIDER=ollama` swaps in the local Ollama
 * adapter, in the dev server only: the branch is guarded by `import.meta.env.DEV`, so a production
 * build drops it and never contains the adapter (specs/002-free-dev-provider, SC-005).
 */
async function createProviders(): Promise<ProviderEntry[]> {
  if (import.meta.env.VITE_PROVIDER === "mock") {
    // Subpath import: the package index also exports the contract suite, which needs vitest.
    const { DEFAULT_MOCK_KEY, MOCK_ALT_MODELS, MockProvider, REPLACEMENT_MOCK_KEY, scopeAwareResponder } = await import(
      "@tarjuman/testing/mock-provider"
    );
    const params = new URLSearchParams(window.location.search);
    // `?mockLatencyMs=` sets the delay before each streamed event, so the latency e2e can simulate a
    // real network (T149). Clamped; the default keeps the other e2e tests fast.
    const requested = Number(params.get("mockLatencyMs") ?? "15");
    const latencyMs = Number.isFinite(requested) ? Math.min(Math.max(requested, 0), 2000) : 15;
    const mock = (id: string, models?: typeof MOCK_ALT_MODELS) =>
      new MockProvider({
        id,
        ...(models && { models }),
        latencyMs,
        responder: scopeAwareResponder,
        validKeys: [DEFAULT_MOCK_KEY, REPLACEMENT_MOCK_KEY],
      });
    const entries: ProviderEntry[] = [{ provider: mock("mock"), defaultModelId: "mock-model" }];
    // `?mockProviders=2` offers a second provider, as the product offers two, so e2e can cover the
    // choice and the switch (004). Without it every other spec sees one provider and no choice.
    if (params.get("mockProviders") === "2") entries.push({ provider: mock("mock-alt", MOCK_ALT_MODELS), defaultModelId: "mock-alt-model" });
    return entries;
  }
  if (import.meta.env.DEV && import.meta.env.VITE_PROVIDER === "ollama") {
    const { DEFAULT_OLLAMA_MODEL_ID, OllamaProvider } = await import("@tarjuman/provider-ollama");
    const baseUrl = import.meta.env.VITE_OLLAMA_BASE_URL;
    return [
      {
        provider: new OllamaProvider({
          ...(baseUrl ? { baseUrl } : {}),
          // Developer-only console output, not a user-facing string, so the i18n rule (Principle VIII)
          // does not apply. It logs the diagnostic object only: no request or message content.
          diagnose: (d) => console.warn("[tarjuman dev provider]", d.kind, d, "see docs/local-model.md#" + d.kind),
        }),
        defaultModelId: DEFAULT_OLLAMA_MODEL_ID,
      },
    ];
  }
  // The product: Anthropic first (constitution: first provider), then Gemini (004).
  return [
    { provider: new AnthropicProvider(), defaultModelId: DEFAULT_MODEL_ID },
    { provider: new GeminiProvider(), defaultModelId: DEFAULT_GEMINI_MODEL_ID },
  ];
}

/**
 * Builds the search sources the app offers (005). The e2e build swaps in a scripted double that
 * answers by the words of the query; the product searches YouTube.
 */
async function createSearchSources(): Promise<SearchPort[]> {
  if (import.meta.env.VITE_PROVIDER === "mock") {
    const { e2eSearchResponder, MockSearchPort } = await import("@tarjuman/testing/mock-search");
    return [new MockSearchPort({ respond: e2eSearchResponder })];
  }
  return [new YouTubeSearch()];
}

export interface AssembleOptions {
  /** In display order. Ids must be unique; the pipeline checks it. */
  providers: readonly ProviderEntry[];
  /** The search sources (005). Without any, no search tool is offered and the curation capability is not registered. */
  searchSources?: readonly SearchPort[];
  /** `detach` is how a tab stops writing while another tab deletes all data (001 FR-017a). */
  storage: StoragePort & CredentialRecordAccess & { detach(): void };
  storageAvailable: boolean;
  sessionSecrets: SessionSecrets;
  i18n: I18n;
  /** True when the pseudo-RTL test locale is registered. Never true in a normal production build. */
  includeTestLocales?: boolean;
  /** Defaults to a store over the browser's `localStorage`. */
  themes?: ThemePreferenceStore;
  /** Defaults to none: only the browser build talks to other tabs. */
  otherTabs?: OtherTabs;
  /** Defaults to reloading the page. */
  restart?: () => void;
}

/** Pure wiring: connects the pieces without reading the environment, so tests build the same graph. */
export function assembleServices(options: AssembleOptions): AppServices {
  const { storage, i18n } = options;
  const providers = options.providers.map((entry) => entry.provider);
  const credentials = new WebCredentialStore({ records: storage, sessionSecrets: options.sessionSecrets });

  const searchPorts = options.searchSources ?? [];
  const searchSourceIds = searchPorts.map((port) => port.id);
  const registry = new CapabilityRegistry({ searchSources: searchSourceIds });
  const capabilities = searchPorts.some((port) => port.id === "youtube") ? [languageQa, resourceCuration] : [languageQa];
  for (const capability of capabilities) {
    registry.register(capability);
    // Capability strings are namespaced `capability.<id>.*`, so they cannot replace core strings.
    for (const [locale, catalog] of Object.entries(capability.i18n)) registerCatalog(i18n, locale, catalog);
  }
  const now = () => new Date().toISOString();
  const searchSettings = new SearchSettingsStore({ storage, now });
  const search = new SearchBroker({ ports: searchPorts, settings: searchSettings, credentials });
  const saved = new SavedResourcesStore({ storage, now });
  const retention = new ResourceRetention({ storage, search, now });

  const conversations = new ConversationService({
    storage,
    now: () => new Date().toISOString(),
    newId: () => crypto.randomUUID(),
  });
  const getProfile = async (): Promise<LearnerProfile> => {
    // A profile saved before 004 has no provider: it is read as Anthropic's (FR-002).
    const profile = readStoredProfile(await storage.get<StoredProfile>("profile", "profile"));
    if (!profile) throw new Error("No profile: onboarding has not been completed.");
    return profile;
  };
  // Refusal templates come from the interface catalogs, which the core cannot import (FR-027).
  const refusalTemplate = (key: string, locale: string): string | undefined =>
    i18n.exists(key, { lng: locale }) ? i18n.t(key, { lng: locale }) : undefined;
  const pipeline = new Pipeline({
    providers,
    conversations,
    credentials,
    capabilities: registry,
    getProfile,
    refusalTemplate,
    search,
  });
  const keys = new KeyManager({
    validator: new CompositeCredentialValidator([
      new ProviderCredentialValidator(providers),
      new SearchCredentialValidator(searchPorts),
    ]),
    store: credentials,
  });

  return {
    storage,
    storageAvailable: options.storageAvailable,
    credentials,
    registry,
    i18n,
    uiLocales: availableUiLocales(options.includeTestLocales === true),
    conversations,
    pipeline,
    keys,
    data: new DataController({ storage, credentials, credentialIds: [...providers.map((p) => p.id), ...searchSourceIds] }),
    providers: options.providers.map(({ provider, defaultModelId }) => ({
      id: provider.id,
      models: provider.listModels(),
      defaultModelId,
    })),
    themes: options.themes ?? new ThemePreferenceStore(),
    searchSettings,
    search,
    searchSourceIds,
    saved,
    retention,
    otherTabs: options.otherTabs ?? noOtherTabs,
    stopWriting: () => {
      storage.detach();
      options.sessionSecrets.clear();
    },
    restart: options.restart ?? (() => globalThis.location?.reload()),
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
  // with VITE_PSEUDO_LOCALE=1 (the e2e build); a normal production build drops this branch entirely.
  const includeTestLocales = import.meta.env.DEV || import.meta.env.VITE_PSEUDO_LOCALE === "1";
  if (includeTestLocales) {
    const { PSEUDO_RTL_LOCALE_TAG, pseudoRtlCatalog } = await import("@tarjuman/testing/pseudo-rtl");
    registerCatalog(i18n, PSEUDO_RTL_LOCALE_TAG, pseudoRtlCatalog(getShippedCatalog("en") ?? {}));
    // `?locale=ar-XB` starts the app in the test locale, so the first-run screens can be checked too.
    if (new URLSearchParams(window.location.search).get("locale") === PSEUDO_RTL_LOCALE_TAG) {
      await i18n.changeLanguage(PSEUDO_RTL_LOCALE_TAG);
    }
  }

  const services = assembleServices({
    providers: await createProviders(),
    searchSources: await createSearchSources(),
    storage: storageAvailable ? indexedDb : new MemoryStorage(),
    storageAvailable,
    sessionSecrets: defaultSessionSecrets,
    i18n,
    includeTestLocales,
    otherTabs: createOtherTabs(),
  });
  // The 30-day rule runs at every start, before anything is read for the screen (005 FR-021).
  await services.retention.purgeExpired();
  return services;
}
