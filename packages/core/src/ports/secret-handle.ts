/**
 * Opaque holder for the user's API key (FR-014, Principle V).
 *
 * The secret lives in a private WeakMap (`secret-store.ts`), so the handle has no field to read,
 * enumerate, log, or serialize. Everything that could stringify it throws. Only adapters may
 * import `secret-unseal.ts`; the `unseal-secret-only-in-adapters` rule in
 * `.dependency-cruiser.cjs` enforces that. Importing `SecretHandle` itself is fine anywhere.
 */
import { secretStore } from "./secret-store";

const REFUSAL = "SecretHandle cannot be serialized, logged, or converted to a string.";

export class SecretHandle {
  /** Nominal brand so no other object type is assignable to a SecretHandle. */
  declare private readonly __secretHandle: never;

  private constructor() {
    Object.freeze(this);
  }

  /** Wraps a secret. Use the `sealSecret` function instead of calling this directly. */
  static create(secret: string): SecretHandle {
    const handle = new SecretHandle();
    secretStore.set(handle, secret);
    return handle;
  }

  toString(): never {
    throw new Error(REFUSAL);
  }

  toJSON(): never {
    throw new Error(REFUSAL);
  }

  [Symbol.toPrimitive](): never {
    throw new Error(REFUSAL);
  }
}

export function sealSecret(secret: string): SecretHandle {
  return SecretHandle.create(secret);
}

/** Drops the secret held by a handle, e.g. when a session ends or a key is deleted. */
export function destroySecret(handle: SecretHandle): void {
  secretStore.delete(handle);
}
