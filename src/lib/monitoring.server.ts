import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { INCIDENT_KINDS, decideIncidents, defaultRules, resolvableIncidents } from "./alerts/rules";
import type { AlertRule, IncidentKind, OpenIncident, Severity } from "./alerts/rules";
import { buildSignals, routersStatusFor } from "./health.server";

type HealthSampleInsert = Database["public"]["Tables"]["device_health_samples"]["Insert"];

const severityRank: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };

function excludedRouterIds(): Set<string> {
  return new Set(
    [
      process.env.ROUTER_MONITORING_EXCLUDED_ROUTER_IDS,
      process.env.VOUCHER_MAINTENANCE_EXCLUDED_ROUTER_IDS,
    ]
      .filter(Boolean)
      .join(",")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

function recommendationFor(kind: IncidentKind): string {
  if (kind === "router_cpu_high") {
    return "Inspect RouterOS Profile, active connections, queues, and recent configuration changes.";
  }
  if (kind === "router_memory_high") {
    return "Review RouterOS services, logs, package versions, and memory trends before considering a restart.";
  }
  if (kind === "site_offline")
    return "Check power, uplink, WireGuard or Local Connector reachability.";
  if (kind === "wan_degraded")
    return "Inspect the default route, gateway reachability, and ISP link quality.";
  if (kind === "connector_stale")
    return "Check the Local Connector host, service, and network path.";
  return "Review the incident details and verify the affected device before applying any change.";
}

export async function runHealthSweepForOwner(ownerId: string) {
  const excluded = excludedRouterIds();
  const [routersRes, connectorsRes, rulesRes, openRes, prefsRes] = await Promise.all([
    supabaseAdmin
      .from("router_connections")
      .select("id, name, site_id, connection_mode")
      .eq("owner_id", ownerId)
      .eq("is_virtual", false),
    supabaseAdmin
      .from("connectors")
      .select("id, name, status, last_seen_at, enabled")
      .eq("owner_id", ownerId),
    supabaseAdmin
      .from("alert_rules")
      .select("kind, enabled, severity, cooldown_minutes, threshold")
      .eq("owner_id", ownerId),
    supabaseAdmin
      .from("incidents")
      .select("id, kind, subject_id, last_notified_at, resolved_at")
      .eq("owner_id", ownerId)
      .is("resolved_at", null),
    supabaseAdmin
      .from("notification_prefs")
      .select("in_app, min_severity")
      .eq("owner_id", ownerId)
      .maybeSingle(),
  ]);

  for (const result of [routersRes, connectorsRes, rulesRes, openRes]) {
    if (result.error) throw new Error(result.error.message);
  }
  if (prefsRes.error) throw new Error(prefsRes.error.message);

  const allRouters = routersRes.data ?? [];
  const routers = allRouters.filter((router) => !excluded.has(router.id));
  const probes = await routersStatusFor(supabaseAdmin, routers, ownerId);

  const samples: HealthSampleInsert[] = probes.map((probe) => ({
    owner_id: ownerId,
    site_id: probe.siteId,
    router_id: probe.id,
    subject_kind: "router",
    subject_id: probe.id,
    reachable: probe.online,
    latency_ms: probe.latencyMs,
    uptime_seconds: probe.uptimeSeconds,
    cpu_usage_pct: probe.cpuUsagePct,
    memory_usage_pct: probe.memoryUsagePct,
    free_memory_bytes: probe.freeMemoryBytes,
    total_memory_bytes: probe.totalMemoryBytes,
    wan_state: probe.wanState,
    tunnel_state: probe.tunnelState,
    connector_state: null,
    detail: probe.error ? { error: probe.error } : {},
  }));

  const now = Date.now();
  for (const connector of connectorsRes.data ?? []) {
    if (!connector.enabled) continue;
    const seen = connector.last_seen_at ? Date.parse(connector.last_seen_at) : null;
    const stale = seen === null || now - seen > 10 * 60_000;
    samples.push({
      owner_id: ownerId,
      subject_kind: "connector",
      subject_id: connector.id,
      reachable: !stale,
      connector_state: stale ? "stale" : "online",
      detail: {},
    });
  }

  if (samples.length) {
    const { error } = await supabaseAdmin.from("device_health_samples").insert(samples);
    if (error) throw new Error(error.message);
  }

  const { data: history, error: historyError } = await supabaseAdmin
    .from("device_health_samples")
    .select(
      "subject_kind, subject_id, reachable, wan_state, connector_state, cpu_usage_pct, memory_usage_pct, observed_at",
    )
    .eq("owner_id", ownerId)
    .order("observed_at", { ascending: false })
    .limit(600);
  if (historyError) throw new Error(historyError.message);

  const signals = buildSignals(history ?? [], probes, connectorsRes.data ?? []);
  const rules: AlertRule[] = (rulesRes.data ?? []).length
    ? (rulesRes.data ?? []).flatMap((row) => {
        const kind = INCIDENT_KINDS.find((value) => value === row.kind);
        const severity = ["info", "warning", "critical"].includes(row.severity)
          ? (row.severity as Severity)
          : null;
        return kind && severity
          ? [
              {
                kind,
                enabled: row.enabled,
                severity,
                cooldownMinutes: row.cooldown_minutes,
                threshold: row.threshold,
              },
            ]
          : [];
      })
    : defaultRules();
  const open: OpenIncident[] = (openRes.data ?? []).flatMap((row) => {
    const kind = INCIDENT_KINDS.find((value) => value === row.kind);
    return kind
      ? [
          {
            kind,
            subjectId: row.subject_id,
            lastNotifiedAt: row.last_notified_at,
            resolvedAt: row.resolved_at,
          },
        ]
      : [];
  });

  const decisions = decideIncidents(signals, rules, open, now);
  const created = decisions.filter((decision) => decision.action === "create");
  const minSeverity = (["info", "warning", "critical"] as const).includes(
    prefsRes.data?.min_severity as Severity,
  )
    ? (prefsRes.data?.min_severity as Severity)
    : "warning";
  const inAppEnabled = prefsRes.data?.in_app !== false;
  let opened = 0;
  let notified = 0;

  for (const decision of created) {
    const at = new Date().toISOString();
    const { data: incident, error } = await supabaseAdmin
      .from("incidents")
      .insert({
        owner_id: ownerId,
        kind: decision.signal.kind,
        severity: decision.severity,
        subject_id: decision.signal.subjectId,
        subject_label: decision.signal.subjectLabel,
        detail: decision.signal.detail ?? null,
        last_seen_at: at,
        last_notified_at: at,
      })
      .select("id")
      .maybeSingle();
    if (error?.code === "23505") continue;
    if (error) throw new Error(error.message);
    if (!incident) continue;
    opened += 1;

    if (inAppEnabled && severityRank[decision.severity] >= severityRank[minSeverity]) {
      const recommendation = recommendationFor(decision.signal.kind);
      const { error: notifyError } = await supabaseAdmin.from("admin_notifications").insert({
        recipient_id: ownerId,
        kind: "router_health",
        title: `${decision.severity.toUpperCase()}: ${decision.signal.subjectLabel}`,
        body: decision.signal.detail ?? recommendation,
        data: {
          incident_id: incident.id,
          router_id: decision.signal.subjectId,
          incident_kind: decision.signal.kind,
          recommendation,
          automatic_action_executed: false,
        },
      });
      if (notifyError) throw new Error(notifyError.message);
      notified += 1;
    }
  }

  // Protected routers are omitted from both probing and incident mutation.
  const toResolve = resolvableIncidents(signals, open).filter(
    (incident) => !excluded.has(incident.subjectId),
  );
  for (const incident of toResolve) {
    const { error } = await supabaseAdmin
      .from("incidents")
      .update({ resolved_at: new Date().toISOString() })
      .eq("owner_id", ownerId)
      .eq("kind", incident.kind)
      .eq("subject_id", incident.subjectId)
      .is("resolved_at", null);
    if (error) throw new Error(error.message);
  }

  return {
    ownerId,
    sampled: samples.length,
    opened,
    resolved: toResolve.length,
    suppressed: decisions.length - opened,
    notified,
    routersExcluded: allRouters.length - routers.length,
    observedAt: new Date().toISOString(),
  };
}
