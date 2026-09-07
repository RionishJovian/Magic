import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const topology = read("src/lib/topology.functions.ts");
const routerConn = read("src/lib/router-conn.server.ts");
const fleetAi = read("src/lib/fleet-ai.server.ts");
const voucherMaintenance = read("src/routes/api/public/hooks/voucher-maintenance.ts");
const paymentStore = read("src/lib/payments/orders.server.ts");
const telegramCallback = read("src/routes/api/public/hooks/telegram/callback.ts");
const bankFunctions = read("src/lib/bank.functions.ts");
const migration = read(
  "supabase/migrations/20260831185045_durable_router_access_and_owner_checks.sql",
);
const permissionFix = read(
  "supabase/migrations/20260901030000_fix_router_unlock_key_access_permission.sql",
);

describe("durable router access audit", () => {
  it("keeps topology catalog reads privileged but evaluates the lock with the caller", () => {
    expect(topology).toContain("loadRouterConn(supabaseAdmin, router.id, context.supabase)");
    expect(topology).not.toContain("loadRouterConn(supabaseAdmin, router.id);");
  });

  it("keeps scheduled probes owner-scoped instead of treating auth.uid() as a cron identity", () => {
    expect(routerConn).toContain("loadRouterConnForOwner");
    expect(fleetAi).toContain("loadRouterConnForOwner(supabaseAdmin, id, ownerId)");
    expect(voucherMaintenance).toContain(
      "loadRouterConnForOwner(supabaseAdmin, routerId, routerRow.owner_id)",
    );
  });

  it("keeps trusted payment fulfillment on the same owner-scoped router check", () => {
    expect(paymentStore).toContain("options.serviceRole");
    expect(paymentStore).toContain("loadRouterConnForOwner(db, order.router_id, order.owner_id)");
    expect(telegramCallback).toContain("createReviewStore(supabaseAdmin, { serviceRole: true })");
    expect(bankFunctions).toContain("createReviewStore(supabaseAdmin, { serviceRole: true })");
  });

  it("uses the durable included identity and promotes a replacement on deletion", () => {
    expect(migration).toContain("private.router_unlock_key_accessible_for_owner");
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.router_unlock_key_accessible_for_owner",
    );
    expect(migration).toContain("da.included_router_id = _router_id");
    expect(migration).toContain("ORDER BY r.created_at NULLS FIRST, r.id");
    expect(migration).toContain("included_router_id = v_replacement");
    expect(migration).toContain("BEFORE DELETE ON public.router_connections");
    expect(migration).not.toContain("row_number()");
  });

  it("does not expose the scheduled owner check to browser roles", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.router_unlock_key_accessible_for_owner(uuid, uuid)",
    );
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.router_unlock_key_accessible_for_owner\(uuid, uuid\)[\s\S]*?TO service_role;/,
    );
  });

  it("lets the authenticated one-router wrapper call the private helper safely", () => {
    expect(permissionFix).toContain("SECURITY DEFINER");
    expect(permissionFix).toContain("WHEN auth.uid() IS NULL THEN false");
    expect(permissionFix).toContain("private.router_unlock_key_accessible_for_owner");
    expect(permissionFix).toContain(
      "GRANT EXECUTE ON FUNCTION public.router_unlock_key_accessible(uuid)",
    );
    expect(permissionFix).not.toContain(
      "GRANT EXECUTE ON FUNCTION private.router_unlock_key_accessible_for_owner",
    );
  });
});
