import type { JsonSchema, JsonValue } from "../ports/provider";
import type { Collection } from "../ports/storage";

/**
 * Capability contract, version 1.0.0 (contracts/capability-contract.md). A capability declares
 * data; it never receives a provider, a secret, or a pipeline stage.
 */

export const CAPABILITY_CONTRACT_VERSION = "1.0.0";

export type Locale = string;

/** Locale tag to text, e.g. { en: "…", es: "…" }. */
export type LocalizedText = Record<Locale, string>;

export type Permission =
  /** Egress allowlist (Principle V). */
  | { kind: "network"; allowedHosts: string[] }
  | { kind: "storage"; collections: Collection[]; access: "read" | "write" }
  | { kind: "ui"; surface: "notice" };

export type ToolResult = { ok: true; output: JsonValue } | { ok: false; error: string };

/** Brokered, least-privilege helpers. Each is checked against the declared permissions. */
export interface ToolContext {
  readonly capabilityId: string;
  readonly net: { fetch(url: string): Promise<{ status: number; text: string }> };
  readonly storage: {
    get(collection: Collection, id: string): Promise<unknown>;
    put(collection: Collection, value: { id: string }): Promise<void>;
  };
  readonly ui: { notice(messageKey: string): void };
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
  handler(input: unknown, ctx: ToolContext): Promise<ToolResult>;
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

/** A capability may only add to the `capability` layer; security and scope sit above it. */
export interface PromptFragment {
  layer: "capability";
  text: LocalizedText;
}

export interface Capability {
  id: string;
  version: string;
  contractVersion: typeof CAPABILITY_CONTRACT_VERSION;
  tools: ToolDeclaration[];
  /** Everything a tool may do, declared up front. Anything else is denied (FR-023). */
  permissions: Permission[];
  domainRules: DomainRule[];
  promptFragments: Record<string, PromptFragment>;
  /** Namespaced `capability.<id>.*`. */
  i18n: Record<Locale, Record<string, string>>;
}
