import { createServerFn } from "@tanstack/react-start";
import type { DatabaseClient } from "./database.types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { handlePaymentEvent, cashSettlementEvent } from "./payments/core";
import { reconcileSessions, type SessionSample, type StoredSession } from "./payments/sessions";
import {
  buildRevenueEntries,
  totalsFor,
  breakdownBySource,
  type RevenueEntry,
} from "./payments/accounting";

const ORDER_COLUMNS =
  "id, owner_id, status, method, provider, provider_ref, amount_minor, currency, plan_id, plan_key, plan_label, router_id, site_id, device_mac, voucher_code_id, issued_code, fulfilled_at, settled_at, refunded_at, failure_reason, note, contact_hint, checkout_url, created_at, updated_at";

async function ownerOf(supabase: DatabaseClient, userId: string): Promise<string> {
  const { data } = await supabase.rpc("effective_owner", { _user_id: userId });
  return (data as string | null) ?? userId;
}

async function audit(
  supabase: DatabaseClient,
  row: {
    owner_id: string;
    user_id: string;
    action: string;
    success: boolean;
    error?: string | null;
  },
) {
  await supabase.from("router_save_audit").insert({
    owner_id: row.owner_id,
    user_id: row.user_id,
    action: row.action,
    success: row.success,
    error_message: row.error ?? null,
  });
}

// ---------------------------------------------------------------- orders ---

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        status: z.enum(["pending", "settled", "failed", "refunded", "cancelled"]).optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("./guards.server");
    await requireFeature(context.supabase, context.userId, "cash_sales");
    let q = context.supabase
      .from("payment_orders")
      .select(ORDER_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const recordCashSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        plan_id: z.string().uuid(),
        router_id: z.string().uuid(),
        site_id: z.string().uuid().nullable().optional(),
        device_mac: z.string().max(40).nullable().optional(),
        note: z.string().max(300).optional(),
        /** Client-generated so a double click cannot create two sales. */
        idempotency_key: z.string().min(8).max(80),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("./guards.server");
    await requireFeature(context.supabase, context.userId, "cash_sales");
    const owner_id = await ownerOf(context.supabase, context.userId);

    const { data: plan, error: planErr } = await context.supabase
      .from("portal_plans")
      .select("id, plan_key, label, price_mmk")
      .eq("id", data.plan_id)
      .eq("owner_id", owner_id)
      .maybeSingle();
    if (planErr) throw new Error(planErr.message);
    if (!plan) throw new Error("Plan not found.");

    // Retry-safe: the same idempotency key always maps to the same order.
    const { data: existing } = await context.supabase
      .from("payment_orders")
      .select(ORDER_COLUMNS)
      .eq("owner_id", owner_id)
      .eq("idempotency_key", data.idempotency_key)
      .maybeSingle();

    let order = existing;
    if (!order) {
      let siteId = data.site_id ?? null;
      if (!siteId && data.router_id) {
        const { data: routerRow } = await context.supabase
          .from("router_connections")
          .select("site_id")
          .eq("id", data.router_id)
          .maybeSingle();
        siteId = (routerRow?.site_id as string | null | undefined) ?? null;
      }
      const { data: inserted, error } = await context.supabase
        .from("payment_orders")
        .insert({
          owner_id,
          plan_id: plan.id,
          plan_key: plan.plan_key,
          plan_label: plan.label,
          amount_minor: plan.price_mmk ?? 0,
          currency: "MMK",
          method: "cash",
          provider: "manual",
          status: "pending",
          router_id: data.router_id ?? null,
          site_id: siteId,
          device_mac: data.device_mac ?? null,
          note: data.note ?? null,
          idempotency_key: data.idempotency_key,
          created_by: context.userId,
        })
        .select(ORDER_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      order = inserted;
    }

    const { createSupabaseStore } = await import("./payments/orders.server");
    const store = createSupabaseStore(context.supabase);
    const result = await handlePaymentEvent(store, cashSettlementEvent(order.id));
    await audit(context.supabase, {
      owner_id,
      user_id: context.userId,
      action: `order.cash_sale:${result.outcome}`,
      success: true,
    });
    return { order_id: order.id, outcome: result.outcome, code: result.code ?? order.issued_code };
  });

export const refundOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().max(300).optional() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("./guards.server");
    await requireFeature(context.supabase, context.userId, "cash_sales");
    const owner_id = await ownerOf(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("payment_orders")
      .update({
        status: "refunded",
        refunded_at: new Date().toISOString(),
        failure_reason: data.reason ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context.supabase, {
      owner_id,
      user_id: context.userId,
      action: "order.refund",
      success: true,
    });
    return { ok: true };
  });

export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("./guards.server");
    await requireFeature(context.supabase, context.userId, "cash_sales");
    const { error } = await context.supabase
      .from("payment_orders")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------------------------------------------------- sessions ---

const SESSION_COLUMNS =
  "id, router_id, site_id, voucher_code_id, code, plan_key, plan_label, external_session_id, device_mac, device_ip, username, started_at, ended_at, duration_seconds, bytes_in, bytes_out, termination_reason, source_seen_at, reconcile_status, reconcile_note";

export const listSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        status: z.enum(["open", "closed", "stale", "queued"]).optional(),
        router_id: z.string().uuid().nullable().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("hotspot_sessions")
      .select(SESSION_COLUMNS)
      .order("started_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("reconcile_status", data.status);
    if (data.router_id) q = q.eq("router_id", data.router_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("hotspot_sessions")
      .select(SESSION_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

function parseUptime(v: string | undefined): number {
  if (!v) return 0;
  let total = 0;
  for (const [, num, unit] of v.matchAll(/(\d+)([wdhms])/g)) {
    const n = Number(num);
    total +=
      unit === "w"
        ? n * 604800
        : unit === "d"
          ? n * 86400
          : unit === "h"
            ? n * 3600
            : unit === "m"
              ? n * 60
              : n;
  }
  return total;
}

/**
 * Polls one router for its active hotspot users and reconciles the durable
 * session records. When the router is unreachable nothing is closed — open
 * sessions are marked `stale` so the numbers are never silently wrong.
 */
export const syncRouterSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ router_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { requireNotExpired } = await import("./guards.server");
    await requireNotExpired(context.supabase, context.userId);
    const owner_id = await ownerOf(context.supabase, context.userId);

    const { data: storedRows, error } = await context.supabase
      .from("hotspot_sessions")
      .select(SESSION_COLUMNS)
      .eq("router_id", data.router_id)
      .in("reconcile_status", ["open", "stale", "queued"])
      .limit(500);
    if (error) throw new Error(error.message);
    const stored = (storedRows ?? []) as unknown as StoredSession[];

    let reachable = true;
    let samples: SessionSample[] = [];
    let routerError: string | null = null;
    try {
      const { loadRouterConn } = await import("./router-conn.server");
      const { routerAPI } = await import("./mikrotik.server");
      const conn = await loadRouterConn(context.supabase, data.router_id);
      const active = (await routerAPI.activeUsers(conn)) ?? [];
      samples = active.map((a: Record<string, string>) => ({
        external_session_id: a[".id"] ?? `${a["user"] ?? "?"}:${a["mac-address"] ?? "?"}`,
        device_mac: a["mac-address"] ?? null,
        device_ip: a["address"] ?? null,
        username: a["user"] ?? null,
        code: a["user"] ?? null,
        bytes_in: Number(a["bytes-in"] ?? 0),
        bytes_out: Number(a["bytes-out"] ?? 0),
        duration_seconds: parseUptime(a["uptime"]),
      }));
    } catch (e) {
      reachable = false;
      routerError = e instanceof Error ? e.message : String(e);
    }

    const { inserts, updates } = reconcileSessions({ stored, samples, reachable });

    const { data: router } = await context.supabase
      .from("router_connections")
      .select("site_id")
      .eq("id", data.router_id)
      .maybeSingle();

    if (inserts.length) {
      const { error: insErr } = await context.supabase.from("hotspot_sessions").insert(
        inserts.map((i) => ({
          owner_id,
          router_id: data.router_id,
          site_id: router?.site_id ?? null,
          external_session_id: i.external_session_id,
          device_mac: i.device_mac,
          device_ip: i.device_ip,
          username: i.username,
          code: i.code,
          bytes_in: i.bytes_in,
          bytes_out: i.bytes_out,
          duration_seconds: i.duration_seconds,
          source_seen_at: i.source_seen_at,
          reconcile_status: i.reconcile_status,
        })),
      );
      if (insErr) throw new Error(insErr.message);
    }
    for (const u of updates) {
      const { id, ...patch } = u;
      const { error: updateError } = await context.supabase
        .from("hotspot_sessions")
        .update(patch)
        // Defense in depth: keep reconciliation writes in this owner's scope.
        .eq("id", id)
        .eq("owner_id", owner_id);
      if (updateError) {
        await audit(context.supabase, {
          owner_id,
          user_id: context.userId,
          action: "sessions.reconcile_failed",
          success: false,
          error: updateError.message,
        });
        throw new Error("Session reconciliation could not be saved");
      }
    }

    await audit(context.supabase, {
      owner_id,
      user_id: context.userId,
      action: reachable ? "sessions.sync" : "sessions.sync_offline",
      success: reachable,
      error: routerError,
    });

    return {
      reachable,
      error: routerError,
      inserted: inserts.length,
      updated: updates.length,
      stale: reachable ? 0 : updates.length,
    };
  });

// --------------------------------------------------------------- revenue ---

/**
 * Revenue split by source. Orders are authoritative; legacy voucher
 * redemptions and manual sales are only counted when no order covers them.
 */
export const revenueBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireFeature } = await import("./guards.server");
    await requireFeature(context.supabase, context.userId, "cash_sales");
    const [{ data: orders }, { data: vouchers }, { data: sales }] = await Promise.all([
      context.supabase
        .from("payment_orders")
        .select(
          "id, status, method, amount_minor, plan_label, issued_code, site_id, router_id, settled_at, refunded_at, created_at",
        )
        .limit(2000),
      context.supabase
        .from("voucher_codes")
        .select(
          "code, plan_label, plan_key, price_mmk, first_seen_at, expires_at, site_id, router_id, order_id, status",
        )
        .limit(5000),
      context.supabase
        .from("voucher_sales")
        .select("code, profile, price_cents, sold_at, site_id, router_id")
        .limit(5000),
    ]);

    const entries: RevenueEntry[] = buildRevenueEntries({
      orders: (orders ?? []) as never,
      vouchers: (vouchers ?? []) as never,
      legacySales: (sales ?? []) as never,
    });

    const { appStartOfDay } = await import("./time");
    const startToday = appStartOfDay(Date.now());
    return {
      currency: "MMK",
      today: totalsFor(entries, startToday),
      week: totalsFor(entries, startToday - 6 * 86_400_000),
      month: totalsFor(entries, startToday - 29 * 86_400_000),
      all: totalsFor(entries),
      bySource: breakdownBySource(entries),
    };
  });

/**
 * Route-level authorization for the back-office finance area (/app/orders).
 * The navigation hides the tab; this is the server-side check a deep link
 * cannot bypass. It returns nothing sensitive — only allowed/denied.
 */
export const requireFinanceAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireFeature } = await import("./guards.server");
    await requireFeature(context.supabase, context.userId, "cash_sales");
    return { allowed: true as const };
  });
