import { describe, it, expect } from "vitest";
import {
  planPerformance,
  filterVouchers,
  voucherState,
  type PlanVoucherLike,
} from "@/lib/payments/plan-revenue";
import { availableProviders } from "@/lib/payments/providers";
import { visibleNavItems } from "@/lib/nav/modes";

const NOW = Date.parse("2026-06-01T12:00:00Z");
const iso = (offsetDays: number) => new Date(NOW + offsetDays * 86_400_000).toISOString();

function voucher(over: Partial<PlanVoucherLike> = {}): PlanVoucherLike {
  return {
    id: over.code ?? "v1",
    code: "CODE1",
    plan_key: "1d",
    plan_label: "1 Day",
    price_mmk: 1000,
    status: "active",
    created_at: iso(-10),
    first_seen_at: null,
    expires_at: iso(5),
    device_mac: null,
    ...over,
  };
}

describe("voucher state", () => {
  it("derives one state per voucher", () => {
    expect(voucherState(voucher(), NOW)).toBe("unused");
    expect(voucherState(voucher({ first_seen_at: iso(-1) }), NOW)).toBe("active");
    expect(voucherState(voucher({ first_seen_at: iso(-5), expires_at: iso(-1) }), NOW)).toBe(
      "used",
    );
    expect(voucherState(voucher({ expires_at: iso(-1) }), NOW)).toBe("expired");
    expect(voucherState(voucher({ status: "cancelled" }), NOW)).toBe("cancelled");
    expect(voucherState(voucher({ status: "deleted" }), NOW)).toBe("cancelled");
  });
});

describe("plan-scoped voucher performance", () => {
  const vouchers = [
    voucher({ code: "A1", first_seen_at: iso(-1) }), // active, 1000
    voucher({ code: "A2", first_seen_at: iso(-4), expires_at: iso(-2) }), // used, 1000
    voucher({ code: "A3", expires_at: iso(-2) }), // expired unused
    voucher({ code: "A4", status: "cancelled" }), // cancelled
    voucher({ code: "B1", plan_key: "7d", plan_label: "7 Days", price_mmk: 5000 }), // unused
  ];
  const plans = [
    { plan_key: "1d", label: "1 Day", status: "active" },
    { plan_key: "7d", label: "7 Days", status: "inactive" },
    { plan_key: "vip", label: "VIP", status: "active" },
  ];

  it("groups counts and revenue by the owner's own plans", () => {
    const rows = planPerformance(vouchers, [], plans, NOW);
    const oneDay = rows.find((r) => r.plan_key === "1d")!;
    expect(oneDay).toMatchObject({
      issued: 4,
      active: 1,
      used: 1,
      expired: 1,
      cancelled: 1,
      gross: 1000,
      refunded: 0,
      net: 1000,
    });
    expect(oneDay.lost_mmk).toBe(1000);
    expect(oneDay.redemption_rate).toBe(50);

    // Plans with no activity still appear, with their status.
    const vip = rows.find((r) => r.plan_key === "vip")!;
    expect(vip.issued).toBe(0);
    expect(rows.find((r) => r.plan_key === "7d")!.status).toBe("inactive");
  });

  it("subtracts refunded orders to give net revenue", () => {
    const linkedVouchers = vouchers.map((v) =>
      v.code === "A1"
        ? { ...v, order_id: "refund-order", expires_at: iso(-1) }
        : v.code === "A2"
          ? { ...v, order_id: "settled-order" }
          : v,
    );
    const rows = planPerformance(
      linkedVouchers,
      [
        {
          id: "refund-order",
          plan_key: "1d",
          plan_label: "1 Day",
          status: "refunded",
          amount_minor: 1000,
          issued_code: "A1",
          settled_at: iso(-1),
          refunded_at: iso(-1),
        },
        {
          id: "settled-order",
          plan_key: "1d",
          plan_label: "1 Day",
          status: "settled",
          amount_minor: 1000,
          issued_code: "A2",
          settled_at: iso(-2),
          refunded_at: null,
        },
      ],
      plans,
      NOW,
    );
    const oneDay = rows.find((r) => r.plan_key === "1d")!;
    expect(oneDay.gross).toBe(2000);
    expect(oneDay.refunded).toBe(1000);
    expect(oneDay.net).toBe(1000);
  });

  it("counts a redeemed code once when its historical order link is missing", () => {
    const rows = planPerformance(
      [voucher({ code: "PAID-USED", first_seen_at: iso(-1), expires_at: iso(-1) })],
      [
        {
          id: "paid-used",
          plan_key: "1d",
          plan_label: "1 Day",
          status: "settled",
          amount_minor: 1000,
          issued_code: "PAID-USED",
          settled_at: iso(-1),
          refunded_at: null,
        },
      ],
      [],
      NOW,
    );
    expect(rows[0]).toMatchObject({ gross: 1000, net: 1000 });
  });

  it("keeps vouchers of deleted plans visible as archived rows", () => {
    const rows = planPerformance(
      [voucher({ plan_key: "legacy", plan_label: "Legacy" })],
      [],
      plans,
      NOW,
    );
    expect(rows.find((r) => r.plan_key === "legacy")!.status).toBe("archived");
  });

  it("keeps a deleted voucher out of gross revenue and marks it cancelled", () => {
    const rows = planPerformance(
      [voucher({ code: "TEST-DELETE", first_seen_at: iso(-1), status: "deleted" })],
      [],
      [],
      NOW,
    );
    expect(rows[0]).toMatchObject({ cancelled: 1, gross: 0, net: 0 });
  });
});

describe("voucher inspector filters", () => {
  const vouchers = [
    voucher({ code: "USED1", first_seen_at: iso(-4), expires_at: iso(-2) }),
    voucher({ code: "EXP1", expires_at: iso(-2) }),
    voucher({ code: "LIVE1", first_seen_at: iso(-1), device_mac: "AA:BB:CC" }),
  ];

  it("filters used and expired codes separately", () => {
    expect(filterVouchers(vouchers, { state: "used" }, NOW).map((v) => v.code)).toEqual(["USED1"]);
    expect(filterVouchers(vouchers, { state: "expired" }, NOW).map((v) => v.code)).toEqual([
      "EXP1",
    ]);
    expect(
      filterVouchers(vouchers, { state: "redeemed" }, NOW)
        .map((v) => v.code)
        .sort(),
    ).toEqual(["LIVE1", "USED1"]);
    expect(filterVouchers(vouchers, { state: "all" }, NOW)).toHaveLength(3);
  });

  it("searches by code, plan and device", () => {
    expect(
      filterVouchers(vouchers, { state: "all", search: "aa:bb" }, NOW).map((v) => v.code),
    ).toEqual(["LIVE1"]);
    expect(filterVouchers(vouchers, { state: "all", search: "1 day" }, NOW)).toHaveLength(3);
  });

  it("scopes to a single plan", () => {
    const mixed = [...vouchers, voucher({ code: "OTHER", plan_key: "7d", plan_label: "7 Days" })];
    expect(filterVouchers(mixed, { state: "all", plan_key: "7d" }, NOW).map((v) => v.code)).toEqual(
      ["OTHER"],
    );
  });

  it("never mixes tenants: aggregation only sees the rows it is given", () => {
    // The server function filters by owner_id before calling in; this asserts the
    // pure layer adds nothing back.
    const mine = [voucher({ code: "MINE" })];
    const rows = planPerformance(mine, [], [], NOW);
    expect(rows).toHaveLength(1);
    expect(filterVouchers(mine, { state: "all" }, NOW).map((v) => v.code)).toEqual(["MINE"]);
  });
});

describe("no online payment gateway surface", () => {
  it("exposes no online provider anywhere in the app", () => {
    expect(availableProviders().map((p) => p.id)).toEqual(["manual"]);
    expect(availableProviders().every((p) => !p.supportsOnline)).toBe(true);
  });

  it("hides the back-office orders tab from non-privileged roles", () => {
    for (const roles of [["client"], ["agent"], ["read_only"], ["expired"], []]) {
      const paths = visibleNavItems(roles).map((i) => i.to);
      expect(paths).not.toContain("/app/orders");
    }
    for (const roles of [["primary"], ["primary"]]) {
      expect(visibleNavItems(roles).map((i) => i.to)).toContain("/app/orders");
    }
  });
});
