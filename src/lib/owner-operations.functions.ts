import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { DatabaseClient } from "./database.types";
import { accountStatus, type Tier } from "./services/entitlements";
import {
  canManageResellerInventory,
  RESELLER_INVENTORY_LOCKED_REASON,
} from "./reseller-operation-access";

const id = z.string().uuid();
const resellerSchema = z.object({
  shop_name: z.string().trim().min(1).max(120),
  contact_name: z.string().trim().min(1).max(120),
  location: z.string().trim().max(240).optional(),
  phone: z.string().trim().max(60).optional(),
});

async function ownerOperationsContext(context: { supabase: DatabaseClient; userId: string }) {
  const { effectiveOwner, getRoles, isPlatformAdminUser } = await import("./guards.server");
  const [roles, isPlatformAdmin, profileResult, entitlementResult, clientRoleResult] =
    await Promise.all([
      getRoles(context.supabase, context.userId),
      isPlatformAdminUser(context.supabase, context.userId),
      context.supabase.from("profiles").select("created_at").eq("id", context.userId).maybeSingle(),
      context.supabase
        .from("account_entitlements")
        .select("tier, tier_expires_at, plus")
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("user_roles")
        .select("expires_at")
        .eq("user_id", context.userId)
        .eq("role", "client")
        .maybeSingle(),
    ]);
  const entitlement = entitlementResult.data;
  const account = accountStatus({
    roles,
    entitlement: {
      tier: (entitlement?.tier === "monthly" || entitlement?.tier === "annual"
        ? entitlement.tier
        : "trial") as Tier,
      tier_expires_at: entitlement?.tier_expires_at ?? clientRoleResult.data?.expires_at ?? null,
      plus: Boolean(entitlement?.plus),
    },
    created_at: profileResult.data?.created_at ?? null,
    isPlatformAdmin,
  });
  if (account.trial) {
    throw new Error("Reseller Operation unlocks after the seven-day trial.");
  }
  const ownerId = await effectiveOwner(context.supabase, context.userId);
  return {
    ownerId,
    canManageResellerInventory: canManageResellerInventory(roles, isPlatformAdmin),
  };
}

/** Non-trial dashboard. It intentionally derives sales from vouchers, not Agent points. */
export const getOwnerOperationsDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { ownerId, canManageResellerInventory: canManageResellers } =
      await ownerOperationsContext(context);
    const db = context.supabase;
    const { data: resellerAddKey, error: resellerAddKeyError } = canManageResellers
      ? { data: null, error: null }
      : await db.rpc("get_reseller_add_keys");
    if (resellerAddKeyError) throw new Error(resellerAddKeyError.message);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [vouchers, resellers, assignments, sales, closes, routers] = await Promise.all([
      db
        .from("voucher_codes")
        .select(
          "id, code, plan_label, price_mmk, status, first_seen_at, expires_at, site_id, router_id, device_mac, created_at",
        )
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(5000),
      db
        .from("voucher_resellers")
        .select("id, shop_name, contact_name, location, phone, active")
        .eq("owner_id", ownerId)
        .order("shop_name"),
      db
        .from("voucher_reseller_assignments")
        .select("id, reseller_id, voucher_id, status, cash_due_mmk, issued_at, settled_at, note")
        .eq("owner_id", ownerId)
        .order("issued_at", { ascending: false })
        .limit(5000),
      db
        .from("voucher_sales")
        .select("id, code, price_cents, currency, sold_at, site_id, router_id")
        .eq("owner_id", ownerId)
        .order("sold_at", { ascending: false })
        .limit(5000),
      db
        .from("owner_daily_closes")
        .select("id, business_day, site_id, router_id, counted_cash_mmk, note, closed_at")
        .eq("owner_id", ownerId)
        .order("business_day", { ascending: false })
        .limit(30),
      db
        .from("router_connections")
        .select("id, name, cloud_status, cloud_last_seen_at, site_id")
        .eq("owner_id", ownerId)
        .limit(200),
    ]);
    for (const result of [vouchers, resellers, assignments, sales, closes, routers]) {
      if (result.error) throw new Error(result.error.message);
    }
    const voucherRows = vouchers.data ?? [];
    const salesRows = sales.data ?? [];
    const status = {
      generated: voucherRows.length,
      sold: 0,
      used: 0,
      expired: 0,
      cancelled: 0,
      unused: 0,
    };
    for (const v of voucherRows) {
      if (v.status === "cancelled") status.cancelled++;
      else if (v.status === "expired") status.expired++;
      else if (v.first_seen_at || v.status === "used") status.used++;
      else status.unused++;
    }
    status.sold = salesRows.length;
    const gross_mmk = voucherRows
      .filter((v) => v.status !== "cancelled" && v.first_seen_at)
      .reduce((total, v) => total + Number(v.price_mmk ?? 0), 0);
    const cash_mmk = salesRows
      .filter((sale) => sale.currency === "MMK")
      .reduce((total, sale) => total + Math.round(Number(sale.price_cents ?? 0) / 100), 0);
    const resellerRows = (resellers.data ?? []).map((reseller) => {
      const rows = (assignments.data ?? []).filter(
        (assignment) => assignment.reseller_id === reseller.id,
      );
      return {
        ...reseller,
        issued: rows.filter((assignment) => assignment.status === "issued").length,
        sold: rows.filter((assignment) => assignment.status === "sold").length,
        returned: rows.filter((assignment) => assignment.status === "returned").length,
        cancelled: rows.filter((assignment) => assignment.status === "cancelled").length,
        cash_due_mmk: rows
          .filter(
            (assignment) =>
              !assignment.settled_at &&
              (assignment.status === "issued" || assignment.status === "sold"),
          )
          .reduce((total, assignment) => total + Number(assignment.cash_due_mmk ?? 0), 0),
      };
    });
    const onlineCutoff = Date.now() - 5 * 60_000;
    const routerRows = (routers.data ?? []).map((router) => ({
      ...router,
      online:
        router.cloud_status === "online" ||
        (router.cloud_last_seen_at && Date.parse(router.cloud_last_seen_at) >= onlineCutoff),
    }));
    const closedToday = (closes.data ?? []).some(
      (close) => close.business_day === new Date().toISOString().slice(0, 10),
    );
    return {
      as_of: new Date().toISOString(),
      status,
      gross_mmk,
      cash_mmk,
      resellers: resellerRows,
      recent_vouchers: voucherRows.slice(0, 30),
      daily_closes: closes.data ?? [],
      routers: routerRows,
      open_cash_close: !closedToday,
      can_manage_reseller_inventory:
        canManageResellers ||
        Number((resellerAddKey as { active_count?: number } | null)?.active_count ?? 0) > 0,
      reseller_add_key: (resellerAddKey ?? {
        key_id: 1001,
        active_count: 0,
        expires_at: null,
      }) as { key_id: number; active_count: number; expires_at: string | null },
      alerts: {
        low_stock: status.unused < 20,
        routers_offline: routerRows.filter((router) => !router.online).map((router) => router.name),
        cash_close_missing: !closedToday,
        recent_activity: voucherRows.filter((voucher) => voucher.created_at >= since).length,
      },
    };
  });

export const createVoucherReseller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => resellerSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await ownerOperationsContext(context);
    const { data: row, error } = await context.supabase.rpc("create_reseller_with_key", {
      _shop_name: data.shop_name,
      _contact_name: data.contact_name,
      _location: data.location || undefined,
      _phone: data.phone || undefined,
    });
    if (error) {
      if (error.message.includes("RESELLER_ADD_KEY_REQUIRED")) {
        throw new Error(`${RESELLER_INVENTORY_LOCKED_REASON} Purchase Key ID 1001 from Profile.`);
      }
      throw new Error(error.message);
    }
    return row as { id: string; keys_remaining: number };
  });

export const assignVoucherToReseller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        reseller_id: id,
        voucher_id: id,
        cash_due_mmk: z.number().int().min(0).max(10_000_000),
        note: z.string().trim().max(500).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { ownerId } = await ownerOperationsContext(context);
    const { data: row, error } = await context.supabase
      .from("voucher_reseller_assignments")
      .insert({ owner_id: ownerId, ...data, note: data.note || null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setResellerAssignmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id,
        status: z.enum(["issued", "sold", "returned", "cancelled"]),
        settled: z.boolean().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    await ownerOperationsContext(context);
    const { error } = await context.supabase
      .from("voucher_reseller_assignments")
      .update({
        status: data.status,
        ...(data.settled ? { settled_at: new Date().toISOString() } : {}),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const closeOwnerBusinessDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        business_day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        counted_cash_mmk: z.number().int().min(0).max(1_000_000_000),
        note: z.string().trim().max(500).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { ownerId } = await ownerOperationsContext(context);
    const { error } = await context.supabase.from("owner_daily_closes").upsert(
      {
        owner_id: ownerId,
        business_day: data.business_day,
        counted_cash_mmk: data.counted_cash_mmk,
        note: data.note || null,
        closed_by: context.userId,
      },
      { onConflict: "owner_id,site_id,router_id,business_day" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
