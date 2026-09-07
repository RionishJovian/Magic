import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("Router → Portal → Voucher → Payment → Revenue continuity", () => {
  it("stamps site_id on cash sales from the router (matches stock Generate)", () => {
    const orders = read("src/lib/orders.functions.ts");
    expect(orders).toContain('from("router_connections")');
    expect(orders).toContain("site_id");
    expect(orders).toMatch(/siteId = \(routerRow\?\.site_id/);
  });

  it("releases payment event claims when voucher issue fails", () => {
    const core = read("src/lib/payments/core.ts");
    expect(core).toContain("releaseEvent");
    expect(core).toContain("await store.issueVoucher(order)");
    expect(core).toMatch(/releaseEvent\(event\.provider, event\.eventId\)/);
  });

  it("expires router users without deleting voucher or revenue history", () => {
    const maint = read("src/routes/api/public/hooks/voucher-maintenance.ts");
    expect(maint).toContain('update({ status: "expired" })');
    expect(maint).not.toContain('from("voucher_sales").insert');
    expect(maint).not.toContain('from("voucher_sales").delete');
    expect(maint).not.toContain('from("voucher_codes").delete');
  });

  it("points Revenue empty states at Vouchers, not Portal", () => {
    const revenue = read("src/routes/_authenticated/app.revenue.tsx");
    expect(revenue).toContain('to="/app/vouchers"');
    expect(revenue).not.toMatch(/Portal tab/);
  });

  it("stores portal deploy version on audit snapshots for voucher bind", () => {
    const portal = read("src/lib/portal.functions.ts");
    expect(portal).toMatch(/snapshot:[\s\S]*version/);
  });

  it("links Hotspot panel to Vouchers, Portal, and Revenue", () => {
    const panel = read("src/components/HotspotSsidPanel.tsx");
    expect(panel).toContain('to="/app/vouchers"');
    expect(panel).toContain('to="/app/portal"');
    expect(panel).toContain('to="/app/revenue"');
  });
});
