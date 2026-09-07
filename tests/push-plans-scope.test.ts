import { describe, expect, it } from "vitest";
import { plansForScope } from "@/lib/portal.functions";

describe("push plan scope filtering", () => {
  it("filters default (time + default data sizes) vs custom", () => {
    const plans = [
      { plan_key: "1d", is_vip: false, data_quota_mb: null, duration_minutes: 1440 },
      { plan_key: "500mb", is_vip: false, data_quota_mb: 500, duration_minutes: 0 },
      // not a default key, and has both minutes+quota => classifyVoucherPlan => custom
      { plan_key: "my-custom", is_vip: false, data_quota_mb: 500, duration_minutes: 60 },
    ] as const;

    expect(plansForScope(plans, "all").map((p) => p.plan_key)).toEqual([
      "1d",
      "500mb",
      "my-custom",
    ]);

    expect(plansForScope(plans, "default").map((p) => p.plan_key)).toEqual(["1d", "500mb"]);
    expect(plansForScope(plans, "time").map((p) => p.plan_key)).toEqual(["1d"]);
    expect(plansForScope(plans, "data").map((p) => p.plan_key)).toEqual(["500mb"]);
    expect(plansForScope(plans, "custom").map((p) => p.plan_key)).toEqual(["my-custom"]);
  });
});
