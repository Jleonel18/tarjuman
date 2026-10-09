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
export { loadRules, RuleLoadError } from "./guardrails/rule-loader";
export type { RefusalTemplates } from "./guardrails/refusal";

export * from "./i18n/locales";

export { validateProfile, MAX_INTERESTS, MAX_INTEREST_LENGTH } from "./profile/validation";
export type { ProfileInput, ProfileIssue, ProfileValidation, ProfileValidationOptions } from "./profile/validation";
export { LEVEL_INFO } from "./profile/levels";
export type { LevelInfo } from "./profile/levels";

export { ConversationService } from "./conversation/service";
export type {
  ConversationServiceDeps,
  CreateConversationInput,
  OpenConversation,
  FinalStatus,
  FinishDetails,
} from "./conversation/service";

export { ContextAssembler } from "./pipeline/context-assembler";
export type { AssembleInput, AssembledContext } from "./pipeline/context-assembler";
export { renderSafeBlocks, OutputGuard } from "./pipeline/output-guard";
export { ProviderCredentialValidator } from "./pipeline/credential-validation";
export type { CredentialValidator } from "./pipeline/credential-validation";
// Explicitly exported, so this class takes the place of the `Pipeline` interface in `types.ts`.
export { Pipeline } from "./pipeline/pipeline";
export type { PipelineDeps } from "./pipeline/pipeline";

export { KeyManager } from "./credentials/key-manager";
export type { EnterKeyOutcome, KeyManagerDeps, KeyState } from "./credentials/key-manager";
