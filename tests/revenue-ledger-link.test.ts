import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("voucher and revenue ledger continuity", () => {
  it("uses settled payment orders as the revenue source and keeps vouchers as redemption data", () => {
    const revenue = read("src/lib/monetization.functions.ts");
    expect(revenue).toContain('from("payment_orders")');
    expect(revenue).toContain("buildRevenueEntries");
    expect(revenue).toContain("order_id");
  });

  it("does not let a settled paid voucher be directly cancelled", () => {
    const vouchers = read("src/lib/mikrotik.functions.ts");
    expect(vouchers).toContain("Refund the linked order in Payments before cancelling it.");
    expect(vouchers).toContain('order?.status === "settled"');
  });

  it("makes handout explicitly non-financial", () => {
    const vouchers = read("src/routes/_authenticated/app.vouchers.tsx");
    expect(vouchers).toContain("it does not");
    expect(vouchers).toContain("Record the settled cash or online sale in Payments first.");
  });

  it("keeps both revenue logs filterable and readable on narrow screens", () => {
    const revenue = read("src/routes/_authenticated/app.revenue.tsx");
    expect(revenue).toContain('aria-label="Search voucher codes"');
    expect(revenue).toContain('aria-label="Search recent revenue activity"');
    expect(revenue).toContain('"No activity matches these filters."');
    expect(revenue).toContain('className="min-w-[980px] w-full text-sm"');
    expect(revenue).toContain('className="min-w-[760px] w-full text-sm"');
    expect(revenue).toContain('pageSize={recentPageSize}');
  });
});
