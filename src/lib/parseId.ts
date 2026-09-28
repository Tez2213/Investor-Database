/** Parses a positive integer id from a route param or JSON value; null when invalid. */
export function parseId(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && !/^\d+$/.test(value.trim())) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
