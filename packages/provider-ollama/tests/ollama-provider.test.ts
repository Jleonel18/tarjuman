import { sealSecret } from "@tarjuman/core";
import type { ModelRequest, SecretHandle, StreamEvent } from "@tarjuman/core";
import { describe, expect, it } from "vitest";
import type { OllamaDiagnostic } from "../src/errors";
import { OllamaProvider } from "../src/ollama-provider";
import streamAnswer from "./fixtures/stream-answer.json";
import streamLength from "./fixtures/stream-length.json";
import streamTruncated from "./fixtures/stream-truncated.json";
import { answerChunks, FakeOllama, modelsReply, type Reply } from "./helpers/fake-ollama";

const BASE_URL = "http://localhost:11434";
const SECRET = sealSecret("ollama");

const REQUEST: ModelRequest = {
  modelId: "gemma3:4b",
  layers: [
    { id: "security", text: "SECURITY" },
    { id: "user_preferences", text: "PREFS" },
  ],
  messages: [
    { role: "user", content: "first" },
    { role: "assistant", content: "answer" },
    { role: "user", content: "second" },
  ],
  maxTokens: 300,
};

async function collect(iterable: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

function setup(reply: Reply, options: { baseUrl?: string } = {}) {
  const fake = new FakeOllama().enqueue(reply);
  const diagnostics: OllamaDiagnostic[] = [];
  const provider = new OllamaProvider({ fetch: fake.fetch, diagnose: (d) => diagnostics.push(d), ...options });
  return { fake, diagnostics, provider };
}

async function send(request = REQUEST, options: { baseUrl?: string } = {}) {
  const { fake, provider } = setup({ kind: "sse", chunks: answerChunks(["ok"], 1, 1) }, options);
  await collect(provider.stream(request, SECRET, new AbortController().signal));
  const call = fake.calls[0];
  if (!call) throw new Error("no request reached the transport");
  return call;
}

describe("OllamaProvider: request mapping", () => {
  it("posts one streaming request to /v1/chat/completions with no Authorization header", async () => {
    const call = await send();
    expect(call.url).toBe(`${BASE_URL}/v1/chat/completions`);
    expect(call.method).toBe("POST");
    expect(call.headers["content-type"]).toBe("application/json");
    expect(call.headers).not.toHaveProperty("authorization");
    expect(call.body["model"]).toBe("gemma3:4b");
    expect(call.body["stream"]).toBe(true);
    expect(call.body["stream_options"]).toEqual({ include_usage: true });
    expect(call.body["max_tokens"]).toBe(300);
  });

  it("joins the layers into one system message, in order, then sends the turns", async () => {
    const call = await send();
    expect(call.body["messages"]).toEqual([
      { role: "system", content: "SECURITY\n\nPREFS" },
      { role: "user", content: "first" },
      { role: "assistant", content: "answer" },
      { role: "user", content: "second" },
    ]);
  });

  it("never sends effort, tools, or sampling parameters, even when effort is requested", async () => {
    const call = await send({ ...REQUEST, effort: "high" });
    for (const forbidden of ["reasoning_effort", "effort", "tools", "tool_choice", "temperature", "top_p", "top_k", "seed"]) {
      expect(call.body, forbidden).not.toHaveProperty(forbidden);
    }
  });

  it("trims trailing slashes from the base URL", async () => {
    const call = await send(REQUEST, { baseUrl: "http://localhost:11434/" });
    expect(call.url).toBe("http://localhost:11434/v1/chat/completions");
  });

  it("makes exactly one fetch per stream() call, even on failure", async () => {
    const { fake, provider } = setup({ kind: "json", status: 503, body: {} });
    await collect(provider.stream(REQUEST, SECRET, new AbortController().signal));
    expect(fake.calls).toHaveLength(1);
  });

  it("never unseals the SecretHandle it is given", async () => {
    // Any touch at all (read, enumerate, stringify) throws, so passing the handle along would fail too.
    const trip = () => {
      throw new Error("the secret handle was touched");
    };
    const tripwire = new Proxy({}, { get: trip, has: trip, ownKeys: trip, getPrototypeOf: trip }) as SecretHandle;
    const { provider } = setup({ kind: "sse", chunks: answerChunks(["ok"], 1, 1) });
    const events = await collect(provider.stream(REQUEST, tripwire, new AbortController().signal));
    expect(events.at(-1)).toEqual({ type: "stop", reason: "end" });
    expect(await provider.validateCredential(tripwire)).toBeDefined();
  });
});

describe("OllamaProvider: constructor", () => {
  it.each(["not a url", "ftp://localhost:11434", "localhost:11434", ""])("throws on a bad base URL: %j", (baseUrl) => {
    expect(() => new OllamaProvider({ baseUrl })).toThrow();
  });

  it("accepts http and https base URLs", () => {
    expect(() => new OllamaProvider({ baseUrl: "http://127.0.0.1:11434" })).not.toThrow();
    expect(() => new OllamaProvider({ baseUrl: "https://ollama.example.test" })).not.toThrow();
  });

  it("is identified as ollama and lists the static table without a request", () => {
    const fake = new FakeOllama();
    const provider = new OllamaProvider({ fetch: fake.fetch });
    expect(provider.id).toBe("ollama");
    expect(provider.listModels().map((m) => m.id)).toEqual(["gemma3:4b", "gemma3:1b"]);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("OllamaProvider: stream mapping (synthetic wire fixtures)", () => {
  it("maps the answer fixture to text, one usage, and stop end", async () => {
    const { provider } = setup({ kind: "sse", chunks: streamAnswer });
    const events = await collect(provider.stream(REQUEST, SECRET, new AbortController().signal));
    expect(events).toEqual([
      { type: "text", delta: "Hola, " },
      { type: "text", delta: "mundo." },
      { type: "usage", inputTokens: 42, outputTokens: 7 },
      { type: "stop", reason: "end" },
    ]);
  });

  it("maps finish_reason length to max_tokens", async () => {
    const { provider } = setup({ kind: "sse", chunks: streamLength });
    const events = await collect(provider.stream(REQUEST, SECRET, new AbortController().signal));
    expect(events.at(-1)).toEqual({ type: "stop", reason: "max_tokens" });
  });

  it("maps an unknown finish_reason to end", async () => {
    const chunks = answerChunks(["x"], 1, 1).map((c) => JSON.parse(JSON.stringify(c).replace('"stop"', '"content_filter"')));
    const { provider } = setup({ kind: "sse", chunks });
    const events = await collect(provider.stream(REQUEST, SECRET, new AbortController().signal));
    expect(events.at(-1)).toEqual({ type: "stop", reason: "end" });
  });

  it("emits no usage event when the runtime reports none, but still stops", async () => {
    const withoutUsage = streamAnswer.filter((c) => !("usage" in c));
    const { provider } = setup({ kind: "sse", chunks: withoutUsage });
    const events = await collect(provider.stream(REQUEST, SECRET, new AbortController().signal));
    expect(events.map((e) => e.type)).toEqual(["text", "text", "stop"]);
  });

  it("handles usage arriving on the same chunk as finish_reason", async () => {
    const [first, second, finish] = streamAnswer;
    const merged = { ...finish, usage: { prompt_tokens: 5, completion_tokens: 6, total_tokens: 11 } };
    const { provider } = setup({ kind: "sse", chunks: [first, second, merged] });
    const events = await collect(provider.stream(REQUEST, SECRET, new AbortController().signal));
    expect(events.slice(-2)).toEqual([
      { type: "usage", inputTokens: 5, outputTokens: 6 },
      { type: "stop", reason: "end" },
    ]);
  });

  it("reports a stream that ends without finish_reason as a single network error", async () => {
    const { provider, diagnostics } = setup({ kind: "sse", chunks: streamTruncated });
    const events = await collect(provider.stream(REQUEST, SECRET, new AbortController().signal));
    expect(events.filter((e) => e.type === "error")).toEqual([{ type: "error", code: "network" }]);
    expect(events.at(-1)).toEqual({ type: "error", code: "network" });
    expect(diagnostics).toHaveLength(1);
  });

  it("also ends cleanly when the server closes without [DONE]", async () => {
    const { provider } = setup({ kind: "sse", chunks: streamAnswer, omitDone: true });
    const events = await collect(provider.stream(REQUEST, SECRET, new AbortController().signal));
    expect(events.at(-1)).toEqual({ type: "stop", reason: "end" });
  });

  it("maps an error payload in the stream to unknown, without its text", async () => {
    const { provider, diagnostics } = setup({
      kind: "sse",
      chunks: [streamAnswer[0], { error: { message: "SYNTHETIC-LEAK model crashed" } }],
    });
    const events = await collect(provider.stream(REQUEST, SECRET, new AbortController().signal));
    expect(events.at(-1)).toEqual({ type: "error", code: "unknown" });
    expect(JSON.stringify([events, diagnostics])).not.toContain("SYNTHETIC-LEAK");
  });

  it("maps a malformed data line to unknown, without its text", async () => {
    const { provider, diagnostics } = setup({ kind: "sse-raw", text: 'data: {"broken SYNTHETIC-LEAK\n\n' });
    const events = await collect(provider.stream(REQUEST, SECRET, new AbortController().signal));
    expect(events).toEqual([{ type: "error", code: "unknown" }]);
    expect(JSON.stringify(diagnostics)).not.toContain("SYNTHETIC-LEAK");
  });

  it("stops with aborted, without a request, when the signal is already aborted", async () => {
    const { fake, provider } = setup({ kind: "sse", chunks: streamAnswer });
    const controller = new AbortController();
    controller.abort();
    const events = await collect(provider.stream(REQUEST, SECRET, controller.signal));
    expect(events).toEqual([{ type: "stop", reason: "aborted" }]);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("OllamaProvider: diagnostics", () => {
  it("calls diagnose once, before the error event is yielded", async () => {
    const fake = new FakeOllama().enqueue({ kind: "json", status: 404, body: { error: { message: "model not found" } } });
    const order: string[] = [];
    const provider = new OllamaProvider({ fetch: fake.fetch, diagnose: (d) => order.push(`diagnose:${d.kind}`) });
    for await (const event of provider.stream(REQUEST, SECRET, new AbortController().signal)) order.push(`event:${event.type}`);
    expect(order).toEqual(["diagnose:model_not_installed", "event:error"]);
  });

  it("reports an unreachable runtime as network + unreachable", async () => {
    const { provider, diagnostics } = setup({ kind: "reject", error: new TypeError("Failed to fetch") });
    const events = await collect(provider.stream(REQUEST, SECRET, new AbortController().signal));
    expect(events).toEqual([{ type: "error", code: "network" }]);
    expect(diagnostics).toEqual([{ kind: "unreachable", baseUrl: BASE_URL }]);
  });

  it("names the model in a model_not_installed diagnostic", async () => {
    const { provider, diagnostics } = setup({ kind: "json", status: 404, body: {} });
    await collect(provider.stream(REQUEST, SECRET, new AbortController().signal));
    expect(diagnostics).toEqual([{ kind: "model_not_installed", baseUrl: BASE_URL, modelId: "gemma3:4b", httpStatus: 404 }]);
  });
});

describe("OllamaProvider: validateCredential", () => {
  it("sends GET /v1/models, with no Authorization header, and returns ok", async () => {
    const { fake, provider, diagnostics } = setup(modelsReply());
    expect(await provider.validateCredential(SECRET)).toEqual({ ok: true });
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.method).toBe("GET");
    expect(fake.calls[0]?.url).toBe(`${BASE_URL}/v1/models`);
    expect(fake.calls[0]?.headers).not.toHaveProperty("authorization");
    expect(diagnostics).toEqual([]);
  });

  it("is still ok, with a model_not_installed diagnostic, when the default model is missing", async () => {
    const { provider, diagnostics } = setup(modelsReply(["llama3.2:3b"]));
    expect(await provider.validateCredential(SECRET)).toEqual({ ok: true });
    expect(diagnostics).toEqual([{ kind: "model_not_installed", baseUrl: BASE_URL, modelId: "gemma3:4b" }]);
  });

  it("honors a custom default model id", async () => {
    const fake = new FakeOllama().enqueue(modelsReply(["qwen3:4b"]));
    const diagnostics: OllamaDiagnostic[] = [];
    const provider = new OllamaProvider({ fetch: fake.fetch, diagnose: (d) => diagnostics.push(d), defaultModelId: "qwen3:4b" });
    expect(await provider.validateCredential(SECRET)).toEqual({ ok: true });
    expect(diagnostics).toEqual([]);
  });

  it("returns network + unreachable when fetch throws a TypeError", async () => {
    const { provider, diagnostics } = setup({ kind: "reject", error: new TypeError("Failed to fetch") });
    expect(await provider.validateCredential(SECRET)).toEqual({ ok: false, code: "network" });
    expect(diagnostics).toEqual([{ kind: "unreachable", baseUrl: BASE_URL }]);
  });

  it("maps other statuses per research R4", async () => {
    const { provider, diagnostics } = setup({ kind: "json", status: 500, body: {} });
    expect(await provider.validateCredential(SECRET)).toEqual({ ok: false, code: "unknown" });
    expect(diagnostics).toEqual([{ kind: "failed", baseUrl: BASE_URL, httpStatus: 500 }]);
  });

  it("makes no request when the signal is already aborted", async () => {
    const { fake, provider } = setup(modelsReply());
    const controller = new AbortController();
    controller.abort();
    expect(await provider.validateCredential(SECRET, controller.signal)).toEqual({ ok: false, code: "network" });
    expect(fake.calls).toHaveLength(0);
  });
});
