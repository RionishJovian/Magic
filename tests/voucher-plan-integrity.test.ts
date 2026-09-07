import { describe, expect, it } from "vitest";
import { dedupeVoucherPlans, isArchivedVoucherPlan } from "@/lib/portal/plan-groups";

describe("voucher plan integrity", () => {
  it("keeps one product per normalized plan key", () => {
    const plans = dedupeVoucherPlans([
      { plan_key: "1D", is_vip: false, sort: 0 },
      { plan_key: "1d", is_vip: false, sort: 1 },
      { plan_key: "vip", is_vip: true, sort: 2 },
      { plan_key: "", is_vip: false, sort: 3 },
    ]);

    expect(plans.map((plan) => plan.plan_key)).toEqual(["1D", "vip"]);
  });

  it("recognizes cleanup rows as hidden historical records", () => {
    expect(isArchivedVoucherPlan({ plan_key: "archived-123", is_vip: false })).toBe(true);
    expect(isArchivedVoucherPlan({ plan_key: "vip", is_vip: true })).toBe(false);
  });
});
