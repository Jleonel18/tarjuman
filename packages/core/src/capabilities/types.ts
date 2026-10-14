import type { JsonSchema, JsonValue } from "../ports/provider";
import type { ResourceType } from "../ports/search";
import type { Collection } from "../ports/storage";

/**
 * Capability contract, versions 1.0.0 and 1.1.0 (contracts/capability-contract.md and, for 1.1.0,
 * specs/005-resource-curation/contracts/capability-contract-1.1.md). A capability declares data; it
 * never receives a provider, a secret, or a pipeline stage. Every 1.1.0 addition is optional, and
 * a 1.0.0 capability stays valid unchanged.
 */

/** The version new capabilities target. */
export const CAPABILITY_CONTRACT_VERSION = "1.1.0";
export const SUPPORTED_CONTRACT_VERSIONS = ["1.0.0", "1.1.0"] as const;
export type CapabilityContractVersion = (typeof SUPPORTED_CONTRACT_VERSIONS)[number];

export type Locale = string;

/** Locale tag to text, e.g. { en: "…", es: "…" }. */
export type LocalizedText = Record<Locale, string>;

export type Permission =
  /** Egress allowlist (Principle V). */
  | { kind: "network"; allowedHosts: string[] }
  | { kind: "storage"; collections: Collection[]; access: "read" | "write" }
  | { kind: "ui"; surface: "notice" }
  /** 1.1.0: which search sources a tool may use through `ctx.search`. */
  | { kind: "search"; sources: string[] };

export type ToolResult = { ok: true; output: JsonValue } | { ok: false; error: string };

/** What a tool may ask of a search source. The language and the source are never the tool's to set. */
export interface ToolSearchRequest {
  query: string;
  kind: "any" | "music";
  captionsOnly?: boolean;
}

/** A result as a tool sees it: a turn-wide `ref` and descriptive fields, never a link or a key. */
// A type alias, not an interface: it must be assignable to `JsonValue` so a tool can return it.
export type ToolSearchResult = {
  ref: string;
  title: string;
  channel: string;
  descriptionExcerpt: string;
  durationSeconds: number | null;
  hasCaptions: boolean | null;
  audioLanguage: string | null;
  type: ResourceType;
};

export type ToolSearchOutcome = { ok: true; results: ToolSearchResult[] } | { ok: false; error: string };

/** Brokered, least-privilege helpers. Each is checked against the declared permissions. */
export interface ToolContext {
  readonly capabilityId: string;
  readonly net: { fetch(url: string): Promise<{ status: number; text: string }> };
  readonly storage: {
    get(collection: Collection, id: string): Promise<unknown>;
    put(collection: Collection, value: { id: string }): Promise<void>;
  };
  readonly ui: { notice(messageKey: string): void };
  /** 1.1.0. Denied unless the tool declared a `search` permission listing the source. */
  readonly search: { videos(req: ToolSearchRequest): Promise<ToolSearchOutcome> };
}

export interface ToolDeclaration {
  name: string;
  description: LocalizedText;
  /** Strict, `additionalProperties: false`. */
  inputSchema: JsonSchema;
  /** Must be a subset of the capability's `permissions`. */
  requiredPermissions: Permission[];
  /** True means the taint gate applies (FR-010). */
  sideEffecting: boolean;
  /** 1.1.0: the input becomes a `resources` event; the tool is validated and kept, never run. */
  presentation?: "resources";
  /** Required unless the tool is a presentation tool. */
  handler?(input: unknown, ctx: ToolContext): Promise<ToolResult>;
}

export interface DomainRuleCase {
  input: string;
  /** BCP 47 language of the input. */
  locale: string;
  profile?: { mediation?: string; target?: string };
  note?: string;
}

/** Versioned, declarative scope rule (FR-025, FR-026). */
export interface DomainRule {
  id: string;
  version: string;
  description: string;
  /** i18n key of the courteous refusal template. */
  refusalTemplateKey: string;
  acceptCases: DomainRuleCase[];
  refuseCases: DomainRuleCase[];
  clarifyCases?: DomainRuleCase[];
}

/**
 * What a turn can do with search, decided by the app and not by the model (005 FR-009). A fragment
 * can be tied to a state, so the model is told only what is true: how to search when it can, and
 * why it cannot when it cannot.
 */
export type SearchState = "available" | "off" | "no_key" | "model_cannot_search";

/** A capability may only add to the `capability` layer; security and scope sit above it. */
export interface PromptFragment {
  layer: "capability";
  text: LocalizedText;
  /** 1.1.0. Included only when the turn's search state is listed; absent means always. */
  whenSearch?: SearchState[];
}

export interface Capability {
  id: string;
  version: string;
  contractVersion: CapabilityContractVersion;
  /** 1.1.0. `all_conversations` adds this capability's fragments and tools to every turn. Default own. */
  availability?: "own_conversations" | "all_conversations";
  tools: ToolDeclaration[];
  /** Everything a tool may do, declared up front. Anything else is denied (FR-023). */
  permissions: Permission[];
  domainRules: DomainRule[];
  promptFragments: Record<string, PromptFragment>;
  /** Namespaced `capability.<id>.*`. */
  i18n: Record<Locale, Record<string, string>>;
}
