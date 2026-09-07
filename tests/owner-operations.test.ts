import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canAccessPath, visibleNavItems } from "@/lib/nav/modes";
import {
  canManageResellerInventory,
  RESELLER_INVENTORY_LOCKED_REASON,
} from "@/lib/reseller-operation-access";

const read = (path: string) => readFileSync(path, "utf8");

describe("Owner Operations release contract", () => {
  it("keeps owner inventory separate from Agent Magic Coins", () => {
    const source = read("src/lib/owner-operations.functions.ts");
    expect(source).toContain("voucher_reseller_assignments");
    expect(source).not.toContain("agent_points");
    expect(source).toContain("accountStatus");
    expect(source).toContain("seven-day trial");
    expect(source).not.toContain("Plus Tier Pass");
  });

  it("keeps Reseller Operation accessible to every non-trial role", () => {
    expect(visibleNavItems(["primary"], [], true, false).map((item) => item.to)).toContain(
      "/app/reseller-operation",
    );
    expect(canAccessPath(["primary"], "/app/reseller-operation", [], true, false)).toBe(true);
    expect(canAccessPath(["client"], "/app/reseller-operation", [], false, false)).toBe(true);
    expect(canAccessPath(["agent"], "/app/reseller-operation", [], false, false)).toBe(true);
    expect(canAccessPath(["expired"], "/app/reseller-operation", [], false, false)).toBe(true);
    expect(canAccessPath(["client"], "/app/reseller-operation", [], false, false, true)).toBe(
      false,
    );
  });

  it("locks reseller inventory mutations for User, Trial, and Expired accounts", () => {
    expect(canManageResellerInventory(["primary"])).toBe(true);
    expect(canManageResellerInventory([], true)).toBe(true);
    expect(canManageResellerInventory(["agent"])).toBe(true);
    expect(canManageResellerInventory(["client"])).toBe(false);
    expect(canManageResellerInventory(["expired"])).toBe(false);
    expect(RESELLER_INVENTORY_LOCKED_REASON).toMatch(/^LOCKED/);
  });

  it("has tenant-scoped RLS and blocks cross-tenant reseller assignment", () => {
    const sql = read("supabase/migrations/20260824213000_owner_operations.sql");
    const nonTrialSql = read(
      "supabase/migrations/20260826030000_reseller_operation_non_trial_access.sql",
    );
    expect(sql).toContain("owner_operations_can_read(owner_id)");
    expect(sql).toContain("RESELLER_OWNER_MISMATCH");
    expect(sql).toContain("VOUCHER_OWNER_MISMATCH");
    expect(nonTrialSql).toContain("owner_operations_is_trial_account");
    expect(nonTrialSql).toContain("owner_operations_can_write");
    const resellerLockSql = read("supabase/migrations/20260826033000_lock_reseller_inventory.sql");
    expect(resellerLockSql).toContain("owner_operations_can_manage_reseller_inventory");
    expect(resellerLockSql).toContain("'agent'::public.app_role");
    const resellerKeySql = read("supabase/migrations/20260826040000_reseller_add_key.sql");
    expect(resellerKeySql).toContain("key_id = 1001");
    expect(resellerKeySql).toContain("now() + interval '30 days'");
    expect(resellerKeySql).toContain("RESELLER_ADD_KEY_REQUIRED");
    expect(resellerKeySql).toContain("RESELLER_OPERATION_TRIAL_LOCKED");
    expect(resellerKeySql).toContain("FOR UPDATE SKIP LOCKED");
  });

  it("does not put cashier or reseller controls in the captive portal", () => {
    const page = read("src/routes/_authenticated/app.reseller-operation.tsx");
    expect(page).toContain("receive an app account");
    expect(page).toContain("voucher sales never create Magic Coins");
    expect(page).toContain("Add reseller");
    expect(page).toContain("LOCKED");
    expect(page).toContain("use 1 key");
    const profile = read("src/routes/_authenticated/app.profile.tsx");
    expect(profile).toContain("Inv reseller misc key");
    expect(profile).toContain("Unlock Add reseller ×1 · 30 days");
  });

  it("prints a receipt-sized voucher slip without exposing the portal to sales controls", () => {
    const vouchers = read("src/routes/_authenticated/app.vouchers.tsx");
    const printer = read("src/lib/voucher-print.client.ts");
    expect(vouchers).toContain("printVoucherThermalReceipt");
    expect(printer).toContain("@page { size:${layout.paper_width_mm}mm auto");
    expect(printer).toContain("Support:");
    expect(printer).toContain("QRCode.toDataURL");
    expect(printer).toContain("captive portal");
  });
});
