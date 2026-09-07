/**
 * PostgREST returns Postgres `numeric` columns as JSON strings.
 * Coerce site lat/lng so map markers and saves always see real numbers.
 */
export function asCoord(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeSiteCoords<T extends { latitude?: unknown; longitude?: unknown }>(
  site: T,
): T & { latitude: number | null; longitude: number | null } {
  return {
    ...site,
    latitude: asCoord(site.latitude),
    longitude: asCoord(site.longitude),
  };
}

export function hasCoords(site: { latitude: unknown; longitude: unknown }): boolean {
  return asCoord(site.latitude) != null && asCoord(site.longitude) != null;
}

export function roundCoord(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
