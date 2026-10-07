# Ollama wire-format fixtures

**Provenance: captured from Ollama 0.32.1, 2026-10-07, model gemma3:4b.** Raw `data:` lines of real
responses from a local runtime, parsed to JSON (the `data:` framing and the closing `[DONE]` are
added back by the test helper). They replace the synthetic fixtures written on 2026-10-04.

- `stream-answer.json`: the real answer to "Say hola." (`maxTokens: 32`): text chunks, a chunk with
  `finish_reason: "stop"` and empty content, then a usage chunk with an empty `choices` array.
- `stream-length.json`: a real answer cut by `max_tokens: 8`, ending with `finish_reason: "length"`.
- `stream-truncated.json`: **derived, not a capture.** The first five chunks of the real answer,
  cut before `finish_reason` and usage, to model a connection that ends early.
- `models-list.json`: the real body of `GET /v1/models` on the author's machine.

No key, conversation, or personal data belongs here. Re-capture when the Ollama wire format changes
and update this note with the new version and date.
