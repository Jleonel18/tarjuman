# Ollama wire-format fixtures

**Provenance: synthetic (from documentation, 2026-10-04).** Written by hand from the Ollama
OpenAI-compatibility page and the OpenAI streaming format. None of these is a live capture. Task
T020 replaces them with real captures from a local Ollama run and changes this note to
"captured from Ollama <version>, <date>, model <id>".

Each stream file is the list of JSON objects that would follow `data:` lines; the test helper adds
the `data:` framing and the closing `data: [DONE]`.

- `stream-answer.json`: a short answer, a final chunk with `finish_reason: "stop"`, then a usage
  chunk with an empty `choices` array.
- `stream-length.json`: the same shape, stopped by `finish_reason: "length"`.
- `stream-truncated.json`: text chunks and then the stream ends with no `finish_reason`.
- `models-list.json`: the body of `GET /v1/models` with both table models installed.

No real conversation or personal data belongs here.
