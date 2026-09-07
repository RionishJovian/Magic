import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Cheap, tenant-scoped aggregate counts used to render the status pills on the
 * Overview page. Counts only — no RouterOS probing and no AI calls, so this is
 * safe to poll alongside `routersStatus`.
 */
export const getOverviewSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { getRoles, isPrivilegedAccount, isPlatformAdminUser } = await import("./guards.server");
    const { appStartOfDay, appStartOfDaysAgo } = await import("./time");

    const roles = await getRoles(supabase, userId);
    const isPlatformAdmin = await isPlatformAdminUser(supabase, userId);
    const privileged = isPrivilegedAccount(roles, isPlatformAdmin);

    const startToday = new Date(appStartOfDay()).toISOString();
    const start30 = new Date(appStartOfDaysAgo(29)).toISOString();
    const now = Date.now();

    const head = { count: "exact" as const, head: true };

    const [
      routers,
      sites,
      unifi,
      plans,
      vouchers,
      deploy,
      syslogToday,
      syslogCritical,
      accounts,
      aiUsage,
    ] = await Promise.all([
      supabase.from("router_connections").select("id", head),
      supabase.from("sites").select("id", head),
      supabase.from("unifi_controllers").select("id", head),
      supabase.from("portal_plans").select("id", head),
      supabase
        .from("voucher_codes")
        .select("status, expires_at, first_seen_at, price_mmk")
        .limit(5000),
      supabase
        .from("portal_deploy_audit")
        .select("ok, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("syslog_events").select("id", head).gte("received_at", startToday),
      supabase
        .from("syslog_events")
        .select("id", head)
        .gte("received_at", startToday)
        .in("severity", ["emergency", "alert", "critical", "error"]),
      privileged ? supabase.from("profiles").select("id", head) : Promise.resolve({ count: null }),
      privileged
        ? supabase.from("ai_usage_events").select("total_tokens").gte("created_at", start30)
        : Promise.resolve({ data: null }),
    ]);

    let vouchersActive = 0;
    let vouchersTotal = 0;
    let revenue30 = 0;
    for (const v of (vouchers.data ?? []) as Array<{
      status: string;
      expires_at: string | null;
      first_seen_at: string | null;
      price_mmk: number | null;
    }>) {
      vouchersTotal += 1;
      if (["cancelled", "deleted"].includes(v.status.toLowerCase())) continue;
      const expiresAt = v.expires_at ? new Date(v.expires_at).getTime() : null;
      const expired = v.status === "expired" || (expiresAt != null && expiresAt <= now);
      if (!expired) vouchersActive += 1;
      if (v.first_seen_at) {
        const at = new Date(v.first_seen_at).getTime();
        if (at >= new Date(start30).getTime()) revenue30 += v.price_mmk ?? 0;
      }
    }

    const aiTokens30 = (
      (aiUsage as { data: Array<{ total_tokens: number }> | null }).data ?? []
    ).reduce((sum, r) => sum + (r.total_tokens ?? 0), 0);

    return {
      routers: routers.count ?? 0,
      sites: sites.count ?? 0,
      unifi: unifi.count ?? 0,
      plans: plans.count ?? 0,
      vouchersActive,
      vouchersTotal,
      lastDeploy: deploy.data
        ? { ok: Boolean(deploy.data.ok), at: deploy.data.created_at as string }
        : null,
      syslogToday: syslogToday.count ?? 0,
      syslogCritical: syslogCritical.count ?? 0,
      revenue30,
      accounts: privileged ? ((accounts as { count: number | null }).count ?? 0) : null,
      aiTokens30: privileged ? aiTokens30 : null,
    };
  });
