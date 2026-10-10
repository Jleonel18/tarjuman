import { stableStringify } from "@tarjuman/testing/hash";

/**
 * Pure checks behind `pnpm lint:rules` (001 T081, data-model DomainRule). A rule's content is
 * everything except its `version`; changing the content requires a bigger version, so a review
 * can see that the scope changed and the recorded fixtures are known to be stale.
 */

/** Negative, zero or positive, like a sort comparator. Both inputs are `major.minor.patch`. */
export function compareSemver(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

interface RuleLike {
  id?: unknown;
  version?: unknown;
}

function contentOf(rule: RuleLike): string {
  return stableStringify(Object.fromEntries(Object.entries(rule).filter(([key]) => key !== "version")));
}

/** A problem message, or `undefined` when the change is allowed. `base` is the rule on the base branch. */
export function ruleChangeProblem(base: unknown, current: unknown): string | undefined {
  if (base === undefined) return undefined; // A new rule has nothing to compare with.
  const before = base as RuleLike;
  const after = current as RuleLike;
  if (contentOf(before) === contentOf(after)) return undefined;
  const id = String(after.id ?? "(unknown)");
  const from = String(before.version);
  const to = String(after.version);
  if (compareSemver(to, from) <= 0) {
    return `Rule ${id} changed but its version is ${to} (base has ${from}). Bump \`version\` above ${from}.`;
  }
  return undefined;
}

/** Compares the committed `.recorded-hash` with the hash of the current rules and prompt layers. */
export function recordedHashProblem(recorded: string | undefined, current: string): string | undefined {
  if (recorded === undefined || recorded.trim() === "") {
    return "packages/testing/fixtures/guardrails/.recorded-hash is missing. Run `pnpm record:guardrails` and commit the result.";
  }
  if (recorded.trim() !== current) {
    return "The recorded guardrail fixtures are stale: the rules or prompt layers no longer match the ones they were recorded against. Run `pnpm record:guardrails` and commit the result.";
  }
  return undefined;
}
