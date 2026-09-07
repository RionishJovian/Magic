import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Durable health history, alert rules, incidents and notification preferences.
// Every number the UI shows is either measured and timestamped, or explicitly
// marked unavailable — nothing here fabricates a reading.

const severity = z.enum(["info", "warning", "critical"]);
const incidentKind = z.enum([
  "site_offline",
  "wan_degraded",
  "connector_stale",
  "poe_ap_offline",
  "provisioning_failed",
  "interface_down",
  "dhcp_pool_high",
  "router_anomaly",
  "wan_saturated",
  "vpn_peer_down",
  "router_cpu_high",
  "router_memory_high",
]);

export const listHealthHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        subjectKind: z.enum(["site", "router", "device", "connector"]).optional(),
        subjectId: z.string().max(80).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    let q = context.supabase
      .from("device_health_samples")
      .select(
        "id, subject_kind, subject_id, site_id, device_id, router_id, reachable, latency_ms, uptime_seconds, cpu_usage_pct, memory_usage_pct, free_memory_bytes, total_memory_bytes, wan_state, connector_state, tunnel_state, observed_at",
      )
      .order("observed_at", { ascending: false })
      .limit(data.limit ?? 200);
    if (data.subjectKind) q = q.eq("subject_kind", data.subjectKind);
    if (data.subjectId) q = q.eq("subject_id", data.subjectId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Take one reachability sweep, store it, and turn the result into incidents
 * through the shared dedup/cooldown rules. Called from the Incidents page and
 * from the scheduled maintenance hook.
 */
export const runHealthSweep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const guards = await import("./guards.server");
    await guards.requireNotExpired(context.supabase, context.userId);
    const ownerId = await guards.effectiveOwner(context.supabase, context.userId);
    const { runHealthSweepForOwner } = await import("./monitoring.server");
    return runHealthSweepForOwner(ownerId);
  });

export const listIncidents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ includeResolved: z.boolean().optional() }).parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    let q = context.supabase
      .from("incidents")
      .select(
        "id, kind, severity, subject_id, subject_label, detail, opened_at, last_seen_at, resolved_at, acknowledged_at",
      )
      .order("opened_at", { ascending: false })
      .limit(200);
    if (!data.includeResolved) q = q.is("resolved_at", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const acknowledgeIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("incidents")
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Hide an already-acknowledged incident from the open list. */
export const dismissIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    const { data: row, error: readErr } = await context.supabase
      .from("incidents")
      .select("id, acknowledged_at")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!row?.acknowledged_at) throw new Error("Acknowledge this alert before removing it.");
    const { error } = await context.supabase
      .from("incidents")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", data.id)
      .not("acknowledged_at", "is", null);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listAlertRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("alert_rules")
      .select("id, kind, enabled, severity, cooldown_minutes, threshold")
      .order("kind", { ascending: true });
    if (error) throw new Error(error.message);
    if ((data ?? []).length) return data ?? [];
    const { defaultRules } = await import("./alerts/rules");
    return defaultRules().map((r) => ({
      id: null,
      kind: r.kind,
      enabled: r.enabled,
      severity: r.severity,
      cooldown_minutes: r.cooldownMinutes,
      threshold: r.threshold,
    }));
  });

export const saveAlertRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        kind: incidentKind,
        enabled: z.boolean(),
        severity,
        cooldownMinutes: z.number().int().min(1).max(1440),
        threshold: z.number().int().min(1).max(20),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const guards = await import("./guards.server");
    await guards.requireNotExpired(context.supabase, context.userId);
    await guards.requireFeature(context.supabase, context.userId, "alerts");
    const ownerId = await guards.effectiveOwner(context.supabase, context.userId);
    const { error } = await context.supabase.from("alert_rules").upsert(
      {
        owner_id: ownerId,
        kind: data.kind,
        enabled: data.enabled,
        severity: data.severity,
        cooldown_minutes: data.cooldownMinutes,
        threshold: data.threshold,
      },
      { onConflict: "owner_id,kind" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getNotificationPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await (await import("./guards.server")).requireNotExpired(context.supabase, context.userId);
    const { data } = await context.supabase
      .from("notification_prefs")
      .select("in_app, email, quiet_hours_start, quiet_hours_end, min_severity")
      .maybeSingle();
    return (
      data ?? {
        in_app: true,
        email: false,
        quiet_hours_start: null,
        quiet_hours_end: null,
        min_severity: "warning",
      }
    );
  });

export const saveNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        inApp: z.boolean(),
        email: z.boolean(),
        quietHoursStart: z.number().int().min(0).max(23).nullable(),
        quietHoursEnd: z.number().int().min(0).max(23).nullable(),
        minSeverity: severity,
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const guards = await import("./guards.server");
    await guards.requireNotExpired(context.supabase, context.userId);
    const ownerId = await guards.effectiveOwner(context.supabase, context.userId);
    const { error } = await context.supabase.from("notification_prefs").upsert(
      {
        owner_id: ownerId,
        in_app: data.inApp,
        email: data.email,
        quiet_hours_start: data.quietHoursStart,
        quiet_hours_end: data.quietHoursEnd,
        min_severity: data.minSeverity,
      },
      { onConflict: "owner_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
