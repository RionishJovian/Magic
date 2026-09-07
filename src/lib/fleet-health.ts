

export function consecutiveFailures(
  history: readonly HistoryRow[],
  subjectKind: string,
  subjectId: string,
  failed: (row: HistoryRow) => boolean,
): number {
  let n = 0;
  for (const row of history) {
    if (row.subject_kind !== subjectKind || row.subject_id !== subjectId) continue;
    if (!failed(row)) break;
    n += 1;
  }
  return n;
}

export function buildSignals(
  history: readonly HistoryRow[],
  probes: readonly RouterProbe[],
  connectors: ReadonlyArray<Record<string, unknown>>,
  now: number = Date.now(),
): IncidentSignal[] {
  const out: IncidentSignal[] = [];

  for (const p of probes) {
    if (!p.online) {
      out.push({
        kind: "site_offline",
        subjectId: p.id,
        subjectLabel: p.name,
        consecutive: Math.max(
          1,
          consecutiveFailures(history, "router", p.id, (r) => r.reachable === false),
        ),
        detail: p.error ?? undefined,
      });
      continue;
    }
    if (p.wanState === "degraded" || p.wanState === "down") {
      out.push({
        kind: "wan_degraded",
        subjectId: p.id,
        subjectLabel: p.name,
        consecutive: Math.max(
          1,
          consecutiveFailures(
            history,
            "router",
            p.id,
            (r) => r.wan_state === "degraded" || r.wan_state === "down",
          ),
        ),
        detail: `Internet uplink is ${p.wanState}.`,
      });
    }
    if (p.cpuUsagePct !== null && p.cpuUsagePct >= 85) {
      out.push({
        kind: "router_cpu_high",
        subjectId: p.id,
        subjectLabel: p.name,
        consecutive: Math.max(
          1,
          consecutiveFailures(history, "router", p.id, (r) => (r.cpu_usage_pct ?? 0) >= 85),
        ),
        detail: `CPU usage is ${p.cpuUsagePct.toFixed(1)}%. Inspect active traffic and processes; no command was run automatically.`,
      });
    }
    if (p.memoryUsagePct !== null && p.memoryUsagePct >= 90) {
      out.push({
        kind: "router_memory_high",
        subjectId: p.id,
        subjectLabel: p.name,
        consecutive: Math.max(
          1,
          consecutiveFailures(history, "router", p.id, (r) => (r.memory_usage_pct ?? 0) >= 90),
        ),
        detail: `Memory usage is ${p.memoryUsagePct.toFixed(1)}%. Review services and logs; no reboot was run automatically.`,
      });
    }
  }

  for (const c of connectors) {
    if (!c["enabled"]) continue;
    const seen = c["last_seen_at"] ? Date.parse(c["last_seen_at"] as string) : null;
    const stale = seen === null || now - seen > 10 * 60_000;
    if (!stale) continue;
    out.push({
      kind: "connector_stale",
      subjectId: c["id"] as string,
      subjectLabel: (c["name"] as string) ?? "Local connector",
      consecutive: Math.max(
        1,
        consecutiveFailures(history, "connector", c["id"] as string, (r) => r.reachable === false),
      ),
      detail: "No heartbeat in the last 10 minutes.",
    });
  }

  return out;
}