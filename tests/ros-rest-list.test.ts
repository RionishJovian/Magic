import { describe, expect, it } from "vitest";
import { normalizeRestList } from "@/lib/ros-rest-list";

describe("normalizeRestList", () => {
  it("wraps a single RouterOS row object in an array", () => {
    const row = { ".id": "*1", name: "hsprof-vouchers" };
    expect(normalizeRestList(row)).toEqual([row]);
  });

  it("passes through arrays unchanged", () => {
    const rows = [
      { ".id": "*1", name: "a" },
      { ".id": "*2", name: "b" },
    ];
    expect(normalizeRestList(rows)).toBe(rows);
  });

  it("returns empty array for nullish or non-objects", () => {
    expect(normalizeRestList(null)).toEqual([]);
    expect(normalizeRestList(undefined)).toEqual([]);
    expect(normalizeRestList("")).toEqual([]);
  });
});
