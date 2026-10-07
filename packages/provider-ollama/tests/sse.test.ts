import { describe, expect, it } from "vitest";
import { readSse } from "../src/sse";

const encoder = new TextEncoder();

function bodyOf(...chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      controller.close();
    },
  });
}

async function collect(body: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const item of readSse(body)) out.push(item);
  return out;
}

describe("readSse", () => {
  it("parses data lines into objects", async () => {
    const out = await collect(bodyOf('data: {"a":1}\n\ndata: {"b":2}\n\n'));
    expect(out).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("handles a JSON line split across two chunks", async () => {
    const out = await collect(bodyOf('data: {"te', 'xt":"hola"}\n\n'));
    expect(out).toEqual([{ text: "hola" }]);
  });

  it("handles a multi-byte character split across two chunks", async () => {
    const bytes = encoder.encode('data: {"t":"é"}\n\n');
    const cut = bytes.indexOf(0xc3) + 1; // between the two bytes of "é"
    const out = await collect(bodyOf(bytes.slice(0, cut), bytes.slice(cut)));
    expect(out).toEqual([{ t: "é" }]);
  });

  it("handles several lines in one chunk", async () => {
    const out = await collect(bodyOf('data: {"n":1}\ndata: {"n":2}\ndata: {"n":3}\n'));
    expect(out).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });

  it("handles CRLF line endings", async () => {
    const out = await collect(bodyOf('data: {"n":1}\r\n\r\n'));
    expect(out).toEqual([{ n: 1 }]);
  });

  it("ignores blank lines, comment lines, and non-data fields", async () => {
    const out = await collect(bodyOf(': keep-alive\n\nevent: message\nid: 7\nretry: 100\ndata: {"ok":true}\n\n'));
    expect(out).toEqual([{ ok: true }]);
  });

  it("ends iteration at [DONE] and ignores what follows", async () => {
    const out = await collect(bodyOf('data: {"n":1}\n\ndata: [DONE]\n\ndata: {"n":2}\n\n'));
    expect(out).toEqual([{ n: 1 }]);
  });

  it("parses a final data line that has no trailing newline", async () => {
    const out = await collect(bodyOf('data: {"n":1}'));
    expect(out).toEqual([{ n: 1 }]);
  });

  it("throws on malformed JSON without carrying the line content", async () => {
    const secretish = "SYNTHETIC-SECRET-IN-LINE";
    const failure = await collect(bodyOf(`data: {"leak":"${secretish}\n\n`)).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(String((failure as Error).message)).not.toContain(secretish);
    expect(String((failure as Error).message)).not.toContain("leak");
  });
});
