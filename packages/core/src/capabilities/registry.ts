import type { ZodError } from "zod";
import { capabilitySchema } from "./schema";
import type { Capability, DomainRule } from "./types";

export class CapabilityRegistrationError extends Error {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[]) {
    super(`${message}: ${issues.join("; ")}`);
    this.name = "CapabilityRegistrationError";
    this.issues = issues;
  }
}

function describeIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  });
}

/** Freezes plain data deeply; functions are left callable (their identity is frozen). */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/**
 * Holds registered capabilities and exposes read-only views only. There is deliberately no API to
 * reorder, skip, or replace pipeline stages here (US8-3), and registering a capability needs no
 * change in `core` (SC-008).
 */
export class CapabilityRegistry {
  readonly #capabilities = new Map<string, Readonly<Capability>>();
  readonly #ruleOwners = new Map<string, string>();

  /**
   * Validates and registers a capability. The caller's object is never mutated or frozen; the
   * registry keeps its own validated, frozen copy.
   *
   * @throws CapabilityRegistrationError when the declaration is invalid or conflicts.
   */
  register(candidate: unknown): Readonly<Capability> {
    const parsed = capabilitySchema.safeParse(candidate);
    if (!parsed.success) {
      throw new CapabilityRegistrationError("Invalid capability declaration", describeIssues(parsed.error));
    }
    const capability = parsed.data as Capability;

    const conflicts: string[] = [];
    if (this.#capabilities.has(capability.id)) {
      conflicts.push(`Capability "${capability.id}" is already registered`);
    }
    const ruleIds = new Set<string>();
    for (const rule of capability.domainRules) {
      const owner = this.#ruleOwners.get(rule.id);
      if (owner !== undefined) conflicts.push(`Domain rule "${rule.id}" is already declared by "${owner}"`);
      if (ruleIds.has(rule.id)) conflicts.push(`Domain rule "${rule.id}" is declared twice`);
      ruleIds.add(rule.id);
    }
    if (conflicts.length > 0) {
      throw new CapabilityRegistrationError("Capability conflicts with the registry", conflicts);
    }

    const frozen = deepFreeze(capability);
    this.#capabilities.set(frozen.id, frozen);
    for (const rule of frozen.domainRules) this.#ruleOwners.set(rule.id, frozen.id);
    return frozen;
  }

  has(id: string): boolean {
    return this.#capabilities.has(id);
  }

  get(id: string): Readonly<Capability> | undefined {
    return this.#capabilities.get(id);
  }

  list(): readonly Readonly<Capability>[] {
    return Object.freeze([...this.#capabilities.values()]);
  }

  /** All domain rules across capabilities, for the scope layer and the guardrail tests. */
  domainRules(): readonly Readonly<DomainRule>[] {
    return Object.freeze(this.list().flatMap((capability) => capability.domainRules));
  }
}
