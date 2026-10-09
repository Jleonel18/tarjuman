# Mock provider fixtures

Fixtures script what the mock provider streams back, so tests and the e2e suite run without a real
model, without a key, and at zero cost. The mock is `src/mock-provider.ts`.

A fixture is JSON with an ordered `steps` array. Steps are replayed one per streamed event:

```json
{
  "steps": [
    { "type": "text", "delta": "Hola! " },
    { "type": "delay", "ms": 50 },
    { "type": "text", "delta": "Ser describes identity." },
    { "type": "usage", "inputTokens": 120, "outputTokens": 24 },
    { "type": "stop", "reason": "end" }
  ]
}
```

| `type` | Fields | Effect |
|--------|--------|--------|
| `text` | `delta` | Streams a text chunk |
| `usage` | `inputTokens`, `outputTokens`, optional `cacheReadTokens`, `cacheWriteTokens` | Emits provider-reported usage exactly as written |
| `stop` | `reason`: `end`, `max_tokens`, `tool_use`, `refusal`, `aborted` | Ends the stream |
| `error` | `code` (a `ProviderErrorCode`), optional `retryAfterSeconds` | Emits an error event and ends the stream |
| `delay` | `ms` | Pauses; lets tests abort mid-stream or measure first-token latency |

Rules:

- A fixture should end with either `stop` or `error`. The mock never invents a terminal event
  except `stop: aborted` when the caller aborts.
- Load with `parseFixture(json)`, which throws on a malformed fixture.
- **Provenance.** Fixtures describing a *real* provider's wire behavior must say how they were
  made. Until a live capture exists they are **synthetic (from documentation)**; see
  `research.md` → *Spike Results* for what is verified and what is not.
- Never put a real API key, a real conversation, or personal data in a fixture.

Mock key handling: `validateCredential` accepts only the keys given to the `MockProvider`
(default `sk-ant-mock-valid-key-0000`); any other key is `invalid_credential`. The key is fake and
safe to commit.

Files here:

- `stream-happy.json`: a normal answer with usage. It starts with an `ACCEPT` verdict line, because the pipeline reads the first line of every answer (a missing verdict is refused).
- `stream-network-drop.json`: text, then a `network` error mid-stream.
- `stream-refusal.json`: a provider safety refusal.
