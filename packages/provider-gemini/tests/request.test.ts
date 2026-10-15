import { sealSecret, type Effort, type ModelRequest, type StreamEvent } from "@tarjuman/core";
import { describe, expect, it } from "vitest";
import { GeminiProvider } from "../src/gemini-provider";
import { GEMINI_API_ORIGIN } from "../src/origin";
import { answerChunks, FakeGemini, modelReply } from "./helpers/fake-gemini";

// What the adapter puts on the wire (contracts/gemini-provider.md, research R2, R3). Fake key only.
const RAW_SECRET = "AQ.FAKEgeminiREQUESTtestSECRETfakeFAKE_-fakeFAKE00001";

async function drain(iterable: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

function request(overrides: Partial<ModelRequest> = {}): ModelRequest {
  return {
    modelId: "gemini-3.8-flash",
    layers: [
      { id: "security", text: "SECURITY LAYER" },
      { id: "domain_scope", text: "SCOPE LAYER" },
      { id: "tone", text: "TONE LAYER" },
    ],
    messages: [
      { role: "user", content: "What does ser mean?" },
      { role: "assistant", content: "ACCEPT\nIt means to be." },
      { role: "user", content: "And estar?" },
    ],
    maxTokens: 1024,
    ...overrides,
  };
}

async function send(req: ModelRequest) {
  const fake = new FakeGemini().enqueue({ kind: "sse", chunks: answerChunks(["ACCEPT\nok"], 1, 1) });
  await drain(new GeminiProvider({ fetch: fake.fetch }).stream(req, sealSecret(RAW_SECRET), new AbortController().signal));
  const call = fake.calls[0];
  if (!call) throw new Error("no request was sent");
  return call;
}

describe("GeminiProvider: the streaming request", () => {
  it("posts to the model's streamGenerateContent endpoint with alt=sse, on the Gemini origin only", async () => {
    const call = await send(request());
    expect(call.method).toBe("POST");
    expect(call.url).toBe(`${GEMINI_API_ORIGIN}/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse`);
  });

  it("carries the key only in the x-goog-api-key header, never in the URL or the body (FR-008)", async () => {
    const call = await send(request());
    expect(call.headers["x-goog-api-key"]).toBe(RAW_SECRET);
    expect(call.url).not.toContain("key=");
    expect(call.url).not.toContain(RAW_SECRET);
    expect(call.rawBody).not.toContain(RAW_SECRET);
    expect(Object.keys(call.headers).sort()).toEqual(["content-type", "x-goog-api-key"]);
  });

  it("refuses to follow a redirect, so the key header can never be replayed to another origin", async () => {
    expect((await send(request())).redirect).toBe("error");
  });

  it("sends one system part per layer, in precedence order", async () => {
    const call = await send(request());
    expect(call.body?.["systemInstruction"]).toEqual({
      parts: [{ text: "SECURITY LAYER" }, { text: "SCOPE LAYER" }, { text: "TONE LAYER" }],
    });
  });

  it("omits systemInstruction when there are no layers", async () => {
    const call = await send(request({ layers: [] }));
    expect(call.body).not.toHaveProperty("systemInstruction");
  });

  it("sends the turns as contents, with the assistant role named model", async () => {
    const call = await send(request());
    expect(call.body?.["contents"]).toEqual([
      { role: "user", parts: [{ text: "What does ser mean?" }] },
      { role: "model", parts: [{ text: "ACCEPT\nIt means to be." }] },
      { role: "user", parts: [{ text: "And estar?" }] },
    ]);
  });

  it("sets maxOutputTokens", async () => {
    const call = await send(request({ maxTokens: 777 }));
    expect(call.body?.["generationConfig"]).toMatchObject({ maxOutputTokens: 777 });
  });

  it.each<Effort>(["low", "medium", "high"])("maps effort %s to thinkingLevel on a model that supports it", async (effort) => {
    const call = await send(request({ effort }));
    expect(call.body?.["generationConfig"]).toEqual({ maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: effort } });
  });

  it("sends no thinking config without an effort, or with one the model does not offer", async () => {
    expect((await send(request())).body?.["generationConfig"]).toEqual({ maxOutputTokens: 1024 });
    expect((await send(request({ effort: "max" }))).body?.["generationConfig"]).toEqual({ maxOutputTokens: 1024 });
  });

  it("never sends safety settings, tool config, sampling parameters, cached content, or thought options", async () => {
    // `tools` is sent only when the request carries tools (005); see tools.test.ts.
    const call = await send(request({ effort: "high" }));
    expect(Object.keys(call.body ?? {}).sort()).toEqual(["contents", "generationConfig", "systemInstruction"]);
    const withTools = await send(request({ effort: "high", tools: [{ name: "x", description: "x", inputSchema: {} }] }));
    expect(Object.keys(withTools.body ?? {}).sort()).toEqual(["contents", "generationConfig", "systemInstruction", "tools"]);
    for (const forbidden of ["safetySettings", "toolConfig", "cachedContent", "temperature", "topP", "topK", "includeThoughts", "thinkingBudget"]) {
      expect(call.rawBody, forbidden).not.toContain(forbidden);
    }
  });
});

describe("GeminiProvider: key validation (research R7)", () => {
  it("is one GET of the default model, with the key in the header only, and no generation", async () => {
    const fake = new FakeGemini().enqueue(modelReply());
    const result = await new GeminiProvider({ fetch: fake.fetch }).validateCredential(sealSecret(RAW_SECRET));
    expect(result).toEqual({ ok: true });
    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0]!;
    expect(call.method).toBe("GET");
    expect(call.url).toBe(`${GEMINI_API_ORIGIN}/v1beta/models/gemini-3.8-flash`);
    expect(call.headers["x-goog-api-key"]).toBe(RAW_SECRET);
    expect(call.url).not.toContain("key=");
    expect(call.body).toBeUndefined();
    expect(call.redirect).toBe("error");
  });

  it("sends nothing when already aborted", async () => {
    const fake = new FakeGemini();
    const controller = new AbortController();
    controller.abort();
    const result = await new GeminiProvider({ fetch: fake.fetch }).validateCredential(sealSecret(RAW_SECRET), controller.signal);
    expect(result).toEqual({ ok: false, code: "network" });
    expect(fake.calls).toHaveLength(0);
  });
});
