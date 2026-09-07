import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const screens = readFileSync("src/routes/_authenticated/app.easy.$screen.tsx", "utf8");
const vouchers = readFileSync("src/routes/_authenticated/app.easy.vouchers.tsx", "utf8");

describe("Easy Mode operator independence", () => {
  it("keeps plan, print-layout, and portal-publish work inside Easy Mode", () => {
    expect(screens).toContain("<PlansPanel />");
    expect(screens).toContain("<VoucherLayoutsPage embedded />");
    expect(screens).toContain("publishPortalToRouter");
    expect(screens).not.toContain('to="/app/portal"');
    expect(screens).not.toContain('to="/app/voucher-layouts"');
  });

  it("prints newly-created codes without sending the operator to Advanced Mode", () => {
    expect(vouchers).toContain("printEasyVoucherBatch");
    expect(vouchers).toContain('t.ui("Print this batch")');
    expect(vouchers).not.toContain('to="/app/voucher-layouts"');
    expect(vouchers).not.toContain('to="/app/vouchers"');
    expect(vouchers).not.toContain('to="/app/portal"');
  });

  it("requires the production confirmation phrase before portal publication", () => {
    expect(screens).toContain('expectedConfirmation("deploy", "production", router.name)');
    expect(screens).toContain("normalizeConfirmation(confirmation)");
  });
});
