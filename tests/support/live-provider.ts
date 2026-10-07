import { sealSecret, type ProviderPort, type SecretHandle } from "@tarjuman/core";
import { DEFAULT_OLLAMA_MODEL_ID, OllamaProvider } from "@tarjuman/provider-ollama";
import { FixtureProvenanceDraft, nonClaudeLabel } from "@tarjuman/testing/provenance";

/**
 * Picks the live provider for tools that run against a real model: the guardrail recorder (001
 * T079) and the live runners (001 T080). `TARJUMAN_PROVIDER` is `ollama` (default, free, local)
 * or `anthropic` (needs `TARJUMAN_TEST_KEY`, loaded with `node --env-file=.env`).
 *
 * It never prints an environment value. Concrete providers may only be built here and in the
 * composition root (dependency-cruiser).
 */
export interface LiveProviderSelection {
  provider: ProviderPort;
  secret: SecretHandle;
  modelId: string;
  provenance: FixtureProvenanceDraft;
}

export interface SelectOptions {
  /** Replaces the global `fetch` for the provider and the version probe. Tests use it. */
  fetch?: typeof fetch;
}

type Env = Record<string, string | undefined>;

const ALLOWED = ["ollama", "anthropic"] as const;
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
// The key the app's key screen accepts for Ollama; it is never sent.
const OLLAMA_PLACEHOLDER_KEY = "ollama";

export async function selectLiveProvider(env: Env = process.env, options: SelectOptions = {}): Promise<LiveProviderSelection> {
  const choice = env["TARJUMAN_PROVIDER"] || "ollama";
  if (choice === "ollama") return selectOllama(env, options);
  if (choice === "anthropic") return selectAnthropic(env);
  // The value is not echoed: a mistyped variable could hold anything.
  throw new Error(`Unknown TARJUMAN_PROVIDER. Allowed values: ${ALLOWED.join(", ")}.`);
}

async function selectOllama(env: Env, options: SelectOptions): Promise<LiveProviderSelection> {
  const baseUrl = (env["OLLAMA_BASE_URL"] || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, "");
  const modelId = env["OLLAMA_MODEL"] || DEFAULT_OLLAMA_MODEL_ID;
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const provider = new OllamaProvider({
    baseUrl,
    fetch: doFetch,
    defaultModelId: modelId,
    // The diagnostic holds no secret or content (research R4), so it is safe to print.
    diagnose: (d) => console.error("[tarjuman dev provider]", d.kind, d, "see docs/local-model.md#" + d.kind),
  });
  return {
    provider,
    secret: sealSecret(OLLAMA_PLACEHOLDER_KEY),
    modelId,
    provenance: FixtureProvenanceDraft.parse({
      providerId: "ollama",
      modelId,
      runtimeVersion: await runtimeVersion(baseUrl, doFetch),
      isClaude: false,
      label: nonClaudeLabel(modelId),
    }),
  };
}

async function selectAnthropic(env: Env): Promise<LiveProviderSelection> {
  const key = env["TARJUMAN_TEST_KEY"];
  if (!key) {
    throw new Error("TARJUMAN_PROVIDER=anthropic needs TARJUMAN_TEST_KEY. Run with `node --env-file=.env`.");
  }
  const { AnthropicProvider, DEFAULT_MODEL_ID } = await import("@tarjuman/provider-anthropic");
  return {
    provider: new AnthropicProvider(),
    secret: sealSecret(key),
    modelId: DEFAULT_MODEL_ID,
    provenance: FixtureProvenanceDraft.parse({
      providerId: "anthropic",
      modelId: DEFAULT_MODEL_ID,
      runtimeVersion: null,
      isClaude: true,
      label: `Recorded with Claude (${DEFAULT_MODEL_ID}).`,
    }),
  };
}

/** The Ollama version from `GET /api/version`, or null when it cannot be read. */
async function runtimeVersion(baseUrl: string, doFetch: typeof fetch): Promise<string | null> {
  try {
    const response = await doFetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const version = typeof body === "object" && body !== null ? (body as Record<string, unknown>)["version"] : undefined;
    return typeof version === "string" && version !== "" ? version : null;
  } catch {
    return null;
  }
}
