import { describe, expect, it } from "vitest";
import { KeyManager } from "../../src/credentials/key-manager";
import type { CredentialValidator } from "../../src/pipeline/credential-validation";
import type { ProviderErrorCode, ValidationResult } from "../../src/ports/provider";
import type { SecretHandle } from "../../src/ports/secret-handle";
import type {
  CredentialDescription,
  CredentialMeta,
  CredentialStorageMode,
  CredentialStore,
} from "../../src/ports/storage";

const KEY = "sk-ant-api03-SECRETSECRETSECRET-a1b2";

class FakeValidator implements CredentialValidator {
  calls = 0;
  constructor(private readonly result: ValidationResult) {}
  async validate(): Promise<ValidationResult> {
    this.calls += 1;
    return this.result;
  }
}

class FakeStore implements CredentialStore {
  saved: { secret: string; mode: CredentialStorageMode; meta: CredentialMeta }[] = [];
  async save(secret: string, mode: CredentialStorageMode, meta: CredentialMeta): Promise<void> {
    this.saved.push({ secret, mode, meta });
  }
  async load(): Promise<SecretHandle | undefined> {
    return undefined;
  }
  async describe(): Promise<CredentialDescription | undefined> {
    return undefined;
  }
  async remove(): Promise<void> {}
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
