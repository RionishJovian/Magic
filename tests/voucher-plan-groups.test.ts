import { describe, expect, it } from "vitest";
import { DEFAULT_DATA_QUOTA_PLAN_KEYS, DEFAULT_DATA_QUOTA_PLANS } from "@/lib/portal/default-plans";
import {
  TIME_PLAN_KEYS,
  classifyVoucherPlan,
  formatDataQuotaMb,
  groupVoucherPlans,
  planLimitLabel,
} from "@/lib/portal/plan-groups";

describe("voucher plan grouping", () => {
  it("keeps every default time and data profile, sorted into two lists", () => {
    const defaults = [
      { plan_key: "1d", sort: 0, duration_minutes: 1440, data_quota_mb: null, is_vip: false },
      { plan_key: "7d", sort: 1, duration_minutes: 10080, data_quota_mb: null, is_vip: false },
      { plan_key: "1m", sort: 2, duration_minutes: 43200, data_quota_mb: null, is_vip: false },
      { plan_key: "vip", sort: 3, duration_minutes: null, data_quota_mb: null, is_vip: true },
      ...DEFAULT_DATA_QUOTA_PLANS,
    ];
    const groups = groupVoucherPlans(defaults);
    expect(groups.map((g) => g.id)).toEqual(["time", "data"]);
    expect(groups[0]!.plans.map((p) => p.plan_key)).toEqual([...TIME_PLAN_KEYS]);
    expect(groups[1]!.plans.map((p) => p.plan_key)).toEqual([...DEFAULT_DATA_QUOTA_PLAN_KEYS]);
    expect(groups.flatMap((g) => g.plans)).toHaveLength(11);
  });

  it("classifies seeded keys without dropping any", () => {
    for (const key of TIME_PLAN_KEYS) {
      expect(classifyVoucherPlan({ plan_key: key, is_vip: key === "vip" })).toBe("time");
    }
    for (const key of DEFAULT_DATA_QUOTA_PLAN_KEYS) {
      expect(classifyVoucherPlan({ plan_key: key, data_quota_mb: 1000 })).toBe("data");
    }
  });

  it("puts operator-made plans in Custom and skips empty groups", () => {
    const groups = groupVoucherPlans([
      {
        plan_key: "custom-abc",
        sort: 9,
        duration_minutes: 60,
        data_quota_mb: 500,
        is_vip: false,
      },
    ]);
    expect(groups).toEqual([
      {
        id: "custom",
        plans: [expect.objectContaining({ plan_key: "custom-abc" })],
      },
    ]);
  });

  it("summarises quota and duration for a compact row", () => {
    expect(formatDataQuotaMb(500)).toBe("500 MB");
    expect(formatDataQuotaMb(1000)).toBe("1 GB");
    expect(formatDataQuotaMb(10000)).toBe("10 GB");
    expect(planLimitLabel({ plan_key: "vip", is_vip: true })).toBe("Unlimited");
    expect(
      planLimitLabel({ plan_key: "1d", duration_label: "24 hours", duration_minutes: 1440 }),
    ).toBe("24 hours");
    expect(planLimitLabel({ plan_key: "1gb", data_quota_mb: 1000 })).toBe("1 GB");
  });
});
