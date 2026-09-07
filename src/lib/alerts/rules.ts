// Alert evaluation, deduplication and cooldown.
//
// Pure and browser-safe so both the server evaluator and the tests use the
// exact same logic. An alert only becomes an incident when its rule is
// enabled, its condition holds, and no matching open incident is already
// inside the cooldown window.

export const INCIDENT_KINDS = [
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
] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];

export const INCIDENT_LABEL: Record<IncidentKind, string> = {
  site_offline: "Site offline",
  wan_degraded: "Internet uplink degraded",
  connector_stale: "Local connector stale",
  poe_ap_offline: "Access point offline",
  provisioning_failed: "Provisioning failed",
  interface_down: "Interface down",
  dhcp_pool_high: "DHCP pool nearly full",
  router_anomaly: "Router anomaly",
  wan_saturated: "WAN link saturated",
  vpn_peer_down: "VPN peer down",
};

export type Severity = "info" | "warning" | "critical";

export const DEFAULT_SEVERITY: Record<IncidentKind, Severity> = {
  site_offline: "critical",
  wan_degraded: "warning",
  connector_stale: "warning",
  poe_ap_offline: "warning",
  provisioning_failed: "critical",
  interface_down: "critical",
  dhcp_pool_high: "warning",
  router_anomaly: "warning",
  wan_saturated: "warning",
  vpn_peer_down: "warning",
};

/** Minutes an identical incident stays suppressed after the last notification. */
export const DEFAULT_COOLDOWN_MIN: Record<IncidentKind, number> = {
  site_offline: 15,
  wan_degraded: 30,
  connector_stale: 60,
  poe_ap_offline: 30,
  provisioning_failed: 5,
  interface_down: 10,
  dhcp_pool_high: 60,
  router_anomaly: 30,
  wan_saturated: 20,
  vpn_peer_down: 15,
};

export type AlertRule = {
  kind: IncidentKind;
  enabled: boolean;
  severity: Severity;
  cooldownMinutes: number;
  /** Consecutive failing samples required before firing. */
  threshold: number;
};

export function defaultRules(): AlertRule[] {
  return INCIDENT_KINDS.map((kind) => ({
    kind,
    enabled: true,
    severity: DEFAULT_SEVERITY[kind],
    cooldownMinutes: DEFAULT_COOLDOWN_MIN[kind],
    threshold: kind === "provisioning_failed" ? 1 : 2,
  }));
}

/** A candidate produced by the evaluator before dedup/cooldown is applied. */
export type IncidentSignal = {
  kind: IncidentKind;
  /** Stable identity of the failing thing (site id, router id, port ref …). */
  subjectId: string;
  subjectLabel: string;
  /** Consecutive failing observations backing this signal. */
  consecutive: number;
  detail?: string;
};

/** An incident already recorded, used to suppress repeats. */
export type OpenIncident = {
  kind: IncidentKind;
  subjectId: string;
  /** ISO timestamp of the last time this incident notified. */
  lastNotifiedAt: string | null;
  resolvedAt: string | null;
};

export type DedupDecision =
  | { action: "create"; signal: IncidentSignal; severity: Severity }
  | { action: "suppress"; signal: IncidentSignal; reason: string };

function keyOf(kind: IncidentKind, subjectId: string) {
  return `${kind}::${subjectId}`;
}

/**
 * Apply rule gating, threshold and cooldown. Deterministic: the same inputs
 * always produce the same decisions, so the evaluator can run on a schedule
 * without spamming.
 */
export function decideIncidents(
  signals: readonly IncidentSignal[],
  rules: readonly AlertRule[],
  open: readonly OpenIncident[],
  now: number = Date.now(),
): DedupDecision[] {
  const ruleFor = new Map(rules.map((r) => [r.kind, r]));
  const openMap = new Map<string, OpenIncident>();
  for (const inc of open) {
    if (inc.resolvedAt) continue;
    openMap.set(keyOf(inc.kind, inc.subjectId), inc);
  }
  const seen = new Set<string>();
  const out: DedupDecision[] = [];

  for (const signal of signals) {
    const key = keyOf(signal.kind, signal.subjectId);
    const rule = ruleFor.get(signal.kind);
    if (!rule || !rule.enabled) {
      out.push({ action: "suppress", signal, reason: "Alert rule is turned off." });
      continue;
    }
    if (seen.has(key)) {
      out.push({ action: "suppress", signal, reason: "Duplicate signal in the same run." });
      continue;
    }
    seen.add(key);
    if (signal.consecutive < rule.threshold) {
      out.push({
        action: "suppress",
        signal,
        reason: `Seen ${signal.consecutive} of ${rule.threshold} required checks.`,
      });
      continue;
    }
    const existing = openMap.get(key);
    if (existing) {
      const last = existing.lastNotifiedAt ? Date.parse(existing.lastNotifiedAt) : null;
      if (last !== null && now - last < rule.cooldownMinutes * 60_000) {
        const mins = Math.ceil((rule.cooldownMinutes * 60_000 - (now - last)) / 60_000);
        out.push({
          action: "suppress",
          signal,
          reason: `Already alerted — quiet for another ${mins} min.`,
        });
        continue;
      }
      out.push({
        action: "suppress",
        signal,
        reason: "Incident is already open.",
      });
      continue;
    }
    out.push({ action: "create", signal, severity: rule.severity });
  }
  return out;
}

/** Open incidents whose subject no longer signals — safe to auto-resolve. */
export function resolvableIncidents(
  signals: readonly IncidentSignal[],
  open: readonly OpenIncident[],
): OpenIncident[] {
  const active = new Set(signals.map((s) => keyOf(s.kind, s.subjectId)));
  return open.filter((i) => !i.resolvedAt && !active.has(keyOf(i.kind, i.subjectId)));
}

/** Data freshness classification shared by every health surface. */
export type Freshness = "measured" | "stale" | "unavailable";

export function freshnessOf(
  observedAt: string | null | undefined,
  staleAfterMinutes = 10,
  now: number = Date.now(),
): Freshness {
  if (!observedAt) return "unavailable";
  const at = Date.parse(observedAt);
  if (Number.isNaN(at)) return "unavailable";
  return now - at <= staleAfterMinutes * 60_000 ? "measured" : "stale";
}

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  measured: "Measured now",
  stale: "Last known — not current",
  unavailable: "Not available",
};
