/** Thrown for a `data:` line that is not valid JSON. It never carries the line: it may hold user text. */
export class SseParseError extends Error {
  constructor() {
    super("Malformed SSE data line.");
    this.name = "SseParseError";
  }
}

/**
 * Reads a Server-Sent Events body and yields the parsed JSON of each `data:` line. Blank lines,
 * `:` comments, and other fields (`event`, `id`, `retry`) are ignored. `data: [DONE]` ends the
 * stream. Lines are buffered, so a line may be split across chunks at any byte.
 */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r\n|\n|\r/);
      // The last piece is an unfinished line, unless the stream is over.
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        const payload = dataPayload(line);
        if (payload === undefined) continue;
        if (payload === "[DONE]") return;
        yield parse(payload);
      }
      if (done) return;
    }
  } finally {
    // Stops the download when the consumer leaves early (abort, [DONE], or an error).
    await reader.cancel().catch(() => undefined);
  }
}

function dataPayload(line: string): string | undefined {
  if (!line.startsWith("data:")) return undefined;
  const rest = line.slice("data:".length);
  return (rest.startsWith(" ") ? rest.slice(1) : rest).trim();
}

function parse(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    throw new SseParseError();
  }
}
