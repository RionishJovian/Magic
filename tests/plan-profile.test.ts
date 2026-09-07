import { describe, expect, it } from "vitest";
import { isManagedVoucherProfile } from "@/lib/portal/plan-profile";

describe("isManagedVoucherProfile", () => {
  it("matches legacy comment-tagged profiles", () => {
    expect(isManagedVoucherProfile({ name: "mm-500mb", comment: "mm-plan:500mb" })).toBe(true);
  });

  it("matches mm-* names when CLI omitted comment", () => {
    expect(isManagedVoucherProfile({ name: "mm-500mb" })).toBe(true);
  });

  it("excludes mm-trial", () => {
    expect(isManagedVoucherProfile({ name: "mm-trial" })).toBe(false);
  });

  it("excludes unrelated profiles", () => {
    expect(isManagedVoucherProfile({ name: "default" })).toBe(false);
  });
});
