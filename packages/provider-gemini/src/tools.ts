import type { JsonValue, ModelTool, ProviderMessage } from "@tarjuman/core";

/**
 * Tool-call mapping for Gemini (contracts/provider-tool-calls.md, 005 research R8).
 *
 * `continuation` is Gemini's `thoughtSignature`: it rides on the part that holds a `functionCall`
 * and must be sent back unchanged, or the next step fails with `400 … missing a thought_signature`.
 */

type Part = Record<string, unknown>;
export interface Content {
  role: "user" | "model";
  parts: Part[];
}

/** Gemini's schema subset has no `additionalProperties`, so it is dropped at every depth. */
function stripUnsupported(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(stripUnsupported);
  if (typeof value !== "object" || value === null) return value;
  const out: { [key: string]: JsonValue } = {};
  for (const [key, inner] of Object.entries(value)) {
    if (key !== "additionalProperties") out[key] = stripUnsupported(inner);
  }
  return out;
}

export function toToolDeclarations(tools: ModelTool[] | undefined) {
  if (!tools || tools.length === 0) return undefined;
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: stripUnsupported(tool.inputSchema),
      })),
    },
  ];
}

/** Consecutive `tool` messages (one per call of a step) become one user turn, as Gemini expects. */
export function toContents(messages: ProviderMessage[]): Content[] {
  const contents: Content[] = [];
  for (const message of messages) {
    if (message.role === "tool") {
      const part: Part = {
        functionResponse: { id: message.toolCallId, name: message.name, response: { content: message.content } },
      };
      const last = contents.at(-1);
      if (last && last.role === "user" && last.parts.every((p) => "functionResponse" in p)) last.parts.push(part);
      else contents.push({ role: "user", parts: [part] });
    } else if ("toolCalls" in message) {
      const parts: Part[] = message.content === "" ? [] : [{ text: message.content }];
      for (const call of message.toolCalls) {
        parts.push({
          functionCall: { id: call.id, name: call.name, args: call.input },
          ...(call.continuation !== undefined && { thoughtSignature: call.continuation }),
        });
      }
      contents.push({ role: "model", parts });
    } else {
      contents.push({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] });
    }
  }
  return contents;
}

export interface ReadCall {
  id: string;
  name: string;
  input: JsonValue;
  continuation?: string;
}

/**
 * Reads one `functionCall` part. `undefined` means the call is unusable (no name, or `args` that
 * is not an object), which the adapter reports as `bad_request`.
 */
export function readFunctionCall(part: Part, position: number): ReadCall | undefined {
  const call = part["functionCall"];
  if (typeof call !== "object" || call === null || Array.isArray(call)) return undefined;
  const fields = call as Record<string, unknown>;
  const name = fields["name"];
  if (typeof name !== "string" || name === "") return undefined;
  const args = fields["args"] ?? {};
  if (typeof args !== "object" || args === null || Array.isArray(args)) return undefined;
  const id = typeof fields["id"] === "string" && fields["id"] !== "" ? fields["id"] : `call_${position}`;
  const signature = part["thoughtSignature"];
  return {
    id,
    name,
    input: args as JsonValue,
    ...(typeof signature === "string" && signature !== "" && { continuation: signature }),
  };
}
