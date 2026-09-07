import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Platform Router Support Console contract", () => {
  it("uses an explicit Primary/Developer scope and never selects encrypted credentials", () => {
    const source = readFileSync("src/lib/developer-router-support.functions.ts", "utf8");
    expect(source).toContain("resolveAdminScope");
    expect(source).toContain("tenantUserIdSet");
    expect(source).toContain("cannot support another Primary tenant");
    expect(source).toContain(
      'select("id, name, owner_id, environment, connection_mode, is_virtual")',
    );
    expect(source).not.toContain("password_ciphertext");
  });

  it("keeps the currently exposed cross-tenant write as a reasoned typed reboot", () => {
    const source = readFileSync("src/lib/developer-router-support.functions.ts", "utf8");
    expect(source).toContain('"/system reboot"');
    expect(source).toContain("REBOOT ${row.name}");
    expect(source).toContain("reason: z.string().trim().min(5).max(300)");
    expect(source).toContain("developer_support_reboot");
  });

  it("authorizes router-key access as the authenticated support caller", () => {
    const source = readFileSync("src/lib/developer-router-support.functions.ts", "utf8");
    const loader = readFileSync("src/lib/router-conn.server.ts", "utf8");
    expect(
      source.match(/loadRouterConn\(supabaseAdmin, row\.id, context\.supabase\)/g),
    ).toHaveLength(3);
    expect(loader).toContain("accessClient: DatabaseClient = supabase");
    expect(loader).toContain("assertRouterUnlockActive(accessClient, routerId)");
  });
});

describe("cross-tenant voucher plan sync guards", () => {
  const source = readFileSync("src/lib/developer-router-support.functions.ts", "utf8");
  const ui = readFileSync("src/components/DeveloperRouterSupportConsole.tsx", "utf8");

  it("blocks the sync for routers outside the support scope before any write", () => {
    const syncBlock = source.slice(source.indexOf("export const syncPlansForSupportRouter"));
    expect(syncBlock).toContain("await requirePlatformSupportRouter(context, data.routerId)");
    expect(syncBlock.indexOf("requirePlatformSupportRouter")).toBeLessThan(
      syncBlock.indexOf("ensurePlanProfileOnRouter"),
    );
    expect(source).toContain("This router is outside your Platform Support scope.");
  });

  it("uses the default voucher guard for own routers and delegation for cross-tenant routers", () => {
    const syncBlock = source.slice(source.indexOf("export const syncPlansForSupportRouter"));
    expect(syncBlock).toContain('assertActiveSupportGrant(row.id, context.userId, "sync_plans")');
    expect(syncBlock).toContain("const ownedRow = await findSameTenantRouterForPlanSync");
    expect(syncBlock).toContain("const sameTenant = Boolean(ownedRow)");
    expect(syncBlock).toContain("requireVoucherOperator(context.supabase, context.userId)");
    expect(syncBlock.indexOf("assertActiveSupportGrant")).toBeLessThan(
      syncBlock.indexOf("ensurePlanProfileOnRouter"),
    );
  });

  it("allowlists only sync_plans for active cross-tenant basic support", () => {
    expect(source).toContain('BASIC_DEFAULT_SUPPORT_ACTIONS = ["sync_plans"]');
    expect(source).toContain('isBasicDefaultSupportAction("sync_plans")');
    expect(source).toContain("requireActiveTargetCustomerAccount(row.owner_id)");
    expect(source).toContain('from("user_roles")');
    expect(source).toContain('from("account_entitlements")');
    expect(source).toContain('"suspended", "restricted"');
    expect(source).toContain(
      "Target customer account is expired, suspended, restricted, or inactive.",
    );
  });

  it("records denied basic support authorization without claiming a delegation failure", () => {
    expect(source).toContain(
      '"Basic support allowance denied because the target customer account is not active."',
    );
    expect(source).toContain('"Basic support allowance"');
    expect(source).not.toContain('BASIC_DEFAULT_SUPPORT_ACTIONS = ["sync_plans", "reboot"]');
  });

  it("resolves effective ownership before falling back to cross-tenant support", () => {
    expect(source).toContain("findSameTenantRouterForPlanSync");
    expect(source).toContain('rpc("effective_owner"');
    expect(source).toContain('.eq("owner_id", ownerId)');
    expect(source).toContain("const row = ownedRow ?? (await requirePlatformSupportRouter");
  });

  it("documents that cross-tenant reboot currently uses support scope and confirmation only", () => {
    const rebootBlock = source.slice(
      source.indexOf("export const rebootDeveloperSupportRouter"),
      source.indexOf("export const syncPlansForSupportRouter"),
    );
    expect(rebootBlock).toContain("requirePlatformSupportRouter(context, data.routerId)");
    expect(rebootBlock).toContain("confirmation !== expected");
    expect(rebootBlock).not.toContain("assertActiveSupportGrant");
  });

  it("only writes the customer's own plans and never removes profiles", () => {
    const syncBlock = source.slice(source.indexOf("export const syncPlansForSupportRouter"));
    expect(syncBlock).toContain('.from("portal_plans")');
    expect(syncBlock).toContain('.eq("owner_id", row.owner_id)');
    expect(syncBlock).not.toMatch(/\/ip\/hotspot\/user\/profile\/remove|routerAPI\.delete/);
    expect(syncBlock).toContain("add-only");
  });

  it("requires the exact typed confirmation and audits a mismatch as blocked", () => {
    const syncBlock = source.slice(source.indexOf("export const syncPlansForSupportRouter"));
    expect(syncBlock).toContain("SYNC PLANS ${row.name}");
    expect(syncBlock).toContain('action: "confirmation_failed"');
    expect(syncBlock).toContain('outcome: "blocked"');
  });

  it("returns an actionable error when the board has no working HotSpot", () => {
    expect(source).toContain("HotSpot is not ready on ${row.name}");
    expect(source).toContain("Quick setup / Gateway Bootstrap");
  });

  it("exposes the latest sync audit entry with router and tenant context", () => {
    expect(source).toContain("export const getLatestSupportSyncAudit");
    expect(source).toContain('.from("router_ops_audit")');
    expect(source).toContain('"developer_support_sync_plans", "confirmation_failed"');
    expect(ui).toContain("Last plan-sync audit entry");
    expect(ui).toContain("getLatestSupportSyncAudit");
  });

  it("shows an inline confirmation-mismatch hint in the console", () => {
    expect(ui).toContain("Confirmation does not match");
    expect(ui).toContain("Plan sync could not complete");
  });
});
