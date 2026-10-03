# Anthropic wire-format fixtures

**Provenance: synthetic (from documentation).** Written by hand from the streaming and errors pages
of the Anthropic docs, read on 2026-10-02. None of these is a live capture: the owner has no key
(see `specs/001-core-foundation/research.md` → *Spike Results* → *Still unverified*). Replace them
with real captures when one exists, and change this note when you do.

- `errors.json`: HTTP status and JSON body per error kind (research R5 table).
- `stream-answer.json`: the SSE events of a short answer, including cache fields and a
  `message_delta` that repeats `input_tokens`, to exercise the usage rule from research R4.
- `stream-overloaded-midway.json`: an SSE `error` event arriving after a `200`.

No real key, conversation, or personal data belongs here.
