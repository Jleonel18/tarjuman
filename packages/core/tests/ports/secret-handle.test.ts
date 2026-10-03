import { describe, expect, it } from "vitest";
import { destroySecret, sealSecret, SecretHandle } from "../../src/ports/secret-handle";
import { unsealSecret } from "../../src/ports/secret-unseal";

const KEY = "sk-ant-api03-THIS-IS-A-FAKE-TEST-KEY-1234";

describe("SecretHandle", () => {
  it("returns the secret only through unsealSecret", () => {
    const handle = sealSecret(KEY);
    expect(handle).toBeInstanceOf(SecretHandle);
    expect(unsealSecret(handle)).toBe(KEY);
  });

  it("refuses every way of turning it into text", () => {
    const handle = sealSecret(KEY);
    expect(() => String(handle)).toThrow();
    expect(() => `${handle as unknown as string}`).toThrow();
    expect(() => JSON.stringify(handle)).toThrow();
    expect(() => JSON.stringify({ nested: { handle } })).toThrow();
    expect(() => handle + "").toThrow();
  });

  it("has nothing to enumerate or copy out", () => {
    const handle = sealSecret(KEY);
    expect(Object.keys(handle)).toEqual([]);
    expect(Object.getOwnPropertyNames(handle)).toEqual([]);
    expect(Object.getOwnPropertySymbols(handle)).toEqual([]);
    expect(Object.isFrozen(handle)).toBe(true);
    expect({ ...handle }).toEqual({});
    expect(Reflect.ownKeys(structuredCloneSafe(handle))).toEqual([]);
  });

  it("cannot be rebuilt from a lookalike object", () => {
    const fake = Object.create(SecretHandle.prototype) as SecretHandle;
    expect(() => unsealSecret(fake)).toThrow();
  });

  it("forgets the secret once destroyed", () => {
    const handle = sealSecret(KEY);
    destroySecret(handle);
    expect(() => unsealSecret(handle)).toThrow();
  });
});

/** structuredClone would copy own enumerable data; there must be none to copy. */
function structuredCloneSafe(handle: SecretHandle): object {
  return { ...handle };
}
