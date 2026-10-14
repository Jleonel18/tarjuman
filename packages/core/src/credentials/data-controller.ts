import { destroySecret } from "../ports/secret-handle";
import type { CredentialStore, StoragePort } from "../ports/storage";

export interface DataControllerDeps {
  storage: StoragePort;
  credentials: CredentialStore;
  /** Every provider the app offers; each one's key is checked to be gone (004 SC-007). */
  providerIds: readonly string[];
}

/** `not_verified`: some step failed or could not be confirmed, so the app must not claim success. */
export type DeleteAllOutcome = { ok: true } | { ok: false; code: "not_verified" };

/**
 * "Delete all my data" (FR-017, SC-007). Removes every provider's key (stored or session-only, which
 * also drops the in-memory secrets), checks they are gone, then drops all storage, which verifies its own
 * emptiness. Every step runs even if an earlier one failed, so as much as possible is removed, and
 * any failure is reported instead of success.
 */
export class DataController {
  readonly #deps: DataControllerDeps;

  constructor(deps: DataControllerDeps) {
    this.#deps = deps;
  }

  async deleteAll(): Promise<DeleteAllOutcome> {
    const { storage, credentials } = this.#deps;
    let verified = true;

    // The key is checked before storage is dropped: reading it afterwards would reopen, and so
    // recreate, the database that `clearAll` has just deleted.
    try {
      await credentials.removeAll();
      if ((await credentials.list()).length > 0) verified = false;
      // Each provider is also loaded directly, so a store whose list misses an entry is still caught.
      for (const providerId of this.#deps.providerIds) {
        const leftover = await credentials.load(providerId);
        if (leftover !== undefined) {
          destroySecret(leftover);
          verified = false;
        }
      }
    } catch {
      verified = false;
    }

    try {
      await storage.clearAll();
    } catch {
      verified = false;
    }

    return verified ? { ok: true } : { ok: false, code: "not_verified" };
  }
}
