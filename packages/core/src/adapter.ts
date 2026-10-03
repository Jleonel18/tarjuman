/**
 * ADAPTERS ONLY (provider and storage adapters, test doubles). Import as
 * `@tarjuman/core/adapter`. The `unseal-secret-only-in-adapters` rule forbids every other
 * importer, so UI, capabilities, and the pipeline cannot read a raw secret.
 */
export { unsealSecret } from "./ports/secret-unseal";
