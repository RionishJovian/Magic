// Supabase-backed implementation of the payment store plus order helpers.
// Server-only: uses the service-role client, so callers must authorise first
// (public checkout routes validate a portal token; owner screens use RLS).

import type { OrderRecord } from "./types";
import type { PaymentStore } from "./core";
import type { DatabaseClient } from "../database.types";
import type { Json } from "@/integrations/supabase/types";
import { randomCode } from "../portal/voucher-codes";

export { randomCode };

export const ORDER_COLUMNS =
  "id, owner_id, status, method, provider, provider_ref, amount_minor, currency, plan_id, plan_key, plan_label, router_id, site_id, device_mac, voucher_code_id, issued_code, fulfilled_at, settled_at, refunded_at, failure_reason, note, contact_hint, checkout_url, created_at, updated_at";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonPayload(value: unknown): Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  if (Array.isArray(value)) return value.map(jsonPayload);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        item === undefined ? null : jsonPayload(item),
      ]),
    );
  }
  return String(value);
}

export function createSupabaseStore(
  db: DatabaseClient,
  options: { serviceRole?: boolean } = {},
): PaymentStore {
  return {
    async findOrder(ref: string): Promise<OrderRecord | null> {
      if (UUID_RE.test(ref)) {
        const { data } = await db
          .from("payment_orders")
          .select(ORDER_COLUMNS)
          .eq("id", ref)
          .maybeSingle();
        if (data) return data as OrderRecord;
      }
      const { data } = await db
        .from("payment_orders")
        .select(ORDER_COLUMNS)
        .eq("provider_ref", ref)
        .limit(1)
        .maybeSingle();
      return (data as OrderRecord | null) ?? null;
    },

    async patchOrder(id, patch) {
      const { error } = await db.from("payment_orders").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },

    async claimEvent(event) {
      const { error } = await db.from("payment_events").insert({
        provider: event.provider,
        event_id: event.eventId,
        event_type: event.type,
        order_id: event.orderId,
        owner_id: event.ownerId,
        payload: jsonPayload(event.payload),
      });
      if (!error) return true;
      // 23505 = unique violation on (provider, event_id): already handled.
      if (String(error.code) === "23505" || /duplicate key/i.test(error.message ?? ""))
        return false;
      throw new Error(error.message);
    },

    async finishEvent(provider, eventId, outcome) {
      await db
        .from("payment_events")
        .update({ outcome, processed_at: new Date().toISOString() })
        .eq("provider", provider)
        .eq("event_id", eventId);
    },

    async releaseEvent(provider, eventId) {
      await db.from("payment_events").delete().eq("provider", provider).eq("event_id", eventId);
    },

    async issueVoucher(order) {
      // Reuse an already-issued voucher if one somehow exists for this order.
      const { data: existing } = await db
        .from("voucher_codes")
        .select("id, code")
        .eq("order_id", order.id)
        .limit(1)
        .maybeSingle();
      if (existing) return { voucherId: existing.id as string, code: existing.code as string };

      let plan: {
        id: string;
        plan_key: string;
        label: string;
        duration_minutes: number | null;
        device_limit: number;
        rate_limit: string | null;
        price_mmk: number;
        manual_code: string | null;
        is_vip: boolean;
        data_quota_mb: number | null;
        validity_days: number | null;
      } | null = null;
      if (order.plan_id) {
        const { data } = await db
          .from("portal_plans")
          .select(
            "id, plan_key, label, duration_minutes, device_limit, rate_limit, price_mmk, manual_code, is_vip, data_quota_mb, validity_days",
          )
          .eq("id", order.plan_id)
          .maybeSingle();
        if (data?.plan_key) {
          plan = {
            id: data.id,
            plan_key: data.plan_key,
            label: data.label,
            duration_minutes: data.duration_minutes,
            device_limit: data.device_limit,
            rate_limit: data.rate_limit,
            price_mmk: data.price_mmk,
            manual_code: data.manual_code,
            is_vip: data.is_vip,
            data_quota_mb: data.data_quota_mb,
            validity_days: data.validity_days,
          };
        }
      }

      const code = plan?.is_vip && plan.manual_code ? plan.manual_code.toUpperCase() : randomCode();
      const { hotspotProfileName } = await import("../portal/profile-name");
      const planKey = order.plan_key ?? plan?.plan_key ?? "custom";
      const boundProfile = hotspotProfileName(planKey);
      const { expiresAtFromValidityDays } = await import("../portal/voucher-codes");
      const stockExpiresAt =
        plan && !plan.is_vip ? expiresAtFromValidityDays(plan.validity_days) : null;
      let siteId = order.site_id;
      if (!siteId && order.router_id) {
        const { data: routerRow } = await db
          .from("router_connections")
          .select("site_id")
          .eq("id", order.router_id)
          .maybeSingle();
        siteId = (routerRow?.site_id as string | null | undefined) ?? null;
      }
      const { data: row, error } = await db
        .from("voucher_codes")
        .insert({
          owner_id: order.owner_id,
          router_id: order.router_id,
          site_id: siteId,
          plan_id: order.plan_id ?? null,
          plan_key: planKey,
          plan_label: order.plan_label,
          hotspot_profile: boundProfile,
          profile_bound_at: new Date().toISOString(),
          code,
          price_mmk: order.amount_minor,
          duration_minutes: plan?.duration_minutes ?? null,
          expires_at: stockExpiresAt,
          device_mac: order.device_mac,
          status: "unused",
          order_id: order.id,
        })

        .select("id, code")
        .single();
      if (error) throw new Error(error.message);

      // Captive-portal login is RouterOS-native: without a hotspot user the code
      // will not work even though the ledger row exists.
      if (order.router_id) {
        const { loadRouterConn, loadRouterConnForOwner } = await import("../router-conn.server");
        const { routerAPI } = await import("../mikrotik.server");
        const { hotspotUserCreateBody, PLAN_TAG } = await import("../portal/plan-profile");
        const { ensurePlanProfileOnRouter } = await import("../portal/ensure-plan-profile.server");
        try {
          const conn = options.serviceRole
            ? await loadRouterConnForOwner(db, order.router_id, order.owner_id)
            : await loadRouterConn(db, order.router_id);
          if (plan) {
            await ensurePlanProfileOnRouter(conn, {
              plan_key: plan.plan_key,
              duration_minutes: plan.duration_minutes,
              device_limit: plan.device_limit,
              rate_limit: plan.rate_limit,
              is_vip: plan.is_vip,
              data_quota_mb: plan.data_quota_mb,
            });
          }
          await routerAPI.addUser(
            conn,
            hotspotUserCreateBody({
              name: code,
              password: code,
              profile: boundProfile,
              comment: `${PLAN_TAG}:${planKey}`,
              dataQuotaMb: plan?.is_vip ? null : plan?.data_quota_mb,
            }),
          );
        } catch (routerErr) {
          await db.from("voucher_codes").delete().eq("id", row.id);
          throw routerErr instanceof Error ? routerErr : new Error(String(routerErr));
        }
      }

      return { voucherId: row.id as string, code: row.code as string };
    },
  };
}

/**
 * Review store: the payment store plus the two extra writes an owner decision
 * needs (receipt state and the order audit trail).
 */
export function createReviewStore(
  db: DatabaseClient,
  options: { serviceRole?: boolean } = {},
): import("./review").ReviewStore {
  const base = createSupabaseStore(db, options);
  return {
    ...base,
    async patchReceipt(receiptId, patch) {
      const { error } = await db.from("payment_receipts").update(patch).eq("id", receiptId);
      if (error) throw new Error(error.message);
    },
    async audit(entry) {
      await db.from("payment_order_audit").insert({
        owner_id: entry.ownerId,
        order_id: entry.orderId,
        from_status: entry.from,
        to_status: entry.to,
        actor: entry.actor,
        actor_user_id: entry.actorUserId ?? null,
        note: entry.note ?? null,
      });
    },
  };
}
