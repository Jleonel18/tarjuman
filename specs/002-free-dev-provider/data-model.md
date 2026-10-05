# Data Model: Free Dev Provider

This feature adds no persisted entities and does not change any type in `packages/core`. Everything
below is either configuration or metadata attached to test artifacts.

## OllamaProviderOptions (adapter configuration)

| Field | Type | Default | Rule |
|---|---|---|---|
| `baseUrl` | string (absolute http(s) URL) | `http://localhost:11434` | Validated at construction; trailing slashes are trimmed; a non-http(s) or unparsable value → throws a configuration error (no network call). |
| `fetch` | `typeof fetch` | global `fetch` | Tests inject a stub; never retried. |
| `diagnose` | `(d: OllamaDiagnostic) => void` | no-op | Receives non-secret diagnostics only (R4). |
| `defaultModelId` | string | `gemma3:4b` | Used by `validateCredential` to check installation. |

Sources: app → `VITE_OLLAMA_BASE_URL` (dev builds only); tools → `OLLAMA_BASE_URL`, `OLLAMA_MODEL`.

## OllamaDiagnostic

```ts
type OllamaDiagnostic = {
  kind: "unreachable" | "model_not_installed" | "rejected" | "busy" | "failed";
  baseUrl: string;
  modelId?: string;
  httpStatus?: number;
};
```

- Contains no request body, headers, or response text; it can never carry a secret or user content.
- `kind` maps 1:1 to a troubleshooting entry in the setup guide.

## Local model entry (`ModelInfo`, existing type)

| id | displayName | contextWindow | maxOutput | supportsEffort | pricing |
|---|---|---|---|---|---|
| `gemma3:4b` (default) | Gemma 3 4B (local, not Claude) | 32 768 | 8 192 | false | 0 / 0, asOf 2026-10-04 |
| `gemma3:1b` | Gemma 3 1B (local, not Claude) | 32 768 | 8 192 | false | 0 / 0, asOf 2026-10-04 |

`contextWindow` assumes `OLLAMA_CONTEXT_LENGTH=32768` (research R5). Display names are model names,
not translatable UI strings, consistent with the Anthropic table.

## FixtureProvenance

Attached to every recorded guardrail fixture set and every live-run report.

| Field | Type | Rule |
|---|---|---|
| `providerId` | `"ollama" \| "anthropic" \| "synthetic"` | Required. |
| `modelId` | string | Required. |
| `runtimeVersion` | string \| null | Ollama version from `GET /api/version`; `null` for Anthropic. |
| `recordedAt` | ISO 8601 date | Required. |
| `isClaude` | boolean | `true` only when `providerId === "anthropic"`. |
| `label` | string | Fixed text: for non-Claude, `"Recorded with a non-Claude model (<modelId>). Proves pipeline mechanics only; not evidence for 001 SC-003."` |

Validation (Zod at load time in the fixture loader):
- `isClaude` must equal `providerId === "anthropic"`; a mismatch is a load error.
- A fixture set without provenance fails to load (no silent default).
- Any SC-003 assertion (T070, T080) checks `isClaude`; when false, it reports the rates as
  informational and states that SC-003 remains unverified.

Location: `packages/testing/fixtures/guardrails/provenance.json` (one per fixture set), alongside the
`.recorded-hash` defined by 001 T079/T081.

## LiveProviderSelection (tools only)

Returned by `tests/support/live-provider.ts`:

| Field | Type |
|---|---|
| `provider` | `ProviderPort` |
| `secret` | `SecretHandle` (placeholder for Ollama; sealed `TARJUMAN_TEST_KEY` for Anthropic) |
| `modelId` | string |
| `provenance` | `FixtureProvenanceDraft` = `FixtureProvenance` without `recordedAt` (filled at write time) |

Selection: `TARJUMAN_PROVIDER` = `ollama` (default) | `anthropic`. `anthropic` without
`TARJUMAN_TEST_KEY` → exits with a message that names the variable and never prints its value.
