import { MAX_INTERESTS, MAX_INTEREST_LENGTH } from "@tarjuman/core";

export type AddInterestFailure = "blank" | "too_long" | "too_many" | "duplicate";

export type AddInterestResult =
  | { ok: true; interests: string[] }
  | { ok: false; reason: AddInterestFailure };

/**
 * Adds one interest to the list, enforcing the same limits the profile validation enforces
 * (0 to 10 items, each at most 60 characters), so the form can say why before submitting.
 */
export function addInterest(current: readonly string[], raw: string): AddInterestResult {
  const text = raw.trim();
  if (text === "") return { ok: false, reason: "blank" };
  if ([...text].length > MAX_INTEREST_LENGTH) return { ok: false, reason: "too_long" };
  if (current.length >= MAX_INTERESTS) return { ok: false, reason: "too_many" };
  if (current.some((existing) => existing.toLowerCase() === text.toLowerCase())) {
    return { ok: false, reason: "duplicate" };
  }
  return { ok: true, interests: [...current, text] };
}

export function removeInterest(current: readonly string[], interest: string): string[] {
  return current.filter((existing) => existing !== interest);
}
