import { describe, expect, it } from "vitest";
import { SecretStreamFilter } from "../../src/credentials/secret-stream-filter";

// Moved from packages/provider-anthropic/tests/scrub.test.ts (004 research R13); unchanged.
const SECRET = "sk-ant-api03-SYNTHETIC-KEY-FOR-SCRUB-TESTS-0003";

describe("SecretStreamFilter", () => {
  function run(chunks: string[]): string {
    const filter = new SecretStreamFilter(SECRET);
    return chunks.map((c) => filter.push(c)).join("") + filter.flush();
  }

  it("passes ordinary text through unchanged", () => {
    expect(run(["Hello ", "world"])).toBe("Hello world");
  });

  it("holds nothing back when the text cannot be the start of the secret", () => {
    const filter = new SecretStreamFilter(SECRET);
    expect(filter.push("Hello world")).toBe("Hello world");
  });

  it("redacts a secret that arrives in one chunk", () => {
    expect(run([`my key is ${SECRET}!`])).toBe("my key is [redacted]!");
  });

  it("redacts a secret split across every possible boundary", () => {
    for (let cut = 1; cut < SECRET.length; cut += 1) {
      const out = run(["key: ", SECRET.slice(0, cut), SECRET.slice(cut), " end"]);
      expect(out, `cut ${cut}`).toBe("key: [redacted] end");
    }
  });

  it("redacts a secret delivered one character at a time", () => {
    expect(run([...`x${SECRET}y`])).toBe("x[redacted]y");
  });

  it("releases a held partial match when it turns out not to be the secret", () => {
    expect(run(["sk-ant-", "api03-SOMETHING-ELSE"])).toBe("sk-ant-api03-SOMETHING-ELSE");
  });

  it("releases a held partial match at the end of the stream", () => {
    expect(run(["see sk-ant-api"])).toBe("see sk-ant-api");
  });
});
