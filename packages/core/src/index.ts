// Public surface of @tarjuman/core. The core is framework-free: no DOM, React, Node, or SDK.

export type * from "./ports/provider";
export type * from "./ports/storage";
export { SecretHandle, sealSecret, destroySecret } from "./ports/secret-handle";
// `unsealSecret` is intentionally not re-exported: only adapters import it, from the module path.

export type * from "./profile/types";
export { LEVELS, CONFIGURABLE_EFFORTS, DEFAULT_TONE_ID, DEFAULT_EFFORT } from "./profile/types";
export { TONE_PRESETS, getTonePreset } from "./profile/tone-presets";

export type * from "./conversation/types";
export type * from "./stats/types";
export type * from "./pipeline/types";

export type * from "./capabilities/types";
export { CAPABILITY_CONTRACT_VERSION } from "./capabilities/types";
export { capabilitySchema, domainRuleSchema, permissionSchema } from "./capabilities/schema";
export { CapabilityRegistry, CapabilityRegistrationError } from "./capabilities/registry";
export { PermissionBroker, PermissionDeniedError } from "./capabilities/permission-broker";
export type {
  BrokerServices,
  DenialReason,
  PermissionBrokerDeps,
  PermissionDenial,
  ToolAuthorization,
} from "./capabilities/permission-broker";
export { loadRules, RuleLoadError } from "./guardrails/rule-loader";
export type { RefusalTemplates } from "./guardrails/refusal";

export * from "./i18n/locales";

export { validateProfile, readStoredProfile, LEGACY_PROVIDER_ID, MAX_INTERESTS, MAX_INTEREST_LENGTH } from "./profile/validation";
export type { ProfileInput, ProfileIssue, ProfileValidation, ProfileValidationOptions, StoredProfile } from "./profile/validation";
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
export type { ToolCall, ToolCallDecision } from "./pipeline/output-guard";
export { guardInput, normalizeForMatching, WITHHELD_MARKER } from "./pipeline/input-guard";
export type { GuardInput, GuardedInput } from "./pipeline/input-guard";
export { checkTaint } from "./pipeline/taint-gate";
export type { TaintCheck, TaintDecision } from "./pipeline/taint-gate";
export { ProviderCredentialValidator } from "./pipeline/credential-validation";
export type { CredentialValidator } from "./pipeline/credential-validation";
// Explicitly exported, so this class takes the place of the `Pipeline` interface in `types.ts`.
export { Pipeline } from "./pipeline/pipeline";
export type { PipelineDeps } from "./pipeline/pipeline";

export { KeyManager } from "./credentials/key-manager";
export type { EnterKeyOutcome, KeyManagerDeps, KeyState, WrongProvider } from "./credentials/key-manager";
export { DataController } from "./credentials/data-controller";
export { findKeyShape, hasKeyShape, KEY_SHAPES, maskKey, providerOfKey } from "./credentials/key-shapes";
export type { KeyShape } from "./credentials/key-shapes";
export type { DataControllerDeps, DeleteAllOutcome } from "./credentials/data-controller";

export { buildUsageRecord, sumUsage, isContextWarning, CONTEXT_WARNING_RATIO } from "./stats/usage";
export type { BuildUsageInput, ReportedUsage, UsageTotals } from "./stats/usage";
export { recommendEffort, extractRequestFeatures } from "./stats/recommend-effort";
export type { RequestFeatures, RequestType } from "./stats/recommend-effort";
