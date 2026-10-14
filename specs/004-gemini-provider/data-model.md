# Data Model: Gemini Provider

**Feature**: [spec.md](spec.md) | **Research**: [research.md](research.md)

Only changes are listed. Everything else in `specs/001-core-foundation/data-model.md` stands.

## ProviderId

`"anthropic" | "gemini"` in the product. Dev and test builds also use `"ollama"`, `"mock"`, and a
second mock id. In the core it stays a `string` (the core names no provider); the composition root
decides which ids exist.

## LearnerProfile (changed)

| Field | Change | Rule |
|---|---|---|
| `providerId` | **new**, string | Must be the `id` of a provider the build offers. Missing on a stored profile → read as `"anthropic"` (FR-002). |
| `modelId` | rule changed | Must be in the model table of `providerId` (was: any known model id). |

Transitions:

- Onboarding: the learner picks `providerId` explicitly (no preselection when more than one provider
  is offered). `modelId` = that provider's default.
- Switching provider in settings: `providerId` changes; `modelId` resets to the new provider's
  default; `configuredEffort` is kept.

## Stored credential (changed: one per provider)

| Field | Type | Notes |
|---|---|---|
| `providerId` | string | **Now the record key.** At most one record per provider (FR-004). Also the AES-GCM additional data, as today. |
| `storageMode` | `persistent` \| `session` | Per provider. |
| `maskedHint` | string | `sk-ant-…a1b2`, `AIza…a1b2`, `AQ.…a1b2`, or `…a1b2` for an unknown shape. |
| `validatedAt` | ISO date | Per provider. |
| `iv`, `ciphertext`, `wrappingKey` | | Persistent mode only; unchanged. |

IndexedDB: `DB_VERSION` 1 → 2. Upgrade: if the credential store holds the key `"current"`, rewrite
the record under its own `providerId` and delete `"current"`. A fresh database starts at version 2.

Session mode: an in-memory map `providerId → { handle, meta }`. Never written to disk.

State per provider (unchanged machine, now one per provider):
`absent → validating → stored`, `validating → rejected`, `stored → validating → stored` (replace),
`stored → absent` (delete). Acting on one provider never changes another provider's state.

## KeyShape (new, core data)

| providerId | Patterns | Mask prefix |
|---|---|---|
| `anthropic` | `sk-ant-[A-Za-z0-9_-]{8,}` | `sk-ant-` |
| `gemini` | `AIza[A-Za-z0-9_-]{35}`, `AQ\.[A-Za-z0-9_-]{30,}` | `AIza` / `AQ.` |

Used by: the input guard (detect any known key in chat), `KeyManager` (mask; reject a key whose
shape belongs to another provider as `wrong_provider` before any network call).

## EnterKeyOutcome (changed)

`{ ok: true; maskedHint } | { ok: false; code: ProviderErrorCode | "wrong_provider"; expectedProviderId?: string }`

`expectedProviderId` is set only for `wrong_provider`, and holds the provider the shape belongs to,
so the UI can name it.

## UsageRecord (changed)

| Field | Change |
|---|---|
| `providerId` | **new**, optional string. Written on every new record (FR-019). Old records have none. |

The meaning of the token fields is unchanged; the Gemini adapter maps its usage into them
(research R4).

## Gemini model entry

A `ModelInfo` row (existing type). Values in research R8. `pricing.asOf` = `2026-10-14`.
