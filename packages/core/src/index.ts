// Public surface of @tarjuman/core. The core is framework-free: no DOM, React, Node, or SDK.

export type * from "./ports/provider";
export type * from "./ports/storage";
export { SecretHandle, sealSecret, destroySecret } from "./ports/secret-handle";
// `unsealSecret` is intentionally not re-exported: only adapters import it, from the module path.

export type * from "./profile/types";
export { LEVELS, CONFIGURABLE_EFFORTS, DEFAULT_TONE_ID, DEFAULT_EFFORT } from "./profile/types";

export type * from "./conversation/types";
export type * from "./stats/types";
export type * from "./pipeline/types";

export type * from "./capabilities/types";
export { CAPABILITY_CONTRACT_VERSION } from "./capabilities/types";
export { capabilitySchema, domainRuleSchema, permissionSchema } from "./capabilities/schema";
export { CapabilityRegistry, CapabilityRegistrationError } from "./capabilities/registry";

export * from "./i18n/locales";
