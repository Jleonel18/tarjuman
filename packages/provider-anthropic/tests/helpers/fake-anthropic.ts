import type { ProviderErrorCode } from "@tarjuman/core";
import errors from "../fixtures/errors.json";

/**
 * A stand-in for `fetch` that speaks Anthropic's wire format, so the real SDK runs end to end
 * with no network. Every body here is synthetic (see `tests/fixtures/README.md`).
 */

export interface SseEvent {
  event: string;
  data: unknown;
}

export type Reply =
  | { kind: "sse"; events: SseEvent[]; chunkDelayMs?: number; errorAfterEvents?: boolean }
  | { kind: "json"; status: number; body: unknown; headers?: Record<string, string> }
  | { kind: "reject"; error: Error };

export interface RecordedCall {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export class FakeAnthropic {
  readonly calls: RecordedCall[] = [];
  readonly #queue: Reply[] = [];

  enqueue(reply: Reply): this {
    this.#queue.push(reply);
    return this;
  }

  /** Pass as the SDK's `fetch` option. */
  readonly fetch = async (input: unknown, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => (headers[key] = value));
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    this.calls.push({ url: String(input), headers, body });

    const reply = this.#queue.shift();
    if (!reply) throw new Error("FakeAnthropic: no reply queued for this call");
    if (reply.kind === "reject") throw reply.error;
    if (reply.kind === "json") {
      return new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { "content-type": "application/json", ...reply.headers },
      });
    }
    return sseResponse(reply, init?.signal ?? undefined);
  };
}

function sseResponse(reply: Extract<Reply, { kind: "sse" }>, signal: AbortSignal | undefined): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (signal?.aborted) {
        controller.error(new DOMException("aborted", "AbortError"));
        return;
      }
      const next = reply.events[i];
      if (!next) {
        if (reply.errorAfterEvents) controller.error(new TypeError("network connection lost"));
        else controller.close();
        return;
      }
      i += 1;
      if (reply.chunkDelayMs) await new Promise((resolve) => setTimeout(resolve, reply.chunkDelayMs));
      if (signal?.aborted) {
        controller.error(new DOMException("aborted", "AbortError"));
        return;
      }
      controller.enqueue(encoder.encode(`event: ${next.event}\ndata: ${JSON.stringify(next.data)}\n\n`));
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

export function answerEvents(chunks: string[], inputTokens: number, outputTokens: number): SseEvent[] {
  return [
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: "msg_synthetic",
          type: "message",
          role: "assistant",
          model: "synthetic",
          content: [],
          stop_reason: null,
          usage: { input_tokens: inputTokens, output_tokens: 1 },
        },
      },
    },
    { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
    ...chunks.map((text) => ({
      event: "content_block_delta",
      data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    })),
    { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
    {
      event: "message_delta",
      data: {
        type: "message_delta",
        delta: { stop_reason: "end_turn", stop_sequence: null },
        usage: { output_tokens: outputTokens },
      },
    },
    { event: "message_stop", data: { type: "message_stop" } },
  ];
}

/** A non-streaming `messages.create` reply, as used by credential validation. */
export function messageJson(text = "OK") {
  return {
    id: "msg_synthetic",
    type: "message",
    role: "assistant",
    model: "synthetic",
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 8, output_tokens: 1 },
  };
}

export type ErrorFixture = keyof typeof errors;

export function errorReply(kind: ErrorFixture): Reply {
  const fixture = errors[kind] as { status: number; body: unknown; headers?: Record<string, string> };
  return { kind: "json", ...fixture };
}

/** The fixture that should map to each provider error code. `network` is a transport failure. */
export function replyForCode(code: ProviderErrorCode): Reply {
  switch (code) {
    case "invalid_credential":
      return errorReply("authentication");
    case "permission_denied":
      return errorReply("permission");
    case "quota_exhausted":
      return errorReply("billing");
    case "rate_limited":
      return errorReply("rate_limit");
    case "overloaded":
      return errorReply("overloaded");
    case "bad_request":
      return errorReply("invalid_request");
    case "network":
      return { kind: "reject", error: new TypeError("fetch failed") };
    case "unknown":
      return errorReply("api_error");
  }
}
