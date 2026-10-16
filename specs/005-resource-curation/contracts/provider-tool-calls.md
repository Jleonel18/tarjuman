# Contract: Tool Calls through the Provider Port and the Pipeline

Amends `specs/001-core-foundation/contracts/provider-port.md` and `pipeline.md`. Rationale:
[research.md](../research.md) R8, R10, R11. Needs owner approval (plan.md, Spec Amendments).

## ProviderPort (amended)

```ts
type StreamEvent =
  | …existing…
  | { type: "tool_call"; id: string; name: string; input: JsonValue; continuation?: string };

interface ToolCallRecord { id: string; name: string; input: JsonValue; continuation?: string }

type ProviderMessage =
  | { role: "user" | "assistant"; content: string }
  | { role: "assistant"; content: string; toolCalls: ToolCallRecord[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

interface ModelRequest { …; tools?: ModelTool[] }   // now filled when the turn offers tools
```

Rules for every adapter:

- Emit one `tool_call` per complete call, after its input is fully received and parsed as JSON.
  Unparseable input → `error: bad_request`.
- `continuation` is opaque: the adapter alone writes and reads it (Gemini: `thoughtSignature`). The
  pipeline passes it back unchanged in the same turn and never stores, renders, or logs it.
- Map `ModelTool` to the provider's shape: Anthropic `tools[{name, description, input_schema}]`;
  Gemini `tools[{functionDeclarations[{name, description, parameters}]}]` (schema subset: object,
  string, boolean, enum, array; no `additionalProperties`, which the core strips for Gemini only).
- Map `tool` messages: Anthropic user `tool_result` block; Gemini `functionResponse` part with the
  call's `id` and `{ content }` as `response`.
- Stop reason `tool_use` when the step ended to wait for tool results (Gemini: a step with
  `functionCall` parts and `STOP`).
- An adapter that does not support tools (Ollama in this feature) declares
  `supportsTools: false` in `listModels()` per model; the pipeline then offers no tools.
- Type-level proof: `ModelRequest` (including the new message shapes) still cannot carry a
  `SecretHandle`.

`ModelInfo` gains `supportsTools: boolean`.

## Pipeline (amended)

- Tools offered in a turn = tools of the conversation's capability + every registered capability
  with `availability: "all_conversations"`, only if the model `supportsTools`, search is enabled,
  and a key for the source is stored. Consent is **not** a condition for offering tools (see
  below). Otherwise no tools, and the capability fragment tells the model that search is
  unavailable and why: `off`, `no_key`, `model_cannot_search` (FR-009 fallback).
- Loop per turn (max 4 model steps): stream a step; collect `tool_call`s; for each, in order:
  1. `OutputGuard.checkToolCall` (authorize, taint). Denied → tool result `{ ok:false, error }`.
  2. Per-turn limits: `search_videos` ≤ 2, `show_resources` ≤ 1. Over → error result.
  3. Presentation tools (`show_resources`) are validated and kept, not executed.
  4. Other tools run via the broker; results become `tool` messages, wrapped in an
     `untrusted_data` block; every segment from them is `untrusted`.
  5. Consent: a `search_videos` call for a source without consent makes no request and ends the
     turn with `{ type: "done"; status: "consent_required"; sourceId }`; no model text is shown. The
     app shows the consent dialog; on Agree it sends the same user message as a new turn (the
     learner's action, not a retry); on Cancel nothing is sent.
  6. Partial failure: if a later search fails after an earlier one succeeded, the failed call gets an
     error result, the loop continues, and the turn ends with notice `search_incomplete`.
- Searches in a turn go through a per-turn `TurnSearchSession` (created by the pipeline and handed
  to the broker services): it assigns turn-wide refs `r1…r16` in order, drops results whose
  `externalId` was already returned in the turn, and is the set `show_resources` ids are checked
  against.
- History: later turns get, per earlier assistant message with non-expired cards, one
  `untrusted_data` block with `ref`, title, channel, type (data-model.md → Resource context). Tool
  messages of earlier turns are never replayed.
- Only the final step's text is rendered, and its own verdict line decides. If it opens without
  one, the well-formed verdict line of the most recent tool step is used instead (a carried
  `REFUSE` still shows nothing); with neither, the turn fails closed as before (research R15,
  amended 2026-10-15). While tools run the pipeline emits `{ type: "status"; code: "searching" }`.
- When tools are on offer, the domain-scope layer adds one line: the verdict opens the text written
  after the last tool result.
- `TurnEvent` gains `{ type: "resources"; cards: ResourceCard[] }`, emitted once, after the final
  step, only if the verdict is `accept`. Cards are built from search data (data-model.md).
- In a turn with search results, links in the prose are rendered clickable only if their URL equals
  a card link; others become plain text showing the destination (FR-013).
- Usage: tokens summed over steps; `steps` and `searches` recorded (FR-017).
- Unchanged: no retries, one `done` or `error` per turn, cancel stops everything, `stop: refusal`
  → `refused`.
