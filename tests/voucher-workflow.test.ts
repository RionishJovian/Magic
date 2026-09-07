import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("voucher operator workflow", () => {
  it("posts the voucher code as both username and password on the guest login page", () => {
    const login = read("src/lib/portal-template.server.ts");
    expect(login).toContain('name="username"');
    expect(login).toContain('name="password"');
    expect(login).toContain("this.password.value=this.username.value");
  });

  it("creates hotspot users with password equal to the code", () => {
    const mk = read("src/lib/mikrotik.functions.ts");
    expect(mk).toContain("password: data.name");
    expect(mk).toContain("password: code");
    expect(mk).not.toMatch(/addUser\(conn,\s*\{[^}]*password:\s*""/);

    const ros = read("src/lib/mikrotik.server.ts");
    expect(ros).toContain('createResource(c, "/ip/hotspot/user"');

    const issue = read("src/lib/portal.functions.ts");
    expect(issue).toContain("password: code");

    const mcp = read("src/lib/mcp/tools/create-voucher.ts");
    expect(mcp).toContain("password: v.name");
  });

  it("issues stock from a plan, not a leftover RouterOS profile name", () => {
    const page = read("src/routes/_authenticated/app.vouchers.tsx");
    expect(page).toContain("issuePlanVouchers");
    expect(page).toContain('aria-label="Voucher plan"');
    expect(page).not.toContain("voucher-1d");
    expect(page).not.toContain("bulkVouchers");
    expect(page).not.toContain("addVoucher");

    const issue = read("src/lib/portal.functions.ts");
    expect(issue).toContain("ensurePlanProfileOnRouter");
  });

  it("types CONFIRM REMOVING THE PLANS before replace or delete on Vouchers", () => {
    const panel = read("src/components/PlansPanel.tsx");
    expect(panel).toContain("TypedConfirmDialog");
    expect(panel).toContain("REMOVE_PLANS_PHRASE");
    expect(panel).not.toMatch(/\bconfirm\s*\(/);
  });

  it("keeps Portal as branding and deploy only", () => {
    const portal = read("src/routes/_authenticated/app.portal.tsx");
    expect(portal).toContain("Open vouchers →");
    expect(portal).not.toContain("function PlansPanel");
    expect(portal).not.toContain("issuePlanVouchers");
  });

  it("confirms portal deploy with the same phrase the server expects", () => {
    const portal = read("src/routes/_authenticated/app.portal.tsx");
    expect(portal).toContain("TypedConfirmDialog");
    expect(portal).toContain("portalDeployGate");
    expect(portal).not.toMatch(/window\.prompt/);
    const push = read("src/lib/portal.functions.ts");
    expect(push).toContain("portalDeployGate");
    expect(push).toContain("textFetchUrls");
    expect(push).toContain('{ name: "mm-manifest.json", content: manifestContent }');
    expect(push).toContain("isVirtualRouter");
    expect(push).toContain("filter((r) => !isVirtualRouter(r))");
  });

  it("marks app voucher rows cancelled when the hotspot user is removed", () => {
    const mk = read("src/lib/mikrotik.functions.ts");
    expect(mk).toContain('status: "cancelled"');
    expect(mk).toContain('.eq("code", code)');
  });

  it("provisions RouterOS hotspot users when order fulfilment has a router", () => {
    const orders = read("src/lib/payments/orders.server.ts");
    expect(orders).toContain("routerAPI.addUser");
    expect(orders).toContain("hotspotUserCreateBody");
    expect(orders).toContain("ensurePlanProfileOnRouter");
    expect(orders).toMatch(/if \(order\.router_id\)/);
    expect(orders).toContain('.from("voucher_codes").delete()');
  });

  it("issues desk stock ledger-first with uniqueness checks", () => {
    const issue = read("src/lib/portal.functions.ts");
    expect(issue).toContain("allocateUniqueCodes");
    expect(issue).toContain("ensurePlanProfileOnRouter");
    expect(issue).toContain("failed");
    expect(issue).not.toMatch(/insErr && !insErr\.message\.includes\("duplicate"\)/);
  });

  it("loads the app ledger alongside the router snapshot for drift detection", () => {
    const page = read("src/routes/_authenticated/app.vouchers.tsx");
    expect(page).toContain("listVoucherCodes");
    expect(page).toContain("Ledger mismatch on this router");
    expect(page).toContain("drift.dbOnly");
    expect(page).toContain("drift.routerOnly");
  });

  it("reconciles ledger-only codes with a required reason instead of deleting them", () => {
    const page = read("src/routes/_authenticated/app.vouchers.tsx");
    const portal = read("src/lib/portal.functions.ts");
    const migration = read("supabase/migrations/20260825210000_voucher_ledger_reconciliation.sql");
    expect(page).toContain("Reconcile mismatch");
    expect(page).toContain("Reason required");
    expect(page).toContain("This flow never changes");
    expect(page).not.toContain("delete the ledger\n              row if obsolete");
    expect(portal).toContain("reconcileVoucherLedger");
    expect(portal).toContain("requirePrivileged");
    expect(migration).toContain("voucher_ledger_reconciliations");
    expect(migration).toContain("VOUCHER_RECONCILIATION_FORBIDDEN");
    expect(migration).toContain("ONLY_UNUSED_UNPAID_VOUCHERS_CAN_BE_MARKED_OBSOLETE");
    expect(migration).toContain("No authenticated INSERT, UPDATE, or DELETE policy");
  });

  it("scans router-only legacy vouchers before importing audited unused stock", () => {
    const page = read("src/routes/_authenticated/app.vouchers.tsx");
    const portal = read("src/lib/portal.functions.ts");
    const migration = read("supabase/migrations/20260826090000_audited_legacy_voucher_import.sql");
    expect(page).toContain("Scan vouchers on device");
    expect(page).toContain("Reason required");
    expect(page).toContain("does not create RouterOS accounts");
    expect(portal).toContain("scanLegacyRouterVouchers");
    expect(portal).toContain("importLegacyRouterVouchers");
    expect(portal).toContain("readLegacyVoucherCandidates");
    expect(portal).toContain("requirePrivileged");
    expect(migration).toContain("voucher_legacy_imports");
    expect(migration).toContain("service-role-only");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.import_legacy_router_vouchers");
  });

  it("uses the app-issued ledger as voucher inventory and only overlays RouterOS runtime state", () => {
    const page = read("src/routes/_authenticated/app.vouchers.tsx");
    expect(page).toContain(
      "The app ledger is the voucher inventory and financial source of truth.",
    );
    expect(page).toContain("return (dbLedger.data ?? []).map");
    expect(page).toContain("routerByCode");
  });

  it("keeps the human plan identity through table, export, and print flows", () => {
    const page = read("src/routes/_authenticated/app.vouchers.tsx");
    expect(page).toContain("profile: voucherPlanLabel(ledger, user?.profile)");
    expect(page).toContain("<Th>Plan</Th>");
    expect(page).toContain("code,plan,price_mmk");
    expect(page).toContain("planLabel: v.profile");
    expect(page).not.toContain('printSheet(codes, "mixed"');
  });

  it("uses hand-out wording for operator actions, not guest login redeem", () => {
    const page = read("src/routes/_authenticated/app.vouchers.tsx");
    expect(page).toContain("Hand out voucher");
    expect(page).toContain("Handed out");
    expect(page).not.toMatch(/DialogTitle>Redeem voucher/);
    expect(page).not.toMatch(/>Redeem & print</);
  });

  it("shows hand-out timestamps in the app timezone instead of raw UTC ISO", () => {
    const page = read("src/routes/_authenticated/app.vouchers.tsx");
    expect(page).toContain('import { fmtDateTime } from "@/lib/time"');
    expect(page).toContain("function formatHandedOutTime");
    expect(page).toContain("${fmtDateTime(value)} MMT");
    expect(page).not.toContain('<Td className="text-muted-foreground">{v.redeemedAt ?? "—"}</Td>');
  });

  it("requires a router when recording cash sales and has no guest checkout links", () => {
    const orders = read("src/lib/orders.functions.ts");
    expect(orders).toMatch(/router_id: z\.string\(\)\.uuid\(\)/);
    expect(orders).not.toMatch(/createCheckoutToken|portal_checkout_tokens/);

    const page = read("src/routes/_authenticated/app.orders.tsx");
    expect(page).toContain('aria-label="Router"');
    expect(page).not.toContain("Guest checkout links");
    expect(page).not.toContain("Checkout links");
    expect(page).not.toContain("/portal/checkout");
  });

  it("filters listVoucherCodes by router when requested", () => {
    const portal = read("src/lib/portal.functions.ts");
    expect(portal).toContain("routerId: z.string().uuid().optional()");
    expect(portal).toMatch(
      /if \(data\.routerId\) query = query\.eq\("router_id", data\.routerId\)/,
    );
  });
});
