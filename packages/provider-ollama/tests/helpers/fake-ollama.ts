import modelsList from "../fixtures/models-list.json";
import streamAnswer from "../fixtures/stream-answer.json";

/**
 * A stand-in for `fetch` that speaks the OpenAI-compatible wire format Ollama exposes, so the
 * adapter runs end to end with no network. Every body here is synthetic (see
 * `tests/fixtures/README.md`).
 */

export type Reply =
  /** `chunks` are the JSON objects after each `data:`; `[DONE]` follows unless `omitDone`. */
  | { kind: "sse"; chunks: unknown[]; chunkDelayMs?: number; errorAfterChunks?: boolean; omitDone?: boolean }
  /** Raw SSE text, for malformed or unusual framing. */
  | { kind: "sse-raw"; text: string }
  | { kind: "json"; status: number; body: unknown }
  | { kind: "reject"; error: Error };

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export class FakeOllama {
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
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    this.calls.push({ url: String(input), method: init?.method ?? "GET", headers, body });

    const reply = this.#queue.shift();
    if (!reply) throw new Error("FakeOllama: no reply queued for this call");
    if (reply.kind === "reject") throw reply.error;
    if (reply.kind === "json") {
      return new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { "content-type": "application/json" },
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
        else {
          if (!reply.omitDone) controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
        return;
      }
      i += 1;
      if (reply.chunkDelayMs) await new Promise((resolve) => setTimeout(resolve, reply.chunkDelayMs));
      if (signal?.aborted) {
        controller.error(new DOMException("aborted", "AbortError"));
        return;
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(next)}\n\n`));
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** An answer in the shape of `fixtures/stream-answer.json`, with chosen text and token counts. */
export function answerChunks(texts: string[], inputTokens: number, outputTokens: number): unknown[] {
  const [template] = streamAnswer;
  const chunk = (delta: unknown, finish: string | null) => ({
    ...template,
    choices: [{ index: 0, delta, finish_reason: finish }],
  });
  return [
    ...texts.map((content) => chunk({ role: "assistant", content }, null)),
    chunk({ role: "assistant", content: "" }, "stop"),
    { ...template, choices: [], usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens } },
  ];
}

/** Only the text chunks of an answer, for streams that must end early. */
export function textOnlyChunks(texts: string[]): unknown[] {
  return answerChunks(texts, 1, 1).slice(0, texts.length);
}

export function modelsReply(ids?: string[]): Reply {
  if (!ids) return { kind: "json", status: 200, body: modelsList };
  return { kind: "json", status: 200, body: { object: "list", data: ids.map((id) => ({ id, object: "model" })) } };
}
