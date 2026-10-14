import { sealSecret, type SecretHandle } from "../../src/ports/secret-handle";
import type {
  CredentialDescription,
  CredentialMeta,
  CredentialStorageMode,
  CredentialStore,
} from "../../src/ports/storage";

/** Keeps one credential per id, like the real store. Test-only: it holds raw keys in memory. */
export class MemoryCredentials implements CredentialStore {
  readonly byId = new Map<string, { secret: string; mode: CredentialStorageMode; meta: CredentialMeta }>();
  loads: string[] = [];

  constructor(initial: Record<string, string> = {}) {
    for (const [providerId, secret] of Object.entries(initial)) {
      this.byId.set(providerId, { secret, mode: "session", meta: { providerId, maskedHint: "hint" } });
    }
  }

  async save(secret: string, mode: CredentialStorageMode, meta: CredentialMeta): Promise<void> {
    this.byId.set(meta.providerId, { secret, mode, meta });
  }
  async load(providerId: string): Promise<SecretHandle | undefined> {
    this.loads.push(providerId);
    const entry = this.byId.get(providerId);
    return entry === undefined ? undefined : sealSecret(entry.secret);
  }
  async describe(providerId: string): Promise<CredentialDescription | undefined> {
    const entry = this.byId.get(providerId);
    return entry === undefined
      ? undefined
      : { ...entry.meta, storageMode: entry.mode, validatedAt: "2026-10-14T00:00:00.000Z" };
  }
  async list(): Promise<CredentialDescription[]> {
    const out: CredentialDescription[] = [];
    for (const id of this.byId.keys()) out.push((await this.describe(id))!);
    return out;
  }
  async remove(providerId: string): Promise<void> {
    this.byId.delete(providerId);
  }
  async removeAll(): Promise<void> {
    this.byId.clear();
  }
}
