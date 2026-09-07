import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRIAL_USERNAME,
  isDefaultTrialUser,
  isSellableVoucherUser,
  sellableVoucherUsers,
} from "@/lib/hotspot-voucher-users";

describe("default-trial is not a voucher", () => {
  it("matches the RouterOS built-in name, ignoring case and padding", () => {
    expect(isDefaultTrialUser(DEFAULT_TRIAL_USERNAME)).toBe(true);
    expect(isDefaultTrialUser("Default-Trial")).toBe(true);
    expect(isDefaultTrialUser("  default-trial  ")).toBe(true);
    expect(isDefaultTrialUser("VCH-1D-ABC")).toBe(false);
    expect(isDefaultTrialUser("T-AABBCCDDEEFF")).toBe(false);
    expect(isDefaultTrialUser("")).toBe(false);
    expect(isDefaultTrialUser(undefined)).toBe(false);
  });

  it("drops default-trial from the voucher table while keeping sellable codes", () => {
    const users = [
      { ".id": "*1", name: "default-trial", profile: "default" },
      { ".id": "*2", name: "VCH-1H-DEMO01", profile: "voucher-1h" },
      { ".id": "*3", name: "T-AABBCCDDEEFF", profile: "mm-trial" },
    ];
    expect(isSellableVoucherUser({ name: "default-trial" })).toBe(false);
    expect(isSellableVoucherUser({ name: "VCH-1H-DEMO01" })).toBe(true);
    expect(sellableVoucherUsers(users).map((u) => u.name)).toEqual(["VCH-1H-DEMO01"]);
  });

  it("drops RouterOS trial sessions and the mm-trial profile", () => {
    expect(isSellableVoucherUser({ name: "T-AABBCCDDEEFF" })).toBe(false);
    expect(isSellableVoucherUser({ name: "guest-1", profile: "mm-trial" })).toBe(false);
    expect(isSellableVoucherUser({ name: "VCH-1D-ABC", profile: "mm-1d" })).toBe(true);
  });
});
