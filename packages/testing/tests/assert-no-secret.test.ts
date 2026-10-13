import type { ModelRequest } from "@tarjuman/core";
import { describe, expect, it } from "vitest";
import { assertNoSecret, findSecret } from "../src/assert-no-secret";

const SECRET = "sk-ant-api03-ASSERT-NO-SECRET-TEST-0001";

const request = (content: string, layer = "SECURITY"): ModelRequest => ({
  modelId: "m",
  layers: [{ id: "security", text: layer }],
  messages: [{ role: "user", content }],
  maxTokens: 10,
});

describe("findSecret", () => {
  it("finds nothing in a clean request", () => {
    expect(findSecret(request("hello"), SECRET)).toBeUndefined();
  });

  it("finds the secret in a message and in a layer", () => {
    expect(findSecret(request(`here ${SECRET}`), SECRET)).toBeDefined();
    expect(findSecret(request("x", `layer ${SECRET}`), SECRET)).toBeDefined();
  });

  it.each([
    ["URL-encoded", encodeURIComponent(SECRET)],
    ["base64", btoa(SECRET)],
    ["reversed", [...SECRET].reverse().join("")],
    ["spaced out", [...SECRET].join(" ")],
    ["with zero-width characters", [...SECRET].join("​")],
    ["split over lines", SECRET.replace(/-/g, "\n")],
  ])("finds the secret when it is %s", (_name, form) => {
    expect(findSecret(request(`x ${form} y`), SECRET)).toBeDefined();
  });

  it("does not report an unrelated key-shaped string", () => {
    expect(findSecret(request("sk-ant-api03-SOMETHING-ELSE-ENTIRELY-9999"), SECRET)).toBeUndefined();
  });

  it("ignores an empty secret instead of matching everything", () => {
    expect(findSecret(request("hello"), "")).toBeUndefined();
  });
});

describe("assertNoSecret", () => {
  it("passes on a clean request", () => {
    expect(() => assertNoSecret(request("hello"), SECRET)).not.toThrow();
  });

  it("throws on a leak, and the error never contains the secret", () => {
    try {
      assertNoSecret(request(`leak ${SECRET}`), SECRET);
      throw new Error("expected assertNoSecret to throw");
    } catch (error) {
      expect((error as Error).message).not.toContain(SECRET);
      expect((error as Error).message).toMatch(/secret/i);
    }
  });
});
