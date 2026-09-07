// Server-only health probing and signal building.
//
// Probing is deliberately cheap: a reachability + resource read per router.
// Signal building is pure over the stored history so the same logic is
// exercised by the tests without a database.

import type { IncidentSignal } from "./alerts/rules";
import type { DatabaseClient } from "./database.types";

export type RouterRow = {
  id: string;
  name: string;
  site_id: string | null;
  connection_mode?: string | null;
};

export type RouterProbe = {
  id: string;
  name: string;
  siteId: string | null;
  online: boolean;
  latencyMs: number | null;
  uptimeSeconds: number | null;
  wanState: "up" | "degraded" | "down" | "unknown";
  tunnelState: "up" | "down" | "none";
  error: string | null;
};

function uptimeToSeconds(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /(?:(\d+)w)?(?:(\d+)d)?(?:(\d+):)?(\d+):(\d+)/.exec(v);
  if (!m) return null;
  const [, w, d, h, mi, s] = m;
  return (
    Number(w ?? 0) * 604800 +
    Number(d ?? 0) * 86400 +
    Number(h ?? 0) * 3600 +
    Number(mi ?? 0) * 60 +
    Number(s ?? 0)
  );
}

/** Probe every router once, tolerating individual failures. */
export async function routersStatusFor(
  supabase: DatabaseClient,
  routers: readonly RouterRow[],
): Promise<RouterProbe[]> {
  const { loadRouterConn } = await import("./router-conn.server");
  const { routerAPI } = await import("./mikrotik.server");

  return Promise.all(
    routers.map(async (r): Promise<RouterProbe> => {
      const started = Date.now();
      // tunnelState retained for alert-history shape; agentless DIY tunnel is gone.
      const tunnelState: RouterProbe["tunnelState"] = "none";
      try {
        const conn = await loadRouterConn(supabase, r.id);
        const res = await routerAPI.raw<Record<string, string>>(conn, "/system/resource");
        const latency = Date.now() - started;
        let wanState: RouterProbe["wanState"] = "unknown";
        try {
          const routes = await routerAPI.routes(conn);
          const defaults = (routes ?? []).filter((x) => (x["dst-address"] ?? "") === "0.0.0.0/0");
          const active = defaults.filter((x) => x["active"] === "true");
          wanState = defaults.length === 0 ? "down" : active.length ? "up" : "degraded";
        } catch {
          wanState = "unknown";
        }
        return {
          id: r.id,
          name: r.name,
          siteId: r.site_id,
          online: true,
          latencyMs: latency,
          uptimeSeconds: uptimeToSeconds(res?.["uptime"]),
          wanState,
          tunnelState,
          error: null,
        };
      } catch (err) {
        return {
          id: r.id,
          name: r.name,
          siteId: r.site_id,
          online: false,
          latencyMs: null,
          uptimeSeconds: null,
          wanState: "unknown",
          tunnelState,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
}

type HistoryRow = {
  subject_kind: string;
  subject_id: string;
  reachable: boolean | null;
  wan_state: string | null;
  connector_state: string | null;
  observed_at: string;
};

/** How many of the most recent samples for a subject failed in a row. */
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

/** Turn the latest probe plus stored history into incident candidates. */
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
