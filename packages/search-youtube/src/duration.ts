const ISO_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/**
 * Seconds from an ISO 8601 duration such as `PT1H2M3S` or `P1DT1H`. `null` for anything else and for
 * zero (`P0D` is what a live stream reports), so a card never shows "0:00".
 */
export function parseDuration(value: string | undefined): number | null {
  if (value === undefined) return null;
  const match = ISO_DURATION.exec(value);
  if (!match || value === "P" || value.endsWith("T")) return null;
  const [, days, hours, minutes, seconds] = match.map((part) => (part === undefined ? 0 : Number(part)));
  const total = (days ?? 0) * 86_400 + (hours ?? 0) * 3_600 + (minutes ?? 0) * 60 + (seconds ?? 0);
  return total > 0 ? total : null;
}
