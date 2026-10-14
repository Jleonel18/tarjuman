import { sealSecret } from "@tarjuman/core";
import type { StreamEvent } from "@tarjuman/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../src/anthropic-provider";
import { scrubSecret } from "../src/scrub";
import { answerEvents, FakeAnthropic, messageJson } from "./helpers/fake-anthropic";

const SECRET = "sk-ant-api03-SYNTHETIC-KEY-FOR-SCRUB-TESTS-0003";

async function collect(iterable: AsyncIterable<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

const REQUEST = {
  modelId: "claude-sonnet-5-5",
  layers: [{ id: "security" as const, text: "SECURITY" }],
  messages: [{ role: "user" as const, content: "hello" }],
  maxTokens: 100,
};

describe("scrubSecret", () => {
  it("removes the exact secret wherever it appears", () => {
    expect(scrubSecret(`a ${SECRET} b ${SECRET}`, SECRET)).toBe("a [redacted] b [redacted]");
  });

  it("removes other key-shaped strings even when they are not the current secret", () => {
    expect(scrubSecret("old key sk-ant-api03-ANOTHER-KEY-1234567890 was rotated", SECRET)).not.toContain("ANOTHER-KEY");
  });

  it("removes the secret in the forms an error message or a log line gives it", () => {
    const forms = [
      `x-api-key: ${SECRET}`,
      `{"x-api-key":"${SECRET}"}`,
      `Authorization: Bearer ${SECRET}`,
      encodeURIComponent(SECRET),
      JSON.stringify(SECRET),
    ];
    for (const form of forms) expect(scrubSecret(`failed: ${form}`, SECRET), form).not.toContain(SECRET);
  });

  it("leaves text without a secret untouched", () => {
    expect(scrubSecret("socket hang up", SECRET)).toBe("socket hang up");
  });

  it("never scrubs on an empty secret (that would blank the whole text)", () => {
    expect(scrubSecret("hello", "")).toBe("hello");
  });
});

describe("AnthropicProvider: the key does not leave the adapter", () => {
  afterEach(() => vi.restoreAllMocks());

  function spyOnConsole() {
    return (["log", "info", "warn", "error", "debug", "trace"] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    );
  }

  const leakyErrors: [string, unknown][] = [
    ["a transport error that names the key", new Error(`socket hang up (x-api-key: ${SECRET})`)],
    ["a TypeError with the key in its message", new TypeError(`bad header ${SECRET}`)],
    ["an error with the key in its cause", new Error("outer", { cause: new Error(`inner ${SECRET}`) })],
    ["an error with the key in its stack", Object.assign(new Error("x"), { stack: `Error: x\n at ${SECRET}` })],
    ["a thrown string", `plain ${SECRET}`],
    ["a thrown object", { message: SECRET, headers: { "x-api-key": SECRET } }],
  ];

  for (const [name, error] of leakyErrors) {
    it(`streams no key and logs nothing when the transport throws ${name}`, async () => {
      const spies = spyOnConsole();
      const fake = new FakeAnthropic().enqueue({ kind: "reject", error: error as Error });
      const provider = new AnthropicProvider({ fetch: fake.fetch });
      const events = await collect(provider.stream(REQUEST, sealSecret(SECRET), new AbortController().signal));
      expect(JSON.stringify(events)).not.toContain(SECRET);
      expect(events.at(-1)?.type).toBe("error");
      for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET);
    });

    it(`returns no key from validation when the transport throws ${name}`, async () => {
      const spies = spyOnConsole();
      const fake = new FakeAnthropic().enqueue({ kind: "reject", error: error as Error });
      const provider = new AnthropicProvider({ fetch: fake.fetch });
      const result = await provider.validateCredential(sealSecret(SECRET));
      expect(JSON.stringify(result)).not.toContain(SECRET);
      for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toContain(SECRET);
    });
  }

  it("never logs anything on a normal turn", async () => {
    const spies = spyOnConsole();
    const fake = new FakeAnthropic().enqueue({ kind: "sse", events: answerEvents(["ok"], 1, 1) });
    await collect(new AnthropicProvider({ fetch: fake.fetch }).stream(REQUEST, sealSecret(SECRET), new AbortController().signal));
    await new AnthropicProvider({ fetch: new FakeAnthropic().enqueue({ kind: "json", status: 200, body: messageJson() }).fetch }).validateCredential(sealSecret(SECRET));
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("assembles a request whose URL and body never contain the key; it travels only in x-api-key", async () => {
    const fake = new FakeAnthropic().enqueue({ kind: "sse", events: answerEvents(["ok"], 1, 1) });
    await collect(new AnthropicProvider({ fetch: fake.fetch }).stream(REQUEST, sealSecret(SECRET), new AbortController().signal));
    const call = fake.calls[0];
    expect(call?.url).not.toContain(SECRET);
    expect(JSON.stringify(call?.body)).not.toContain(SECRET);
    const carriers = Object.entries(call?.headers ?? {}).filter(([, value]) => value.includes(SECRET));
    expect(carriers.map(([name]) => name)).toEqual(["x-api-key"]);
  });

  it("redacts the key if the model itself echoes it, even split across stream chunks", async () => {
    const half = Math.floor(SECRET.length / 2);
    const chunks = ["Your key is ", SECRET.slice(0, half), SECRET.slice(half), " - keep it safe."];
    const fake = new FakeAnthropic().enqueue({ kind: "sse", events: answerEvents(chunks, 1, 1) });
    const events = await collect(
      new AnthropicProvider({ fetch: fake.fetch }).stream(REQUEST, sealSecret(SECRET), new AbortController().signal),
    );
    expect(JSON.stringify(events)).not.toContain(SECRET);
    const text = events.flatMap((e) => (e.type === "text" ? [e.delta] : [])).join("");
    expect(text).toBe("Your key is [redacted] - keep it safe.");
  });

  it("still ends the stream with usage and a stop when text was held back", async () => {
    const fake = new FakeAnthropic().enqueue({ kind: "sse", events: answerEvents(["done sk-ant-api"], 5, 7) });
    const events = await collect(
      new AnthropicProvider({ fetch: fake.fetch }).stream(REQUEST, sealSecret(SECRET), new AbortController().signal),
    );
    expect(events.flatMap((e) => (e.type === "text" ? [e.delta] : [])).join("")).toBe("done sk-ant-api");
    expect(events.map((e) => e.type).slice(-2)).toEqual(["usage", "stop"]);
  });
});
