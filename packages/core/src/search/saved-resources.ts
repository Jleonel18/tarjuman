import type { StoragePort } from "../ports/storage";
import type { ResourceCard, StoredResourceCard } from "./resource-card";

/** A resource the learner chose to keep (005 US4). Stored in `saved_resources`; never written by a tool. */
export interface SavedResource {
  /** `<sourceId>:<externalId>`: saving the same video twice keeps one. */
  id: string;
  /** The card with the labels it had when it was found. Ages like any other (30 days). */
  card: StoredResourceCard;
  /** ISO date. */
  savedAt: string;
}

export function savedId(of: { sourceId: string; externalId: string }): string {
  return `${of.sourceId}:${of.externalId}`;
}

export interface SavedResourcesDeps {
  storage: StoragePort;
  now: () => string;
}

/**
 * The saved list. Saving is always an explicit click in the UI; no tool has storage access to this
 * collection (the capability schema does not list it), so a model can never save or change one.
 */
export class SavedResourcesStore {
  readonly #deps: SavedResourcesDeps;

  constructor(deps: SavedResourcesDeps) {
    this.#deps = deps;
  }

  /** Keeps the first copy: saving a video that is already saved changes nothing. */
  async save(card: ResourceCard): Promise<void> {
    const id = savedId(card);
    if ((await this.#deps.storage.get("saved_resources", id)) !== undefined) return;
    const saved: SavedResource = { id, card, savedAt: this.#deps.now() };
    await this.#deps.storage.put("saved_resources", saved);
  }

  async remove(of: { sourceId: string; externalId: string }): Promise<void> {
    await this.#deps.storage.delete("saved_resources", savedId(of));
  }

  /** Newest first. */
  async list(): Promise<SavedResource[]> {
    const all = await this.#deps.storage.query<SavedResource>("saved_resources");
    return all.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0));
  }

  /** The ids of every saved resource, for showing Saved on a card. */
  async savedIds(): Promise<Set<string>> {
    return new Set((await this.list()).map((saved) => saved.id));
  }
}
