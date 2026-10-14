# Gemini wire-format fixtures

**Provenance: synthetic, shaped after a live capture on 2026-10-14** (004 research R3, R6): the
owner's key, `gemini-3.5-flash-lite` for the stream and `gemini-3.8-flash` for the model `GET`, with
only statuses and response shapes printed. No body here is a recorded response; texts, ids, token
counts, and the thought signature are made up. Each `stream-*.json` file is the list of JSON objects
that follow each `data:` line (Gemini sends no `[DONE]`); the test helper adds the framing.

- `stream-answer.json`: three chunks with cumulative `usageMetadata` (thoughts and implicit cache
  included); the last carries `finishReason: "STOP"` and a `thoughtSignature`, as live.
- `stream-thought-part.json`: a part marked `thought: true`, which must never be shown.
- `stream-safety-after-text.json`: text, then `finishReason: "SAFETY"`.
- `stream-prompt-blocked.json`: `promptFeedback.blockReason` and no candidate.
- `stream-max-tokens.json`, `stream-truncated.json` (no finish reason), `stream-error-midway.json`.
- `stream-tool-call.json`, `stream-two-tool-calls.json`, `stream-tool-call-bad-args.json` (005):
  `functionCall` parts with `id`, `name`, `args`, and a `thoughtSignature` on the part, **shaped after
  the live capture of 2026-10-14** (005 research R8). The ids, args, and signatures are made up. In
  a parallel call only the first part carries a signature.
- `errors.json`: error bodies by case. The 400 `API_KEY_INVALID`, 401
  `ACCESS_TOKEN_TYPE_UNSUPPORTED`, 403 `PERMISSION_DENIED`, and 503 `UNAVAILABLE` shapes were seen
  live; the others follow Google's documented `google.rpc.Status` form.
- `model-get.json`: the fields of `GET /v1beta/models/{id}` the adapter may read.

No key, conversation, or personal data belongs here.
