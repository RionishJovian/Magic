/**
 * Developer-only tenant support snapshot.
 *
 * This is deliberately a separate, server-authorized read model. It does not
 * alter the caller's effective owner, expose router endpoints/credentials, or
 * reuse tenant mutation functions.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const tenantIdSchema = z.object({ tenantId: z.string().uuid() });

export type DeveloperTenantSnapshot = {
  tenant: { id: string; displayName: string };
  portal: {
    businessName: string | null;
    guestMode: string | null;
    trialMinutes: number | null;
    voucherLoginOnly: boolean;
  } | null;
  routers: Array<{
    id: string;
    name: string;
    connectionMode: string | null;
    cloudStatus: string | null;
    lastHandshakeAt: string | null;
    lastSeenAt: string | null;
    useTls: boolean;
    allowInsecureTls: boolean;
    isDefault: boolean;
    environment: string | null;
  }>;
  voucherPlans: Array<{
    id: string;
    label: string;
    planKey: string | null;
    status: string;
    priceLabel: string | null;
    priceMmk: number;
    durationLabel: string | null;
    durationMinutes: number | null;
    dataQuotaMb: number | null;
    validityDays: number | null;
    deviceLimit: number;
    rateLimit: string | null;
    isVip: boolean;
  }>;
  voucherCounts: Record<string, number>;
};

/** Platform-admin only. Returns a read-only, redacted tenant snapshot. */
export const getDeveloperTenantSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => tenantIdSchema.parse(raw))
  .handler(async ({ data, context }): Promise<DeveloperTenantSnapshot> => {
    const { requirePlatformAdmin } = await import("./admin-scope.server");
    await requirePlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordRouterOp } = await import("./audit.server");
    const started = Date.now();

    try {
      const [
        { data: profile, error: profileErr },
        { data: portal, error: portalErr },
        routersResult,
        plansResult,
        codesResult,
      ] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id, display_name, username")
          .eq("id", data.tenantId)
          .maybeSingle(),
        supabaseAdmin
          .from("portal_settings")
          .select("business_name, guest_mode, trial_minutes")
          .eq("owner_id", data.tenantId)
          .maybeSingle(),
        supabaseAdmin
          .from("router_connections")
          .select(
            "id, name, connection_mode, cloud_status, cloud_last_handshake_at, cloud_last_seen_at, use_tls, allow_insecure_tls, is_default, environment, is_virtual",
          )
          .eq("owner_id", data.tenantId)
          .order("created_at", { ascending: true }),
        supabaseAdmin
          .from("portal_plans")
          .select(
            "id, label, plan_key, status, price_label, price_mmk, duration_label, duration_minutes, data_quota_mb, validity_days, device_limit, rate_limit, is_vip, sort",
          )
          .eq("owner_id", data.tenantId)
          .order("sort", { ascending: true }),
        supabaseAdmin.from("voucher_codes").select("status").eq("owner_id", data.tenantId),
      ]);

      if (profileErr) throw new Error(profileErr.message);
      if (!profile) throw new Error("Tenant not found.");
      if (portalErr) throw new Error(portalErr.message);
      if (routersResult.error) throw new Error(routersResult.error.message);
      if (plansResult.error) throw new Error(plansResult.error.message);
      if (codesResult.error) throw new Error(codesResult.error.message);

      const voucherCounts: Record<string, number> = {};
      for (const code of codesResult.data ?? []) {
        const status = code.status || "unknown";
        voucherCounts[status] = (voucherCounts[status] ?? 0) + 1;
      }
      const { filterPhysicalRouters } = await import("./test-router");
      const routers = filterPhysicalRouters(routersResult.data ?? []).map((router) => ({
        id: router.id,
        name: router.name,
        connectionMode: router.connection_mode ?? null,
        cloudStatus: router.cloud_status ?? null,
        lastHandshakeAt: router.cloud_last_handshake_at ?? null,
        lastSeenAt: router.cloud_last_seen_at ?? null,
        useTls: Boolean(router.use_tls),
        allowInsecureTls: Boolean(router.allow_insecure_tls),
        isDefault: Boolean(router.is_default),
        environment: router.environment ?? null,
      }));
      const snapshot: DeveloperTenantSnapshot = {
        tenant: {
          id: profile.id,
          displayName: profile.display_name || profile.username || `${profile.id.slice(0, 8)}…`,
        },
        portal: portal
          ? {
              businessName: portal.business_name ?? null,
              guestMode: portal.guest_mode ?? null,
              trialMinutes: portal.trial_minutes ?? null,
              voucherLoginOnly: portal.guest_mode === "voucher_only",
            }
          : null,
        routers,
        voucherPlans: (plansResult.data ?? []).map((plan) => ({
          id: plan.id,
          label: plan.label,
          planKey: plan.plan_key ?? null,
          status: plan.status ?? "active",
          priceLabel: plan.price_label ?? null,
          priceMmk: Number(plan.price_mmk ?? 0),
          durationLabel: plan.duration_label ?? null,
          durationMinutes: plan.duration_minutes ?? null,
          dataQuotaMb: plan.data_quota_mb ?? null,
          validityDays: plan.validity_days ?? null,
          deviceLimit: Number(plan.device_limit ?? 1),
          rateLimit: plan.rate_limit ?? null,
          isVip: Boolean(plan.is_vip),
        })),
        voucherCounts,
      };
      await recordRouterOp({
        userId: context.userId,
        ownerId: data.tenantId,
        action: "developer_tenant_viewed",
        outcome: "ok",
        detail: "Developer opened read-only tenant configuration and voucher-plan view.",
        durationMs: Date.now() - started,
      });
      return snapshot;
    } catch (error) {
      const { redactText } = await import("./redact.server");
      const message = redactText(error instanceof Error ? error.message : String(error)).slice(
        0,
        500,
      );
      await recordRouterOp({
        userId: context.userId,
        ownerId: data.tenantId,
        action: "developer_tenant_viewed",
        outcome: "failed",
        error: message,
        durationMs: Date.now() - started,
      });
      throw new Error(message);
    }
  });
