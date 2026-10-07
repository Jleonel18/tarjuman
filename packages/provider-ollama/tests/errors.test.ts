import { describe, expect, it } from "vitest";
import { mapStatus, mapThrown } from "../src/errors";

const BASE_URL = "http://localhost:11434";
const MODEL_ID = "gemma3:4b";
const ctx = { baseUrl: BASE_URL, modelId: MODEL_ID };

describe("mapThrown", () => {
  it("maps a fetch TypeError to network + unreachable", () => {
    expect(mapThrown(new TypeError("Failed to fetch"), ctx)).toEqual({
      code: "network",
      diagnostic: { kind: "unreachable", baseUrl: BASE_URL },
    });
  });

  it("never copies the thrown message into the result", () => {
    const secret = "SYNTHETIC-SECRET-IN-ERROR";
    const result = mapThrown(new TypeError(`bad header ${secret}`), ctx);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});

describe("mapStatus", () => {
  it("maps 404 to bad_request + model_not_installed with the model id", () => {
    expect(mapStatus(404, ctx)).toEqual({
      code: "bad_request",
      diagnostic: { kind: "model_not_installed", baseUrl: BASE_URL, modelId: MODEL_ID, httpStatus: 404 },
    });
  });

  it.each([400, 413, 422])("maps %i to bad_request + rejected", (status) => {
    expect(mapStatus(status, ctx)).toEqual({
      code: "bad_request",
      diagnostic: { kind: "rejected", baseUrl: BASE_URL, httpStatus: status },
    });
  });

  it("maps 429 to rate_limited + busy", () => {
    expect(mapStatus(429, ctx)).toEqual({
      code: "rate_limited",
      diagnostic: { kind: "busy", baseUrl: BASE_URL, httpStatus: 429 },
    });
  });

  it("maps 503 to overloaded + busy", () => {
    expect(mapStatus(503, ctx)).toEqual({
      code: "overloaded",
      diagnostic: { kind: "busy", baseUrl: BASE_URL, httpStatus: 503 },
    });
  });

  it.each([500, 401, 418, 502])("maps %i to unknown + failed", (status) => {
    expect(mapStatus(status, ctx)).toEqual({
      code: "unknown",
      diagnostic: { kind: "failed", baseUrl: BASE_URL, httpStatus: status },
    });
  });

  it("only ever produces the documented diagnostic fields", () => {
    const allowed = new Set(["kind", "baseUrl", "modelId", "httpStatus"]);
    for (const status of [400, 404, 413, 422, 429, 500, 503, 599]) {
      for (const key of Object.keys(mapStatus(status, ctx).diagnostic)) expect(allowed.has(key)).toBe(true);
    }
    for (const key of Object.keys(mapThrown(new TypeError("x"), ctx).diagnostic)) expect(allowed.has(key)).toBe(true);
  });

  it("takes no response text, so a secret in a body cannot reach the result", () => {
    const secret = "SYNTHETIC-SECRET-IN-BODY";
    // The mapper's signature has no body parameter; extra arguments are ignored by design.
    const result = (mapStatus as (status: number, ctx: unknown, body?: string) => unknown)(500, ctx, secret);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
