import errors from "../fixtures/errors.json";
import modelGet from "../fixtures/model-get.json";

/**
 * A stand-in for `fetch` that speaks Gemini's REST wire format, so the adapter runs end to end with
 * no network. Every body here is synthetic (see `tests/fixtures/README.md`).
 */

export type Reply =
  /** `chunks` are the JSON objects after each `data:`. Gemini sends no `[DONE]`. */
  | { kind: "sse"; chunks: unknown[]; chunkDelayMs?: number; errorAfterChunks?: boolean }
  /** Raw SSE text, for malformed or unusual framing. */
  | { kind: "sse-raw"; text: string }
  | { kind: "json"; status: number; body: unknown; contentType?: string }
  | { kind: "reject"; error: Error };

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** The parsed JSON body, or `undefined` when there was none. */
  body: Record<string, unknown> | undefined;
  /** The body exactly as sent, to prove what it does not contain. */
  rawBody: string;
  /** `init.redirect`, or `undefined` when the call left it to the default (`"follow"`). */
  redirect: RequestRedirect | undefined;
}

export type ErrorCase = keyof typeof errors;

export class FakeGemini {
  readonly calls: RecordedCall[] = [];
  readonly #queue: Reply[] = [];

  enqueue(reply: Reply): this {
    this.#queue.push(reply);
    return this;
  }

  /** Pass as the adapter's `fetch` option. */
  readonly fetch = async (input: unknown, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, key) => (headers[key] = value));
    const rawBody = typeof init?.body === "string" ? init.body : "";
    const body = rawBody === "" ? undefined : (JSON.parse(rawBody) as Record<string, unknown>);
    this.calls.push({ url: String(input), method: init?.method ?? "GET", headers, body, rawBody, redirect: init?.redirect });

    const reply = this.#queue.shift();
    if (!reply) throw new Error("FakeGemini: no reply queued for this call");
    if (reply.kind === "reject") throw reply.error;
    if (reply.kind === "json") {
      return new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { "content-type": reply.contentType ?? "application/json" },
      });
    }
    if (reply.kind === "sse-raw") return new Response(reply.text, { status: 200, headers: { "content-type": "text/event-stream" } });
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
      const next = reply.chunks[i];
      if (next === undefined) {
        if (reply.errorAfterChunks) controller.error(new TypeError("network connection lost"));
        else controller.close();
        return;
      }
      i += 1;
      if (reply.chunkDelayMs) await new Promise((resolve) => setTimeout(resolve, reply.chunkDelayMs));
      if (signal?.aborted) {
        controller.error(new DOMException("aborted", "AbortError"));
        return;
      }
      // Gemini separates events with CRLF pairs on the wire; the parser must accept both.
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(next)}\r\n\r\n`));
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** The SSE text of a list of chunks, for tests that split it at arbitrary bytes. */
export function sseText(chunks: unknown[]): string {
  return chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\r\n\r\n`).join("");
}

/** An answer in the shape of `fixtures/stream-answer.json`, with chosen text and token counts. */
export function answerChunks(texts: string[], inputTokens: number, outputTokens: number): unknown[] {
  const usage = { promptTokenCount: inputTokens, candidatesTokenCount: outputTokens, totalTokenCount: inputTokens + outputTokens };
  return texts.map((text, index) => ({
    candidates: [
      {
        content: { parts: [{ text }], role: "model" },
        index: 0,
        ...(index === texts.length - 1 && { finishReason: "STOP" }),
      },
    ],
    usageMetadata: usage,
    modelVersion: "gemini-3.5-flash-lite",
  }));
}

/** Only the text of an answer, with no finish reason, for streams that must end early. */
export function textOnlyChunks(texts: string[]): unknown[] {
  return texts.map((text) => ({ candidates: [{ content: { parts: [{ text }], role: "model" }, index: 0 }] }));
}

export function errorReply(name: ErrorCase): Reply {
  const { status, body } = errors[name];
  return { kind: "json", status, body };
}

export function modelReply(): Reply {
  return { kind: "json", status: 200, body: modelGet };
}
