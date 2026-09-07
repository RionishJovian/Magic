import { describe, expect, it } from "vitest";
import { asCoord, hasCoords, normalizeSiteCoords, roundCoord } from "@/lib/sites-coords";

describe("asCoord", () => {
  it("keeps finite numbers", () => {
    expect(asCoord(16.8409)).toBe(16.8409);
    expect(asCoord(0)).toBe(0);
  });

  it("coerces PostgREST numeric strings", () => {
    expect(asCoord("16.8409")).toBe(16.8409);
    expect(asCoord("-96.1735")).toBe(-96.1735);
  });

  it("rejects nullish, empty, and non-finite values", () => {
    expect(asCoord(null)).toBeNull();
    expect(asCoord(undefined)).toBeNull();
    expect(asCoord("")).toBeNull();
    expect(asCoord("not-a-number")).toBeNull();
    expect(asCoord(Number.NaN)).toBeNull();
    expect(asCoord(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("normalizeSiteCoords", () => {
  it("turns string lat/lng into numbers so map pins can render", () => {
    const row = normalizeSiteCoords({
      id: "s1",
      name: "Café",
      latitude: "16.840900",
      longitude: "96.173500",
    });
    expect(row.latitude).toBe(16.8409);
    expect(row.longitude).toBe(96.1735);
    expect(typeof row.latitude).toBe("number");
    expect(typeof row.longitude).toBe("number");
  });

  it("keeps missing coordinates as null", () => {
    const row = normalizeSiteCoords({
      id: "s2",
      name: "Unset",
      latitude: null,
      longitude: undefined,
    });
    expect(row.latitude).toBeNull();
    expect(row.longitude).toBeNull();
  });
});

describe("hasCoords", () => {
  it("accepts string coordinates the way PostgREST returns numeric columns", () => {
    expect(hasCoords({ latitude: "16.84", longitude: "96.17" })).toBe(true);
  });

  it("rejects sites that only have one coordinate", () => {
    expect(hasCoords({ latitude: 16.84, longitude: null })).toBe(false);
    expect(hasCoords({ latitude: null, longitude: 96.17 })).toBe(false);
  });

  it("is the gate SitesMap uses before drawing markers", () => {
    const fromDb = [
      { id: "a", latitude: "16.84", longitude: "96.17" },
      { id: "b", latitude: null, longitude: null },
      { id: "c", latitude: 17.1, longitude: 96.2 },
    ];
    // Old broken filter: typeof === "number" would drop PostgREST strings.
    const broken = fromDb.filter(
      (s) => typeof s.latitude === "number" && typeof s.longitude === "number",
    );
    expect(broken.map((s) => s.id)).toEqual(["c"]);

    const fixed = fromDb.filter(hasCoords);
    expect(fixed.map((s) => s.id)).toEqual(["a", "c"]);
  });
});

describe("roundCoord", () => {
  it("rounds to 6 decimal places for stable map drafts", () => {
    expect(roundCoord(16.840912345)).toBe(16.840912);
  });
});
