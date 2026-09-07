// Server-only health probing and signal building.
//
// Probing is deliberately cheap: a reachability + resource read per router.
// Signal building is pure over the stored history so the same logic is
// exercised by the tests without a database.

import type { IncidentSignal } from "./alerts/rules";
import { consecutiveFailures, buildSignals } from "./fleet-health";
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
  cpuUsagePct: number | null;
  memoryUsagePct: number | null;
  freeMemoryBytes: number | null;
  totalMemoryBytes: number | null;
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
  ownerId: string,
): Promise<RouterProbe[]> {
  const { loadRouterConnForOwner } = await import("./router-conn.server");
  const { routerAPI } = await import("./mikrotik.server");
  const { memoryUsedPercent, parseCpuLoad, toBytes } = await import("./fleet-health");

  return Promise.all(
    routers.map(async (r): Promise<RouterProbe> => {
      const started = Date.now();
      const tunnelState: RouterProbe["tunnelState"] = "none";
      try {
        const conn = await loadRouterConnForOwner(supabase, r.id, ownerId);
        const res = await routerAPI.raw<Record<string, string>>(conn, "/system/resource");
        const cpuUsagePct = parseCpuLoad(res?.["cpu-load"]) ?? null;
        const freeMemoryBytes = toBytes(res?.["free-memory"]) ?? null;
        const totalMemoryBytes = toBytes(res?.["total-memory"]) ?? null;
        const memoryUsagePct =
          memoryUsedPercent(totalMemoryBytes ?? undefined, freeMemoryBytes ?? undefined) ?? null;
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
          cpuUsagePct,
          memoryUsagePct,
          freeMemoryBytes,
          totalMemoryBytes,
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
          cpuUsagePct: null,
          memoryUsagePct: null,
          freeMemoryBytes: null,
          totalMemoryBytes: null,
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
  cpu_usage_pct?: number | null;
  memory_usage_pct?: number | null;
  observed_at: string;
};

/** How many of the most recent samples for a subject failed in a row. */