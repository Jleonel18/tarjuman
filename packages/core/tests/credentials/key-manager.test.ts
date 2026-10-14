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
  providers: string[] = [];
  async validate(providerId: string): Promise<ValidationResult> {
    this.calls += 1;
    this.providers.push(providerId);
    this.log.push("validate");
    return this.result;
  }
}

/** Keeps one credential per provider, like the real store, and logs every call in order. */
class FakeStore implements CredentialStore {
  saved: { secret: string; mode: CredentialStorageMode; meta: CredentialMeta }[] = [];
  readonly byProvider = new Map<string, { secret: string; mode: CredentialStorageMode; meta: CredentialMeta }>();
  constructor(readonly log: string[] = []) {}
  /** The Anthropic entry, which most tests use. */
  get current() {
    return this.byProvider.get("anthropic");
  }
  async save(secret: string, mode: CredentialStorageMode, meta: CredentialMeta): Promise<void> {
    this.log.push("save");
    this.saved.push({ secret, mode, meta });
    this.byProvider.set(meta.providerId, { secret, mode, meta });
  }
  async load(providerId: string): Promise<SecretHandle | undefined> {
    const entry = this.byProvider.get(providerId);
    return entry === undefined ? undefined : sealSecret(entry.secret);
  }
  async describe(providerId: string): Promise<CredentialDescription | undefined> {
    const entry = this.byProvider.get(providerId);
    if (entry === undefined) return undefined;
    return { ...entry.meta, storageMode: entry.mode, validatedAt: "2026-10-13T00:00:00.000Z" };
  }
  async list(): Promise<CredentialDescription[]> {
    const out: CredentialDescription[] = [];
    for (const id of this.byProvider.keys()) out.push((await this.describe(id))!);
    return out;
  }
  async remove(providerId: string): Promise<void> {
    this.log.push("remove");
    this.byProvider.delete(providerId);
  }
  async removeAll(): Promise<void> {
    this.log.push("removeAll");
    this.byProvider.clear();
  }
}

function manager(result: ValidationResult, store = new FakeStore()) {
  const validator = new FakeValidator(result);
  return { keys: new KeyManager({ validator, store }), validator, store };
}

describe("KeyManager.enter", () => {
  it("starts absent", () => {
    expect(manager({ ok: true }).keys.stateOf("anthropic")).toBe("absent");
  });

  it("stores the key only after a valid result, in the chosen mode, with a masked hint", async () => {
    const { keys, store } = manager({ ok: true });
    const outcome = await keys.enter("anthropic", KEY, "persistent");
    expect(outcome).toEqual({ ok: true, maskedHint: "sk-ant-…a1b2" });
    expect(keys.stateOf("anthropic")).toBe("stored");
    expect(store.saved).toHaveLength(1);
    expect(store.saved[0]?.mode).toBe("persistent");
    expect(store.saved[0]?.meta).toEqual({ providerId: "anthropic", maskedHint: "sk-ant-…a1b2" });
  });

  it("passes session mode through", async () => {
    const { keys, store } = manager({ ok: true });
    await keys.enter("anthropic", KEY, "session");
    expect(store.saved[0]?.mode).toBe("session");
  });

  it.each<ProviderErrorCode>(["invalid_credential", "permission_denied", "quota_exhausted", "network"])(
    "never stores a rejected key (%s)",
    async (code) => {
      const { keys, store } = manager({ ok: false, code });
      const outcome = await keys.enter("anthropic", KEY, "persistent");
      expect(outcome).toEqual({ ok: false, code });
      expect(keys.stateOf("anthropic")).toBe("rejected");
      expect(store.saved).toEqual([]);
    },
  );

  it("never exposes the key in the outcome or the hint", async () => {
    const { keys } = manager({ ok: true });
    const outcome = await keys.enter("anthropic", KEY, "session");
    expect(JSON.stringify(outcome)).not.toContain("SECRETSECRET");
  });

  it("rejects an empty key without calling the validator", async () => {
    const { keys, validator, store } = manager({ ok: true });
    const outcome = await keys.enter("anthropic", "   ", "session");
    expect(outcome).toEqual({ ok: false, code: "invalid_credential" });
    expect(validator.calls).toBe(0);
    expect(store.saved).toEqual([]);
  });

  it("trims whitespace around a pasted key", async () => {
    const { keys, store } = manager({ ok: true });
    await keys.enter("anthropic", `  ${KEY}\n`, "session");
    expect(store.saved[0]?.secret).toBe(KEY);
  });

  it("is validating while the check is in flight, and can retry after a rejection", async () => {
    let release: (r: ValidationResult) => void = () => {};
    const validator: CredentialValidator = {
      validate: () => new Promise((resolve) => (release = resolve)),
    };
    const store = new FakeStore();
    const keys = new KeyManager({ validator, store });
    const pending = keys.enter("anthropic", KEY, "session");
    expect(keys.stateOf("anthropic")).toBe("validating");
    release({ ok: false, code: "network" });
    await pending;
    expect(keys.stateOf("anthropic")).toBe("rejected");
    const again = keys.enter("anthropic", KEY, "session");
    release({ ok: true });
    await again;
    expect(keys.stateOf("anthropic")).toBe("stored");
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
  const keys = new KeyManager({ validator, store });
  await keys.enter("anthropic", KEY, "persistent");
  log.length = 0;
  return { keys, store, log };
}

describe("KeyManager.replace", () => {
  it("goes stored → validating → stored, and the new key replaces the old one", async () => {
    const { keys, store } = await storedManager({ ok: true });
    expect(keys.stateOf("anthropic")).toBe("stored");
    const pending = keys.replace("anthropic", NEW_KEY, "session");
    expect(keys.stateOf("anthropic")).toBe("validating");
    const outcome = await pending;
    expect(outcome).toEqual({ ok: true, maskedHint: "sk-ant-…c3d4" });
    expect(keys.stateOf("anthropic")).toBe("stored");
    expect(store.current?.secret).toBe(NEW_KEY);
    expect(store.current?.mode).toBe("session");
  });

  it("removes the old key only after the new key validates, then stores the new one", async () => {
    const { keys, log } = await storedManager({ ok: true });
    await keys.replace("anthropic", NEW_KEY, "persistent");
    expect(log).toEqual(["validate", "remove", "save"]);
  });

  it("leaves no trace of the old key once replaced", async () => {
    const { keys, store } = await storedManager({ ok: true });
    await keys.replace("anthropic", NEW_KEY, "persistent");
    expect(JSON.stringify(await store.describe("anthropic"))).not.toContain("a1b2");
    expect(JSON.stringify(store.current)).not.toContain("SECRETSECRET");
  });

  it.each<ProviderErrorCode>(["invalid_credential", "network"])(
    "keeps the old key when the replacement is rejected (%s)",
    async (code) => {
      const { keys, store, log } = await storedManager({ ok: false, code });
      const outcome = await keys.replace("anthropic", NEW_KEY, "persistent");
      expect(outcome).toEqual({ ok: false, code });
      expect(keys.stateOf("anthropic")).toBe("stored");
      expect(store.current?.secret).toBe(KEY);
      expect(log).toEqual(["validate"]);
    },
  );

  it("keeps the old key when the replacement is empty, without calling the validator", async () => {
    const { keys, store, log } = await storedManager({ ok: true });
    const outcome = await keys.replace("anthropic", "  ", "persistent");
    expect(outcome).toEqual({ ok: false, code: "invalid_credential" });
    expect(keys.stateOf("anthropic")).toBe("stored");
    expect(store.current?.secret).toBe(KEY);
    expect(log).toEqual([]);
  });
});

describe("KeyManager.remove", () => {
  it("goes stored → absent and leaves nothing in the store", async () => {
    const { keys, store, log } = await storedManager({ ok: true });
    await keys.remove("anthropic");
    expect(keys.stateOf("anthropic")).toBe("absent");
    expect(log).toEqual(["remove"]);
    expect(await store.describe("anthropic")).toBeUndefined();
    expect(await store.load("anthropic")).toBeUndefined();
  });

  it("a new key can be entered after removal", async () => {
    const { keys, store } = await storedManager({ ok: true });
    await keys.remove("anthropic");
    await keys.enter("anthropic", NEW_KEY, "session");
    expect(keys.stateOf("anthropic")).toBe("stored");
    expect(store.current?.secret).toBe(NEW_KEY);
  });
});

// Fake keys only (004): shapes from data-model.md → KeyShape.
const GEMINI_KEY = "AQ.FAKEkeyMANAGERgeminiKEYfakeFAKEfake_-fakeFAKE0001";
const OTHER_GEMINI_KEY = "AIzaFAKEkeyMANAGERstandardKEY_-00000002";

describe("KeyManager across providers (004 FR-004, FR-007)", () => {
  it.each([
    ["a Gemini key for Anthropic", "anthropic", GEMINI_KEY, "gemini"],
    ["a standard Gemini key for Anthropic", "anthropic", OTHER_GEMINI_KEY, "gemini"],
    ["an Anthropic key for Gemini", "gemini", KEY, "anthropic"],
  ])("rejects %s locally, without any validation call", async (_name, provider, key, expected) => {
    const { keys, validator, store } = manager({ ok: true });
    const outcome = await keys.enter(provider, key, "persistent");
    expect(outcome).toEqual({ ok: false, code: "wrong_provider", expectedProviderId: expected });
    expect(validator.calls).toBe(0);
    expect(store.saved).toEqual([]);
    expect(keys.stateOf(provider)).toBe("rejected");
    expect(JSON.stringify(outcome)).not.toContain(key);
  });

  it.each([
    ["an Anthropic key for YouTube", KEY, "anthropic"],
    ["a Gemini auth key (AQ.) for YouTube", GEMINI_KEY, "gemini"],
  ])("rejects %s locally, with no validation call (005)", async (_name, key, expected) => {
    const { keys, validator, store } = manager({ ok: true });
    const outcome = await keys.enter("youtube", key, "persistent");
    expect(outcome).toEqual({ ok: false, code: "wrong_provider", expectedProviderId: expected });
    expect(validator.calls).toBe(0);
    expect(store.saved).toEqual([]);
  });

  it("accepts an AIza key for both gemini and youtube, each stored under its own id (005)", async () => {
    const { keys, validator, store } = manager({ ok: true });
    expect(await keys.enter("youtube", OTHER_GEMINI_KEY, "session")).toEqual({ ok: true, maskedHint: "AIza…0002" });
    expect(await keys.enter("gemini", OTHER_GEMINI_KEY, "session")).toEqual({ ok: true, maskedHint: "AIza…0002" });
    expect(validator.providers).toEqual(["youtube", "gemini"]);
    expect([...store.byProvider.keys()].sort()).toEqual(["gemini", "youtube"]);
  });

  it("rejects an AIza key for Anthropic (005)", async () => {
    const { keys } = manager({ ok: true });
    expect(await keys.enter("anthropic", OTHER_GEMINI_KEY, "session")).toEqual({
      ok: false,
      code: "wrong_provider",
      expectedProviderId: "gemini",
    });
  });

  it("checks the shape on replace too, and keeps the old key", async () => {
    const { keys, store, log } = await storedManager({ ok: true });
    const outcome = await keys.replace("anthropic", GEMINI_KEY, "persistent");
    expect(outcome).toEqual({ ok: false, code: "wrong_provider", expectedProviderId: "gemini" });
    expect(log).toEqual([]);
    expect(store.current?.secret).toBe(KEY);
    expect(keys.stateOf("anthropic")).toBe("stored");
  });

  it("does not judge shapes for a provider with no known key shape (dev and test providers)", async () => {
    const { keys, validator } = manager({ ok: true });
    expect(await keys.enter("mock", KEY, "session")).toEqual({ ok: true, maskedHint: "sk-ant-…a1b2" });
    expect(validator.providers).toEqual(["mock"]);
  });

  it("validates a key of unknown shape against the given provider only", async () => {
    const { keys, validator, store } = manager({ ok: true });
    await keys.enter("gemini", "an-unknown-shape-1234", "session");
    expect(validator.providers).toEqual(["gemini"]);
    expect(store.saved[0]?.meta).toEqual({ providerId: "gemini", maskedHint: "…1234" });
  });

  it("stores a Gemini key under gemini with a Gemini mask", async () => {
    const { keys, store } = manager({ ok: true });
    const outcome = await keys.enter("gemini", GEMINI_KEY, "persistent");
    expect(outcome).toEqual({ ok: true, maskedHint: "AQ.…0001" });
    expect(store.byProvider.get("gemini")?.meta).toEqual({ providerId: "gemini", maskedHint: "AQ.…0001" });
  });

  it("replacing or removing one provider's key leaves the other's untouched", async () => {
    const { keys, store } = manager({ ok: true });
    await keys.enter("anthropic", KEY, "persistent");
    await keys.enter("gemini", GEMINI_KEY, "session");

    await keys.replace("gemini", OTHER_GEMINI_KEY, "persistent");
    expect(store.byProvider.get("anthropic")?.secret).toBe(KEY);
    expect(store.byProvider.get("gemini")?.secret).toBe(OTHER_GEMINI_KEY);

    await keys.remove("gemini");
    expect(store.byProvider.has("gemini")).toBe(false);
    expect(store.byProvider.get("anthropic")?.secret).toBe(KEY);
    expect(keys.stateOf("gemini")).toBe("absent");
    expect(keys.stateOf("anthropic")).toBe("stored");
  });

  it("a failed replacement keeps that provider's old key", async () => {
    const store = new FakeStore();
    const results: ValidationResult[] = [{ ok: true }, { ok: false, code: "invalid_credential" }];
    const keys = new KeyManager({ validator: { validate: async () => results.shift()! }, store });
    await keys.enter("gemini", GEMINI_KEY, "persistent");
    expect(await keys.replace("gemini", OTHER_GEMINI_KEY, "persistent")).toEqual({ ok: false, code: "invalid_credential" });
    expect(store.byProvider.get("gemini")?.secret).toBe(GEMINI_KEY);
  });
});
