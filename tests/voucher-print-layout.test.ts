import { describe, expect, it } from "vitest";
import {
  DEFAULT_VOUCHER_PRINT_LAYOUT,
  normalizeVoucherPrintLayout,
} from "@/lib/voucher-print-layout";
import { canManageVoucherPrintLayouts } from "@/lib/app-role";
import { resolveRouteGate } from "@/lib/nav/route-gate";
import { readFileSync } from "node:fs";

describe("voucher print layout", () => {
  it("keeps a safe, complete thermal-print default", () => {
    expect(DEFAULT_VOUCHER_PRINT_LAYOUT).toMatchObject({
      paper_width_mm: 80,
      show_qr: true,
      show_price: true,
      show_expiry: true,
    });
  });

  it("only accepts supported thermal paper widths", () => {
    expect(normalizeVoucherPrintLayout({ paper_width_mm: 58 }).paper_width_mm).toBe(58);
    expect(normalizeVoucherPrintLayout({ paper_width_mm: 120 as never }).paper_width_mm).toBe(80);
  });

  it("keeps layout management separate from captive-portal configuration", () => {
    const source = readFileSync("src/routes/_authenticated/app.voucher-layouts.tsx", "utf8");
    expect(source).toMatch(/do not change the guest\s+captive portal/);
    expect(source).toContain("Print test receipt");
    const printer = readFileSync("src/lib/voucher-print.client.ts", "utf8");
    expect(printer).toContain("QRCode.toDataURL");
    expect(printer).toContain("paper_width_mm");
  });

  it("allows active café Users to manage their own layout but excludes agents and expired accounts", () => {
    expect(canManageVoucherPrintLayouts(["client"])).toBe(true);
    expect(canManageVoucherPrintLayouts(["primary"])).toBe(true);
    expect(canManageVoucherPrintLayouts([], true)).toBe(true);
    expect(canManageVoucherPrintLayouts(["agent"])).toBe(false);
    expect(canManageVoucherPrintLayouts(["client", "pending"])).toBe(false);
    expect(canManageVoucherPrintLayouts(["client", "expired"])).toBe(false);
    expect(resolveRouteGate(["client"], "/app/voucher-layouts", [], false, false).allowed).toBe(
      true,
    );
    expect(resolveRouteGate(["primary"], "/app/voucher-layouts", [], false, false).allowed).toBe(
      true,
    );
    expect(resolveRouteGate(["agent"], "/app/voucher-layouts", [], false, false).allowed).toBe(
      false,
    );
    expect(
      resolveRouteGate(["client", "expired"], "/app/voucher-layouts", [], false, false).allowed,
    ).toBe(false);
  });
});
