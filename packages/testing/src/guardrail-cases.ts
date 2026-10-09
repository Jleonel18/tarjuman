import type { DomainRule } from "@tarjuman/core";

export type CaseKind = "accept" | "refuse" | "clarify";

/** One accept, refuse or clarify case of a rule, with where its recorded response lives. */
export interface GuardrailCase {
  /** Unique and readable: `<ruleId> <kind>-<n>: <input>`. */
  name: string;
  kind: CaseKind;
  ruleId: string;
  /** Relative to `packages/testing/fixtures/guardrails/`: `<ruleId>/<kind>-<n>.json`. */
  fixturePath: string;
  input: string;
  mediation: string;
  target: string;
}

const DEFAULT_TARGET = "ja";

/**
 * Every case of every rule, in a fixed order (per rule: accept, refuse, clarify). The recorder,
 * the per-PR suite and the live runner all use this, so a case always means the same profile and
 * the same file.
 */
export function guardrailCases(rules: readonly DomainRule[]): GuardrailCase[] {
  return rules.flatMap((rule) => {
    const groups: [CaseKind, DomainRule["acceptCases"]][] = [
      ["accept", rule.acceptCases],
      ["refuse", rule.refuseCases],
      ["clarify", rule.clarifyCases ?? []],
    ];
    return groups.flatMap(([kind, list]) =>
      list.map(
        (c, n): GuardrailCase => ({
          name: `${rule.id} ${kind}-${n}: ${c.input}`,
          kind,
          ruleId: rule.id,
          fixturePath: `${rule.id}/${kind}-${n}.json`,
          input: c.input,
          mediation: c.profile?.mediation ?? c.locale,
          target: c.profile?.target ?? DEFAULT_TARGET,
        }),
      ),
    );
  });
}
