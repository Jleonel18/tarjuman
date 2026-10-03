/**
 * INTERNAL. The private table behind `SecretHandle`. Importing this module is the capability to
 * read secrets, so only `secret-handle.ts` (to seal/destroy) and `secret-unseal.ts` may import
 * it. The `unseal-secret-only-in-adapters` rule in `.dependency-cruiser.cjs` enforces that.
 *
 * Keyed by `object` (not `SecretHandle`) so this module imports nothing and cannot form a cycle.
 */
export const secretStore = new WeakMap<object, string>();
