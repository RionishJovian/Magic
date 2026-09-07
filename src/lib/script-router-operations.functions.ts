import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Privileged, live RouterOS actions surfaced by the Scripts page.
 *
 * The portal action deliberately performs only RouterOS REST GET requests.
 * Voucher profile sync creates or patches managed profiles; it never creates
 * vouchers and never removes profiles from this page.
 */

const routerIdInput = (raw: unknown) => z.object({ routerId: z.string().uuid() }).parse(raw);

async function loadPrivilegedRouter(
  context: {
    supabase: import("./database.types").DatabaseClient;
    userId: string;
  },
  routerId: string,
) {
  const { requirePrivileged, effectiveOwner } = await import("./guards.server");
  await requirePrivileged(context.supabase, context.userId);

  const ownerId = await effectiveOwner(context.supabase, context.userId);
  const { data: router, error } = await context.supabase
    .from("router_connections")
    .select("id, name, owner_id, is_virtual, site_id")
    .eq("id", routerId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!router) throw new Error("Router not found.");

  const { assertNotVirtualRouter } = await import("./test-router");
  assertNotVirtualRouter(router, "run Scripts page operations");
  return { router, ownerId };
}

export const listScriptOperationRouters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requirePrivileged, effectiveOwner } = await import("./guards.server");
    await requirePrivileged(context.supabase, context.userId);
    const ownerId = await effectiveOwner(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("router_connections")
      .select("id, name, is_virtual")
      .eq("owner_id", ownerId)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    const { isVirtualRouter } = await import("./test-router");
    return (data ?? [])
      .filter((router) => !isVirtualRouter(router))
      .map((router) => ({ id: String(router.id), name: String(router.name) }));
  });

export const syncVoucherPlansFromScripts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(routerIdInput)
  .handler(async ({ data, context }) => {
    const { router, ownerId } = await loadPrivilegedRouter(context, data.routerId);
    const { data: plans, error } = await context.supabase
      .from("portal_plans")
      .select(
        "id, plan_key, label, duration_minutes, device_limit, rate_limit, price_mmk, is_vip, manual_code, data_quota_mb, validity_days, status",
      )
      .eq("owner_id", ownerId)
      .order("sort", { ascending: true });
    if (error) throw new Error(error.message);
    const validPlans = (plans ?? []).filter((plan): plan is typeof plan & { plan_key: string } =>
      Boolean(plan.plan_key),
    );
    if (!validPlans.length) throw new Error("No valid voucher plans to sync yet.");

    const { loadRouterConn } = await import("./router-conn.server");
    const { assertHotspotReadyForPlanPush } = await import("./portal/push-plans-preflight.server");
    const { ensureRouterClockAligned } = await import("./router-clock");
    const { ensurePlanProfileOnRouter } = await import("./portal/ensure-plan-profile.server");
    const { formatVoucherPlanPushError } = await import("./portal/plan-push-error");
    const { planProfileBody } = await import("./portal/plan-profile");

    const conn = await loadRouterConn(context.supabase, data.routerId);
    await assertHotspotReadyForPlanPush(conn);
    const timezoneWarning = await ensureRouterClockAligned(conn);
    const profiles: Array<{
      planKey: string;
      planLabel: string;
      hotspotProfile: string;
      action?: "created" | "updated";
      error?: string;
    }> = [];

    for (const plan of validPlans) {
      const body = planProfileBody(plan);
      try {
        const action = await ensurePlanProfileOnRouter(conn, plan);
        profiles.push({
          planKey: plan.plan_key,
          planLabel: plan.label,
          hotspotProfile: body.name,
          action,
        });
      } catch (error) {
        profiles.push({
          planKey: plan.plan_key,
          planLabel: plan.label,
          hotspotProfile: body.name,
          error: formatVoucherPlanPushError(error),
        });
      }
    }

    const written = profiles.filter((profile) => profile.action).length;
    return {
      routerId: String(router.id),
      routerName: String(router.name),
      ok: written === profiles.length,
      written,
      profiles,
      timezoneWarning,
    };
  });

export const scanCaptivePortalFilesFromScripts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(routerIdInput)
  .handler(async ({ data, context }) => {
    const { router, ownerId } = await loadPrivilegedRouter(context, data.routerId);
    const { renderBundleForOwner } = await import("./portal.functions");
    const { loadRouterConn } = await import("./router-conn.server");
    const { probePortalOnRouter } = await import("./portal/portal-probe.server");

    const { files, logoPath, heroPath } = await renderBundleForOwner(context.supabase, ownerId, {
      siteIds: router.site_id ? [String(router.site_id)] : null,
    });
    const conn = await loadRouterConn(context.supabase, data.routerId);
    const probe = await probePortalOnRouter(conn, { expectedFiles: files, logoPath, heroPath });
    return { routerId: String(router.id), routerName: String(router.name), ...probe };
  });
