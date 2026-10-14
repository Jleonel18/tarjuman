# Contract: GeminiProvider

Package `@tarjuman/provider-gemini`. Implements the unchanged `ProviderPort`
(`packages/core/src/ports/provider.ts`). Facts behind each rule: [research.md](../research.md).

## Exports

- `GeminiProvider` (`id = "gemini"`)
- `GEMINI_MODELS: readonly ModelInfo[]`, `DEFAULT_GEMINI_MODEL_ID = "gemini-3.8-flash"`
- `GEMINI_API_ORIGIN = "https://generativelanguage.googleapis.com"`
- `GeminiProviderOptions { fetch?: typeof fetch }` (tests only)

## Invariants

1. Every request goes to `GEMINI_API_ORIGIN` and nowhere else.
2. The key is unsealed only inside the adapter, only to set the `x-goog-api-key` header. It is never
   put in a URL, a body, a log, an error, or an event.
3. One request per call. No retry, ever (including on 429/503).
4. Never sends `safetySettings`, `tools`, `toolConfig`, sampling parameters, `cachedContent`,
   `includeThoughts`, or `thinkingBudget`.
5. Streamed text passes through `SecretStreamFilter` with the key before it is yielded.
6. Parts marked `thought: true` are never yielded.
7. Only the HTTP status, `error.status`, and `error.details[].reason` / `retryDelay` of an error body
   are read. Error message text is never read.
8. Adds no prompt text of its own (no capability, tone, or guardrail behavior).

## `listModels()`

Returns a copy of `GEMINI_MODELS` (research R8).

## `validateCredential(secret, signal?)`

`GET {origin}/v1beta/models/{DEFAULT_GEMINI_MODEL_ID}`. `200` → `{ ok: true }`; otherwise
`{ ok: false, code }` per the error table in research R6. Already aborted → `{ ok: false, code:
"network" }` without a request.

## `stream(req, secret, signal)`

Request: `POST {origin}/v1beta/models/{req.modelId}:streamGenerateContent?alt=sse`, body:

```text
systemInstruction.parts = req.layers.map(text)          (omitted when no layers)
contents = req.messages.map(role user|model, one text part)
generationConfig.maxOutputTokens = req.maxTokens
generationConfig.thinkingConfig.thinkingLevel = req.effort   (only when the model supports it)
```

Events, in order:

| Situation | Events |
|---|---|
| Aborted before start | `stop: aborted` |
| Normal | `text`*, then `usage` (if reported), then `stop` (research R5) |
| Safety block / blocked prompt | `text`* (any already received), `usage` (if reported), `stop: refusal` |
| HTTP error before streaming | `error` with code from research R6 (and `retryAfterSeconds` for 429 when given) |
| `error` object inside the stream | `text`* so far, then `error` |
| Stream ends with no finish reason | `text`*, then `error: network` |
| Aborted mid-stream | `text`* so far, then `stop: aborted` |
| Malformed `data:` line | `error: unknown` |

Usage mapping (research R4): `inputTokens = prompt − cached`, `cacheReadTokens = cached`,
`outputTokens = candidates + thoughts`, `cacheWriteTokens = 0`; latest chunk wins.

## Tests (written first)

- Shared `provider-contract-suite` from `@tarjuman/testing` with stubbed `fetch`.
- Request shape: URL, header present, no `key=` in any URL, body fields, effort only when supported,
  forbidden fields absent.
- SSE parsing with synthetic fixtures based on the live shapes in research R3 (labelled
  synthetic-from-live-shape) and chunk splits at every byte boundary of one line.
- Error table: each row of research R6, and a check that no event, error, or thrown message
  contains the key or the server's message text.
- Finish-reason table: each row of research R5.
- Opt-in live test (`TARJUMAN_LIVE=1`, `GEMINI_API_KEY`), skipped without a key.
