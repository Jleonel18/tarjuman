import type { StoragePort } from "../ports/storage";

/** One agreement to send searches to a source under a given version of its terms. */
export interface SearchConsent {
  sourceId: string;
  /** ISO date. */
  agreedAt: string;
  termsVersion: string;
}

/** Stored in the `settings` collection under id `search`. Removed by "delete all my data". */
export interface SearchSettings {
  id: "search";
  /** When false, no search is made at all (FR-018). */
  enabled: boolean;
  consent: SearchConsent[];
}

export interface SearchSettingsDeps {
  storage: StoragePort;
  now: () => string;
}

const ID = "search";

/**
 * Reads and writes the learner's search choices. A source is searched only with consent for the
 * current `termsVersion` of that source (FR-019); bumping the version asks again.
 */
export class SearchSettingsStore {
  readonly #deps: SearchSettingsDeps;

  constructor(deps: SearchSettingsDeps) {
    this.#deps = deps;
  }

  /** The stored settings, or the defaults. Never writes. A malformed record reads as the default. */
  async read(): Promise<SearchSettings> {
    const stored = await this.#deps.storage.get<unknown>("settings", ID);
    return normalize(stored);
  }

  async isEnabled(): Promise<boolean> {
    return (await this.read()).enabled;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    const current = await this.read();
    await this.#deps.storage.put("settings", { ...current, enabled });
  }

  async hasConsent(sourceId: string, termsVersion: string): Promise<boolean> {
    const { consent } = await this.read();
    return consent.some((entry) => entry.sourceId === sourceId && entry.termsVersion === termsVersion);
  }

  /** Replaces any earlier agreement for the source. */
  async recordConsent(sourceId: string, termsVersion: string): Promise<void> {
    const current = await this.read();
    const others = current.consent.filter((entry) => entry.sourceId !== sourceId);
    await this.#deps.storage.put("settings", {
      ...current,
      consent: [...others, { sourceId, agreedAt: this.#deps.now(), termsVersion }],
    });
  }
}

function normalize(value: unknown): SearchSettings {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const consent = Array.isArray(record["consent"]) ? record["consent"].filter(isConsent) : [];
  return { id: ID, enabled: typeof record["enabled"] === "boolean" ? record["enabled"] : true, consent };
}

function isConsent(value: unknown): value is SearchConsent {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry["sourceId"] === "string" && typeof entry["agreedAt"] === "string" && typeof entry["termsVersion"] === "string"
  );
}
