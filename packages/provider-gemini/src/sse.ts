/** Thrown for a `data:` line that is not valid JSON. It never carries the line: it may hold user text. */
export class SseParseError extends Error {
  constructor() {
    super("Malformed SSE data line.");
    this.name = "SseParseError";
  }
}

/**
 * Reads Gemini's `alt=sse` body and yields the parsed JSON of each `data:` line (004 research R3).
 * Blank lines, `:` comments, and other fields are ignored. Gemini sends no `[DONE]`: the stream
 * simply ends. Lines are buffered, so a line may be split across chunks at any byte, and CRLF, LF,
 * and CR line ends are all accepted.
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
      // The last piece is an unfinished line, unless the stream is over. A CRLF split between two
      // chunks only adds an empty line, which is ignored.
      buffer = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        const payload = dataPayload(line);
        if (payload !== undefined) yield parse(payload);
      }
      if (done) return;
    }
  } finally {
    // Stops the download when the consumer leaves early (abort or an error).
    await reader.cancel().catch(() => undefined);
  }
}

function dataPayload(line: string): string | undefined {
  if (!line.startsWith("data:")) return undefined;
  const rest = line.slice("data:".length);
  const payload = (rest.startsWith(" ") ? rest.slice(1) : rest).trim();
  return payload === "" ? undefined : payload;
}

function parse(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    throw new SseParseError();
  }
}
