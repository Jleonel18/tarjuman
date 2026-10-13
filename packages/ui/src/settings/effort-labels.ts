import type { Effort } from "@tarjuman/core";

const KEYS: Partial<Record<Effort, string>> = {
  low: "effort.low",
  medium: "effort.medium",
  high: "effort.high",
};

/** Catalog key for an effort level. Levels v1 does not offer fall back to the medium label. */
export function effortLabelKey(effort: Effort): string {
  return KEYS[effort] ?? "effort.medium";
}
