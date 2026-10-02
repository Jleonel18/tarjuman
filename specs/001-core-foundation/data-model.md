# Data Model: Core Foundation

Entities from the spec's Key Entities, with fields, validation, relationships, and state
transitions. Types are expressed language-neutrally; the implementation is TypeScript. All
persisted entities live behind `StoragePort` and are removed by `clearAll()`.

Language codes use BCP 47. The model **always** keeps `uiLanguage`, `mediationLanguage`, and
`targetLanguage` as separate fields (Principle VIII).

## LearnerProfile  (store: `profile`, singleton)

| Field | Type | Rules |
|-------|------|-------|
| `uiLanguage` | BCP 47 | one of shipped UI locales (`en`, `es`) |
| `mediationLanguage` | BCP 47 | required; ≠ `targetLanguage` (FR-034) |
| `targetLanguage` | BCP 47 | required; any language (low-resource allowed, FR edge case) |
| `level` | `A1`…`C2` \| `unknown` | FR-035 |
| `interests` | string[] | 0–10 items, each ≤ 60 chars, treated as **untrusted data** when rendered into prompts |
| `toneId` | TonePreset id | default `neutral` |
| `configuredEffort` | `low` \| `medium` \| `high` | default `medium` |
| `modelId` | string | must exist in provider model table |
| `createdAt`, `updatedAt` | ISO datetime | |

`interests` and any free text from the user enter prompts only inside `user_profile` data blocks
(trust level: user-supplied), never in the instruction layers.

## ProviderCredential  (store: `credential`, singleton; never exposed to the model)

| Field | Type | Rules |
|-------|------|-------|
| `providerId` | string | `anthropic` in this feature |
| `storageMode` | `persistent` \| `session` | chosen explicitly on first entry (FR-016) |
| `ciphertext`, `iv` | bytes | present only when `persistent` |
| `wrappingKeyRef` | CryptoKey handle | non-extractable AES-GCM, persistent only |
| `maskedHint` | string | e.g. `sk-ant-…a1b2`; only form shown in UI (FR-015) |
| `validationStatus` | `valid` \| `invalid` \| `revoked` \| `quota` \| `unknown` | |
| `validatedAt` | ISO datetime | |

State: `absent → validating → (stored | rejected)`; `stored → replaced → validating`;
`stored → deleted → absent`. A key is persisted only after a `valid` validation result. For
`session` mode the secret lives in memory only and the record holds no ciphertext.

## Conversation  (store: `conversations`)

| Field | Type | Rules |
|-------|------|-------|
| `id` | UUID | |
| `title` | string | derived from first user message; user-editable |
| `capabilityId` | string | owning capability (`language-qa`) |
| `createdAt`, `updatedAt` | ISO datetime | |
| `languageSnapshot` | `{mediation, target}` | languages at creation, for rendering history correctly after settings change |

## Message  (store: `messages`, index by `conversationId`)

| Field | Type | Rules |
|-------|------|-------|
| `id` | UUID | |
| `conversationId` | UUID | FK → Conversation |
| `author` | `user` \| `assistant` \| `system` | `system` is app-generated notices only (e.g. key-shape warning) |
| `segments` | Segment[] | ordered; each has `trust` and `text` |
| `status` | `complete` \| `streaming` \| `interrupted` \| `refused` | see transitions |
| `verdict` | `accept` \| `refuse` \| `clarify` \| null | parsed domain verdict for assistant messages |
| `ruleIds` | string[] | rule ids (with versions) that fired |
| `usageId` | UUID \| null | FK → UsageRecord (assistant messages) |
| `createdAt` | ISO datetime | |

**Segment**: `{ trust: "trusted" | "user" | "untrusted", text: string }`. User-typed text is
`user`; text the user marks/pastes as material and any external content is `untrusted`.
Withheld key-shaped strings are **never stored** (replaced by a placeholder segment).

Status transitions: `streaming → complete` (normal) · `streaming → interrupted` (network drop or
user stop) · `streaming → refused` (verdict `refuse`; body replaced by localized refusal) ·
`interrupted → (new retry message)`; retry creates a new message, the interrupted one is kept
marked incomplete.

## UsageRecord  (store: `usage`)

| Field | Type | Rules |
|-------|------|-------|
| `id` | UUID | |
| `conversationId`, `messageId` | UUID | |
| `modelId` | string | |
| `inputTokens`, `outputTokens` | int | **provider-reported only** (SC-005) |
| `cacheReadTokens`, `cacheWriteTokens` | int | 0 when not reported |
| `contextUsedTokens` | int | derived from `inputTokens` (+ cache reads) |
| `contextWindow` | int | from model table |
| `contextRatio` | number 0–1 | warn at ≥ 0.8 (FR-019) |
| `estimatedCostUsd` | number \| null | `null` ⇒ pricing unavailable (FR-021) |
| `pricingAsOf` | date \| null | date of price-table row used |
| `configuredEffort` | enum | at send time |
| `recommendedEffort` | enum | heuristic result at send time |
| `createdAt` | ISO datetime | |

Session totals are computed by summation over records of a conversation, not stored.

## Capability  (in-memory registry; not persisted)

| Field | Type | Rules |
|-------|------|-------|
| `id`, `version` | string, semver | unique id |
| `tools` | ToolDeclaration[] | each has JSON-Schema input and `requiredPermissions` |
| `permissions` | Permission[] | declared upfront; anything else denied (FR-023) |
| `domainRules` | DomainRule[] | each must carry accept + refuse cases |
| `promptFragments` | `{ role, instruction }` map | localizable ids; cannot occupy the security/scope layers |
| `i18nNamespaces` | map locale → catalog | merged into the UI catalog at registration |

Validation at registration (Zod): unique ids, non-empty rule cases, no tool referencing an
undeclared permission, fragments restricted to the `capability` layer.

## DomainRule  (data files; schema: [contracts/domain-rule.schema.json](contracts/domain-rule.schema.json))

`id`, `version` (semver), `description`, `acceptCases[]`, `refuseCases[]`, `clarifyCases[]?`,
`refusalTemplateKey` (i18n key). Changing a rule requires a version bump (checked in CI by diffing
content hash vs. version).

## TonePreset  (data)

`id` (`warm` \| `neutral` \| `formal` at minimum), `nameKey` (i18n key), `guidance` (prompt
fragment). Assembled only in the tone layer.

## AdversarialCase  (data files; schema: [contracts/adversarial-case.schema.json](contracts/adversarial-case.schema.json))

`id`, `category` (the seven FR-036 categories), `input`, `simulatedExternalContent?`, `locale`,
`encoding?`, `expect` (machine-checkable assertions), `addedIn` (version/PR), `origin`
(`seed` \| `reported-bypass`).

## Relationships

```
LearnerProfile 1──1 ProviderCredential (both singletons per device)
Conversation 1──* Message 1──0..1 UsageRecord
Conversation *──1 Capability (by id, resolved at runtime)
Capability 1──* DomainRule        TonePreset *──1 LearnerProfile (by id)
```

## Deletion semantics (FR-005, FR-017, SC-007)

- Delete conversation: removes its messages and usage records.
- Delete key: removes the credential record and the CryptoKey.
- Delete all: `StoragePort.clearAll()` drops the entire `tarjuman` database, removes the CryptoKey,
  clears in-memory session secrets and any Cache Storage, then asserts emptiness before returning
  the app to first-run.
