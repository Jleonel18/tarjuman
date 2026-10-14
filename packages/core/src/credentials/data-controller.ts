import { destroySecret } from "../ports/secret-handle";
import type { CredentialStore, StoragePort } from "../ports/storage";

export interface DataControllerDeps {
  storage: StoragePort;
  credentials: CredentialStore;
}

/** `not_verified`: some step failed or could not be confirmed, so the app must not claim success. */
export type DeleteAllOutcome = { ok: true } | { ok: false; code: "not_verified" };

/**
 * "Delete all my data" (FR-017, SC-007). Removes the key (stored or session-only, which also drops
 * the in-memory secret), checks it is gone, then drops all storage, which verifies its own
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
      await credentials.remove();
      if ((await credentials.describe()) !== undefined) verified = false;
      const leftover = await credentials.load();
      if (leftover !== undefined) {
        destroySecret(leftover);
        verified = false;
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
