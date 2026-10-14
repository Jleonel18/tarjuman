import { sealSecret, type ProviderErrorCode, type StreamEvent } from "@tarjuman/core";
import { describe, expect, it, vi } from "vitest";
import { mapErrorBody, mapStatus } from "../src/errors";
import { GeminiProvider } from "../src/gemini-provider";
import errors from "./fixtures/errors.json";
import { errorReply, FakeGemini, type ErrorCase } from "./helpers/fake-gemini";

// The error table of research R6. Fake key only.
const RAW_SECRET = "AQ.FAKEgeminiERRORStestSECRETfakeFAKE_-fakeFAKE000001";

const TABLE: [ErrorCase, ProviderErrorCode, number | undefined][] = [
  ["api_key_invalid", "invalid_credential", undefined],
  ["bad_request", "bad_request", undefined],
  ["failed_precondition", "permission_denied", undefined],
  ["unauthenticated", "invalid_credential", undefined],
  ["permission_denied", "permission_denied", undefined],
  ["not_found", "bad_request", undefined],
  ["rate_limited", "rate_limited", 17],
  ["rate_limited_no_delay", "rate_limited", undefined],
  ["internal", "unknown", undefined],
  ["unavailable", "overloaded", undefined],
  ["deadline_exceeded", "overloaded", undefined],
];

const REQUEST = {
  modelId: "gemini-3.8-flash",
  layers: [],
  messages: [{ role: "user" as const, content: "hola" }],
  maxTokens: 64,
};

async function streamWith(fake: FakeGemini): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const e of new GeminiProvider({ fetch: fake.fetch }).stream(REQUEST, sealSecret(RAW_SECRET), new AbortController().signal)) events.push(e);
  return events;
}

describe("Gemini error mapping (research R6)", () => {
  it.each(TABLE)("%s → %s", async (name, code, retryAfterSeconds) => {
    const events = await streamWith(new FakeGemini().enqueue(errorReply(name)));
    expect(events).toEqual([{ type: "error", code, ...(retryAfterSeconds !== undefined && { retryAfterSeconds }) }]);
  });

  it.each(TABLE)("validation: %s → %s", async (name, code) => {
    const fake = new FakeGemini().enqueue(errorReply(name));
    expect(await new GeminiProvider({ fetch: fake.fetch }).validateCredential(sealSecret(RAW_SECRET))).toEqual({ ok: false, code });
  });

  it("maps a status alone when the body is unreadable", () => {
    expect(mapStatus(400)).toEqual({ code: "bad_request" });
    expect(mapStatus(401)).toEqual({ code: "invalid_credential" });
    expect(mapStatus(403)).toEqual({ code: "permission_denied" });
    expect(mapStatus(429)).toEqual({ code: "rate_limited" });
    expect(mapStatus(503)).toEqual({ code: "overloaded" });
    expect(mapStatus(418)).toEqual({ code: "unknown" });
  });

  it("reads only the allow-listed fields of a body, never its message", () => {
    const body = errors.api_key_invalid.body;
    expect(mapErrorBody(400, body)).toEqual({ code: "invalid_credential" });
    expect(mapErrorBody(400, { error: { message: "API_KEY_INVALID" } })).toEqual({ code: "bad_request" });
  });

  it("ignores a retry delay it cannot read", () => {
    const body = { error: { code: 429, status: "RESOURCE_EXHAUSTED", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "soon" }] } };
    expect(mapErrorBody(429, body)).toEqual({ code: "rate_limited" });
    const fractional = { error: { details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "2.4s" }] } };
    expect(mapErrorBody(429, fractional)).toEqual({ code: "rate_limited", retryAfterSeconds: 3 });
  });

  it("a thrown fetch is network", async () => {
    const events = await streamWith(new FakeGemini().enqueue({ kind: "reject", error: new TypeError("Failed to fetch") }));
    expect(events).toEqual([{ type: "error", code: "network" }]);
  });
});

describe("Gemini errors carry no secret and no server text", () => {
  it.each(Object.keys(errors) as ErrorCase[])("%s", async (name) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const events = await streamWith(new FakeGemini().enqueue(errorReply(name)));
    const text = JSON.stringify(events);
    expect(text).not.toContain(RAW_SECRET);
    expect(text).not.toContain(errors[name].body.error.message);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    log.mockRestore();
    warn.mockRestore();
  });

  it("a thrown error whose message holds the key does not leak it", async () => {
    const events = await streamWith(new FakeGemini().enqueue({ kind: "reject", error: new Error(`boom x-goog-api-key: ${RAW_SECRET}`) }));
    expect(JSON.stringify(events)).not.toContain(RAW_SECRET);
  });
});

describe("no retries (constitution: cost safety)", () => {
  it.each(["rate_limited", "unavailable", "internal"] as ErrorCase[])("%s reaches the transport exactly once", async (name) => {
    const fake = new FakeGemini().enqueue(errorReply(name)).enqueue(errorReply(name));
    await streamWith(fake);
    expect(fake.calls).toHaveLength(1);
  });

  it("validation reaches the transport exactly once on failure", async () => {
    const fake = new FakeGemini().enqueue(errorReply("unavailable")).enqueue(errorReply("unavailable"));
    await new GeminiProvider({ fetch: fake.fetch }).validateCredential(sealSecret(RAW_SECRET));
    expect(fake.calls).toHaveLength(1);
  });
});
