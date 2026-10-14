import { describe, expect, it } from "vitest";
import { KeyManager } from "../../src/credentials/key-manager";
import type { CredentialValidator } from "../../src/pipeline/credential-validation";
import type { ProviderErrorCode, ValidationResult } from "../../src/ports/provider";
import { sealSecret, type SecretHandle } from "../../src/ports/secret-handle";
import type {
  CredentialDescription,
  CredentialMeta,
  CredentialStorageMode,
  CredentialStore,
} from "../../src/ports/storage";

const KEY = "sk-ant-api03-SECRETSECRETSECRET-a1b2";

class FakeValidator implements CredentialValidator {
  calls = 0;
  constructor(
    private readonly result: ValidationResult,
    private readonly log: string[] = [],
  ) {}
  async validate(): Promise<ValidationResult> {
    this.calls += 1;
    this.log.push("validate");
    return this.result;
  }
}

/** Keeps one current credential, like the real store, and logs every call in order. */
class FakeStore implements CredentialStore {
  saved: { secret: string; mode: CredentialStorageMode; meta: CredentialMeta }[] = [];
  current: { secret: string; mode: CredentialStorageMode; meta: CredentialMeta } | undefined;
  constructor(readonly log: string[] = []) {}
  async save(secret: string, mode: CredentialStorageMode, meta: CredentialMeta): Promise<void> {
    this.log.push("save");
    this.saved.push({ secret, mode, meta });
    this.current = { secret, mode, meta };
  }
  async load(): Promise<SecretHandle | undefined> {
    return this.current === undefined ? undefined : sealSecret(this.current.secret);
  }
  async describe(): Promise<CredentialDescription | undefined> {
    if (this.current === undefined) return undefined;
    return { ...this.current.meta, storageMode: this.current.mode, validatedAt: "2026-10-13T00:00:00.000Z" };
  }
  async remove(): Promise<void> {
    this.log.push("remove");
    this.current = undefined;
  }
}

function manager(result: ValidationResult, store = new FakeStore()) {
  const validator = new FakeValidator(result);
  return { keys: new KeyManager({ validator, store, providerId: "anthropic" }), validator, store };
}

describe("KeyManager.enter", () => {
  it("starts absent", () => {
    expect(manager({ ok: true }).keys.state).toBe("absent");
  });

  it("stores the key only after a valid result, in the chosen mode, with a masked hint", async () => {
    const { keys, store } = manager({ ok: true });
    const outcome = await keys.enter(KEY, "persistent");
    expect(outcome).toEqual({ ok: true, maskedHint: "sk-ant-…a1b2" });
    expect(keys.state).toBe("stored");
    expect(store.saved).toHaveLength(1);
    expect(store.saved[0]?.mode).toBe("persistent");
    expect(store.saved[0]?.meta).toEqual({ providerId: "anthropic", maskedHint: "sk-ant-…a1b2" });
  });

  it("passes session mode through", async () => {
    const { keys, store } = manager({ ok: true });
    await keys.enter(KEY, "session");
    expect(store.saved[0]?.mode).toBe("session");
  });

  it.each<ProviderErrorCode>(["invalid_credential", "permission_denied", "quota_exhausted", "network"])(
    "never stores a rejected key (%s)",
    async (code) => {
      const { keys, store } = manager({ ok: false, code });
      const outcome = await keys.enter(KEY, "persistent");
      expect(outcome).toEqual({ ok: false, code });
      expect(keys.state).toBe("rejected");
      expect(store.saved).toEqual([]);
    },
  );

  it("never exposes the key in the outcome or the hint", async () => {
    const { keys } = manager({ ok: true });
    const outcome = await keys.enter(KEY, "session");
    expect(JSON.stringify(outcome)).not.toContain("SECRETSECRET");
  });

  it("rejects an empty key without calling the validator", async () => {
    const { keys, validator, store } = manager({ ok: true });
    const outcome = await keys.enter("   ", "session");
    expect(outcome).toEqual({ ok: false, code: "invalid_credential" });
    expect(validator.calls).toBe(0);
    expect(store.saved).toEqual([]);
  });

  it("trims whitespace around a pasted key", async () => {
    const { keys, store } = manager({ ok: true });
    await keys.enter(`  ${KEY}\n`, "session");
    expect(store.saved[0]?.secret).toBe(KEY);
  });

  it("is validating while the check is in flight, and can retry after a rejection", async () => {
    let release: (r: ValidationResult) => void = () => {};
    const validator: CredentialValidator = {
      validate: () => new Promise((resolve) => (release = resolve)),
    };
    const store = new FakeStore();
    const keys = new KeyManager({ validator, store, providerId: "anthropic" });
    const pending = keys.enter(KEY, "session");
    expect(keys.state).toBe("validating");
    release({ ok: false, code: "network" });
    await pending;
    expect(keys.state).toBe("rejected");
    const again = keys.enter(KEY, "session");
    release({ ok: true });
    await again;
    expect(keys.state).toBe("stored");
    expect(store.saved).toHaveLength(1);
  });
});

const NEW_KEY = "sk-ant-api03-NEWSECRETNEWSECRET-c3d4";

/** A manager holding a stored `KEY`, whose validator answers the next check with `next`. */
async function storedManager(next: ValidationResult) {
  const log: string[] = [];
  const store = new FakeStore(log);
  const results: ValidationResult[] = [{ ok: true }, next];
  const validator: CredentialValidator = {
    validate: async () => {
      log.push("validate");
      return results.shift() ?? { ok: false, code: "unknown" };
    },
  };
  const keys = new KeyManager({ validator, store, providerId: "anthropic" });
  await keys.enter(KEY, "persistent");
  log.length = 0;
  return { keys, store, log };
}

describe("KeyManager.replace", () => {
  it("goes stored → validating → stored, and the new key replaces the old one", async () => {
    const { keys, store } = await storedManager({ ok: true });
    expect(keys.state).toBe("stored");
    const pending = keys.replace(NEW_KEY, "session");
    expect(keys.state).toBe("validating");
    const outcome = await pending;
    expect(outcome).toEqual({ ok: true, maskedHint: "sk-ant-…c3d4" });
    expect(keys.state).toBe("stored");
    expect(store.current?.secret).toBe(NEW_KEY);
    expect(store.current?.mode).toBe("session");
  });

  it("removes the old key only after the new key validates, then stores the new one", async () => {
    const { keys, log } = await storedManager({ ok: true });
    await keys.replace(NEW_KEY, "persistent");
    expect(log).toEqual(["validate", "remove", "save"]);
  });

  it("leaves no trace of the old key once replaced", async () => {
    const { keys, store } = await storedManager({ ok: true });
    await keys.replace(NEW_KEY, "persistent");
    expect(JSON.stringify(await store.describe())).not.toContain("a1b2");
    expect(JSON.stringify(store.current)).not.toContain("SECRETSECRET");
  });

  it.each<ProviderErrorCode>(["invalid_credential", "network"])(
    "keeps the old key when the replacement is rejected (%s)",
    async (code) => {
      const { keys, store, log } = await storedManager({ ok: false, code });
      const outcome = await keys.replace(NEW_KEY, "persistent");
      expect(outcome).toEqual({ ok: false, code });
      expect(keys.state).toBe("stored");
      expect(store.current?.secret).toBe(KEY);
      expect(log).toEqual(["validate"]);
    },
  );

  it("keeps the old key when the replacement is empty, without calling the validator", async () => {
    const { keys, store, log } = await storedManager({ ok: true });
    const outcome = await keys.replace("  ", "persistent");
    expect(outcome).toEqual({ ok: false, code: "invalid_credential" });
    expect(keys.state).toBe("stored");
    expect(store.current?.secret).toBe(KEY);
    expect(log).toEqual([]);
  });
});

describe("KeyManager.remove", () => {
  it("goes stored → absent and leaves nothing in the store", async () => {
    const { keys, store, log } = await storedManager({ ok: true });
    await keys.remove();
    expect(keys.state).toBe("absent");
    expect(log).toEqual(["remove"]);
    expect(await store.describe()).toBeUndefined();
    expect(await store.load()).toBeUndefined();
  });

  it("a new key can be entered after removal", async () => {
    const { keys, store } = await storedManager({ ok: true });
    await keys.remove();
    await keys.enter(NEW_KEY, "session");
    expect(keys.state).toBe("stored");
    expect(store.current?.secret).toBe(NEW_KEY);
  });
});
