/**
 * RouterOS REST returns a single JSON object when a menu has exactly one row.
 * Normalize so list callers can always use .find / .map / .filter.
 */
export function normalizeRestList<T>(value: unknown): T[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value as T[];
  if (typeof value === "object") return [value as T];
  return [];
}
