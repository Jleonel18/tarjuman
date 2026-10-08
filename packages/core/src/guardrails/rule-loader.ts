import { domainRuleSchema } from "../capabilities/schema";
import type { DomainRule } from "../capabilities/types";

/** Thrown when any rule is invalid, so a bad rule stops startup instead of weakening the scope. */
export class RuleLoadError extends Error {
  override readonly name = "RuleLoadError";
}

/**
 * Validates declarative scope rules (FR-025, FR-026) against the same shape as
 * contracts/domain-rule.schema.json. All-or-nothing: one invalid rule rejects the whole load.
 * The message names the rule's position and id (when it has a string one) and each failing
 * field path, never the rejected values.
 */
export function loadRules(inputs: readonly unknown[]): DomainRule[] {
  const rules: DomainRule[] = [];
  const problems: string[] = [];

  inputs.forEach((input, index) => {
    const result = domainRuleSchema.safeParse(input);
    if (result.success) {
      // Zod infers `| undefined` on optional fields; DomainRule (exactOptionalPropertyTypes) does not.
      // The schema is strict, so no key can hold `undefined` after a successful parse.
      rules.push(result.data as DomainRule);
      return;
    }
    const id = readId(input);
    const label = id === undefined ? `rule ${index}` : `rule ${index} (${id})`;
    const issues = result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`);
    problems.push(`${label}: ${issues.join("; ")}`);
  });

  if (problems.length > 0) throw new RuleLoadError(`Invalid domain rules. ${problems.join(" | ")}`);
  return rules;
}

function readId(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const id = (input as { id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}
