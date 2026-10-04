# Contract: OllamaProvider

Implements `ProviderPort` from `packages/core/src/ports/provider.ts` without changing it. The
shared contract in `specs/001-core-foundation/contracts/provider-port.md` applies in full; this file
lists only what is specific to the Ollama adapter.

## Identity

- `id = "ollama"`.
- `listModels()` returns the static table in data-model.md. No network call.

## `validateCredential(secret, signal?)`

- Ignores `secret`. Never reads it, never sends it.
- `GET {baseUrl}/v1/models`:
  - 2xx → `{ ok: true }`; if `defaultModelId` is absent from the list, also emits
    `diagnose({ kind: "model_not_installed", ... })`.
  - `fetch` throws → `{ ok: false, code: "network" }` + `diagnose({ kind: "unreachable" })`.
  - other status → mapped per research R4.
- Aborted signal → `{ ok: false, code: "network" }` without a request.

## `stream(req, secret, signal)`

Request: `POST {baseUrl}/v1/chat/completions`, `Content-Type: application/json`, **no
`Authorization` header**, body:

```json
{
  "model": "<req.modelId>",
  "messages": [
    { "role": "system", "content": "<layers joined by \\n\\n in precedence order>" },
    { "role": "user" | "assistant", "content": "..." }
  ],
  "max_tokens": <req.maxTokens>,
  "stream": true,
  "stream_options": { "include_usage": true }
}
```

Never sent: `effort`/`reasoning_effort`, `tools`, sampling parameters, any credential.

Event guarantees (same as every adapter):

1. Zero or more `text` events, in order.
2. Then, on a clean finish: at most one `usage` event (exact runtime values; omitted if the runtime
   reports none), then exactly one `stop`.
3. On failure: exactly one `error` event and nothing after it. On abort: exactly one
   `stop { reason: "aborted" }`.
4. Exactly one request per `stream()` call. No retries.
5. No event, error, or diagnostic contains request content, response text, or a secret.

`finish_reason` mapping: `stop` → `end`, `length` → `max_tokens`, other → `end`; stream ends
without one → `error { code: "network" }`.

## Diagnostics

`diagnose` receives `OllamaDiagnostic` values (data-model.md) for every failure path in research R4.
It is called at most once per request, before the `error` event is yielded.

## Boundaries (enforced by dependency-cruiser)

- Imports only types and pure helpers from `@tarjuman/core`; never `@tarjuman/core/adapter`.
- Imported concretely only by `apps/web/src/composition-root.ts` (inside the dev-only branch) and
  by `tests/`.
