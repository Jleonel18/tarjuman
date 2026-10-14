# Contract: Multiple Providers in the Core

Changes to existing core contracts (`specs/001-core-foundation/contracts/pipeline.md`,
`storage-port.md`). `ProviderPort` is **not** changed. Rationale: [research.md](../research.md)
R5, R9, R10, R12.

## Pipeline

- `PipelineDeps.provider: ProviderPort` → `PipelineDeps.providers: readonly ProviderPort[]`.
  The constructor rejects an empty list and duplicate ids, and freezes a copy.
- Per turn: `provider = providers.find(p => p.id === profile.providerId)`. Not found →
  `error: bad_request`, no model call. `secret = credentials.load(profile.providerId)`. Missing →
  `error: invalid_credential`. The model is looked up in that provider's table only.
- Never falls back to another provider, never sends one provider's key to another.
- **`stop: refusal`** (provider-neutral): text already shown is kept, the refusal template is
  appended, the message is stored with status `refused`. A turn where the model had answered
  `ACCEPT` and the provider then cut it off is therefore never stored as `complete`.
- The usage record gets `providerId` = the provider that served the turn.
- Unchanged: stage order, freezing, no retries, one `done` or `error` per turn.

## CredentialValidator

`validate(providerId, secret, signal?)`. `ProviderCredentialValidator` holds the same provider set
and calls only the provider with that id; an unknown id → `{ ok: false, code: "bad_request" }`.

## CredentialStore

| Method | Behavior |
|---|---|
| `save(secret, mode, meta)` | Stores under `meta.providerId`. Replaces only that provider's key (either mode). |
| `load(providerId)` | That provider's key, or `undefined`. |
| `describe(providerId)` | That provider's description, never the secret. |
| `list()` | Descriptions of every stored key. |
| `remove(providerId)` | Removes that provider's key in both modes. Others untouched. |
| `removeAll()` | Removes every key in both modes. |

## KeyManager

- `enter(providerId, key, mode)`, `replace(providerId, key, mode)`, `remove(providerId)`.
- Before validating: if the key's shape matches a different known provider (KeyShape table in
  [data-model.md](../data-model.md)), return `{ ok: false, code: "wrong_provider",
  expectedProviderId }` and make **no** network call.
- A failed replacement keeps that provider's old key (unchanged rule, now per provider).

## DataController.deleteAll

Calls `removeAll()`, then fails its check if `list()` is non-empty or `load(id)` returns a key for
any provider id the app offers.

## Input guard

Detects every pattern in the KeyShape table, wherever it appears in a token, after the existing
normalization (zero-width removal, wrapping punctuation).
