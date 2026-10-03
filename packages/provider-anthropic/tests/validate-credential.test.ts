import { sealSecret } from "@tarjuman/core";
import type { ProviderErrorCode, ValidationResult } from "@tarjuman/core";
import { describe, expect, it } from "vitest";
import { AnthropicProvider } from "../src/anthropic-provider";
import { errorReply, FakeAnthropic, messageJson, replyForCode, type ErrorFixture, type Reply } from "./helpers/fake-anthropic";

const RAW_SECRET = "sk-ant-api03-SYNTHETIC-KEY-FOR-VALIDATION-0002";

async function validate(reply: Reply, signal?: AbortSignal) {
  const fake = new FakeAnthropic().enqueue(reply);
  const provider = new AnthropicProvider({ fetch: fake.fetch });
  const result = await provider.validateCredential(sealSecret(RAW_SECRET), signal);
  return { result, fake };
}

describe("validateCredential: outcomes (synthetic fixtures)", () => {
  it("accepts a key when the minimal generation succeeds", async () => {
    const { result } = await validate({ kind: "json", status: 200, body: messageJson() });
    expect(result).toEqual({ ok: true });
  });

  const failures: [string, ErrorFixture, ProviderErrorCode][] = [
    ["an invalid key (401)", "authentication", "invalid_credential"],
    ["a revoked key (401)", "revoked", "invalid_credential"],
    ["a key without permission (403)", "permission", "permission_denied"],
    ["an exhausted balance (402)", "billing", "quota_exhausted"],
    ["a spend cap reached (429, no retry-after)", "rate_limit_spend_cap", "rate_limited"],
    ["a server fault (500)", "api_error", "unknown"],
    ["an overloaded service (529)", "overloaded", "overloaded"],
  ];
  for (const [label, fixture, code] of failures) {
    it(`maps ${label} to ${code}`, async () => {
      const { result } = await validate(errorReply(fixture));
      expect(result).toEqual({ ok: false, code } satisfies ValidationResult);
    });
  }

  it("maps a network failure to network", async () => {
    const { result } = await validate(replyForCode("network"));
    expect(result).toEqual({ ok: false, code: "network" });
  });

  it("shows a 400 as a rejected request, not as a key problem", async () => {
    // research R5: a spend-limit message also arrives as 400, so a 400 must not read as "bad key".
    const { result } = await validate(errorReply("invalid_request"));
    expect(result).toEqual({ ok: false, code: "bad_request" });
  });

  it("returns network when the caller's signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const { result, fake } = await validate({ kind: "json", status: 200, body: messageJson() }, controller.signal);
    expect(result).toEqual({ ok: false, code: "network" });
    expect(fake.calls.length).toBeLessThanOrEqual(1);
  });
});

describe("validateCredential: what it sends (research R5)", () => {
  async function sent() {
    const { fake } = await validate({ kind: "json", status: 200, body: messageJson() });
    const call = fake.calls[0];
    if (!call) throw new Error("no request reached the transport");
    return call;
  }

  it("makes exactly one request, with no retry", async () => {
    const { fake } = await validate(errorReply("overloaded"));
    expect(fake.calls).toHaveLength(1);
  });

  it("uses the cheapest listed model, a tiny max_tokens, no stream, and no tools", async () => {
    const call = await sent();
    expect(call.body["model"]).toBe("claude-haiku-4-5");
    expect(call.body["max_tokens"]).toBeLessThanOrEqual(8);
    expect(call.body["stream"]).not.toBe(true);
    expect(call.body).not.toHaveProperty("tools");
  });

  it("sends a fixed trusted prompt with no user content", async () => {
    const call = await sent();
    const messages = call.body["messages"] as { role: string; content: string }[];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.content.length).toBeLessThan(60);
  });

  it("sends the key only in x-api-key, and never sends thinking or effort for Haiku", async () => {
    const call = await sent();
    expect(call.headers["x-api-key"]).toBe(RAW_SECRET);
    expect(JSON.stringify(call.body)).not.toContain(RAW_SECRET);
    expect(JSON.stringify(call.body)).not.toMatch(/thinking|output_config/);
  });

  it("does not leak the key when the transport error mentions it", async () => {
    const leaky = { kind: "reject", error: new Error(`boom ${RAW_SECRET}`) } as const;
    const { result } = await validate(leaky);
    expect(result).toEqual({ ok: false, code: "network" });
    expect(JSON.stringify(result)).not.toContain(RAW_SECRET);
  });
});
