import { describe, expect, it } from "vitest";
import { pageSelectionState, updatePageSelection } from "@/components/record-selection.helpers";

describe("record page selection", () => {
  it("selects only the rows on the requested page", () => {
    const selected = updatePageSelection(new Set(["other-page"]), ["page-a", "page-b"], true);

    expect(selected).toEqual(new Set(["other-page", "page-a", "page-b"]));
  });

  it("clears only the rows on the requested page", () => {
    const selected = updatePageSelection(
      new Set(["page-a", "page-b", "other-page"]),
      ["page-a", "page-b"],
      false,
    );

    expect(selected).toEqual(new Set(["other-page"]));
  });

  it("reports full, partial, and empty page selection", () => {
    expect(pageSelectionState(new Set(["a", "b"]), ["a", "b"])).toEqual({
      allSelected: true,
      partiallySelected: false,
    });
    expect(pageSelectionState(new Set(["a"]), ["a", "b"])).toEqual({
      allSelected: false,
      partiallySelected: true,
    });
    expect(pageSelectionState(new Set(), ["a", "b"])).toEqual({
      allSelected: false,
      partiallySelected: false,
    });
  });
});
