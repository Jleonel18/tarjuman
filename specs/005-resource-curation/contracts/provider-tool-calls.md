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
  with `availability: "all_conversations"`, only if the model `supportsTools` and search is enabled
  and consented (FR-018). Otherwise no tools, and the capability fragment tells the model that
  search is unavailable and why (FR-009 fallback).
- Loop per turn (max 4 model steps): stream a step; collect `tool_call`s; for each, in order:
  1. `OutputGuard.checkToolCall` (authorize, taint). Denied → tool result `{ ok:false, error }`.
  2. Per-turn limits: `search_videos` ≤ 2, `show_resources` ≤ 1. Over → error result.
  3. Presentation tools (`show_resources`) are validated and kept, not executed.
  4. Other tools run via the broker; results become `tool` messages, wrapped in an
     `untrusted_data` block; every segment from them is `untrusted`.
- Only the final step's text is parsed for the verdict and rendered. While tools run the pipeline
  emits `{ type: "status"; code: "searching" }`.
- `TurnEvent` gains `{ type: "resources"; cards: ResourceCard[] }`, emitted once, after the final
  step, only if the verdict is `accept`. Cards are built from search data (data-model.md).
- In a turn with search results, links in the prose are rendered clickable only if their URL equals
  a card link; others become plain text showing the destination (FR-013).
- Usage: tokens summed over steps; `steps` and `searches` recorded (FR-017).
- Unchanged: no retries, one `done` or `error` per turn, cancel stops everything, `stop: refusal`
  → `refused`.
