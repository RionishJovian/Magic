import type { RouterConn } from "@/lib/mikrotik.server";
import { routerAPI } from "@/lib/mikrotik.server";
import { estimatePoolSize } from "@/lib/fleet-probe.server";
import { MM_HOTSPOT_POOL_NAME } from "@/lib/wifi-hotspot.server";
import {
  evaluateGuestPoolHealth,
  poolUsagePct,
  type TopologyGuestPool,
  type TopologyPoolBinding,
  type TopologyPoolHealth,
} from "./pool-health";

type Row = Record<string, string>;

async function listRows(c: RouterConn, path: string): Promise<Row[]> {
  try {
    const rows = await routerAPI.raw<Row[]>(c, path);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export type TopologyPoolSnapshot = {
  guestPool: TopologyGuestPool | null;
  bindings: TopologyPoolBinding[];
  poolHealth: TopologyPoolHealth;
  poolHealthDetail: string;
};

/** Read guest IP pool usage and whether hotspot + DHCP share the same pool on the LAN bridge. */
export async function probeGuestPoolSharing(
  c: RouterConn,
  hotspotBridge: string | null,
): Promise<TopologyPoolSnapshot> {
  const [pools, poolUsed, hotspots, dhcpServers] = await Promise.all([
    listRows(c, "/ip/pool"),
    listRows(c, "/ip/pool/used"),
    listRows(c, "/ip/hotspot"),
    listRows(c, "/ip/dhcp-server"),
  ]);

  const usedByPool = new Map<string, number>();
  for (const row of poolUsed) {
    const pool = row.pool ?? row["pool"];
    if (!pool) continue;
    usedByPool.set(pool, (usedByPool.get(pool) ?? 0) + 1);
  }

  const magicRow = pools.find((p) => p.name === MM_HOTSPOT_POOL_NAME) ?? null;
  const pickRow = magicRow ?? pools[0] ?? null;
  let guestPool: TopologyGuestPool | null = null;
  if (pickRow?.name) {
    const total = estimatePoolSize(pickRow.ranges);
    const used = usedByPool.get(pickRow.name) ?? 0;
    guestPool = {
      name: pickRow.name,
      ranges: pickRow.ranges ?? null,
      total,
      used,
      usagePct: poolUsagePct(total, used),
    };
  }

  const bindings: TopologyPoolBinding[] = [];
  for (const row of hotspots) {
    if (row.disabled === "true") continue;
    bindings.push({
      role: "hotspot",
      serverName: row.name ?? "hotspot",
      interface: row.interface ?? "",
      addressPool: row["address-pool"] ?? null,
    });
  }
  for (const row of dhcpServers) {
    if (row.disabled === "true") continue;
    bindings.push({
      role: "dhcp",
      serverName: row.name ?? "dhcp",
      interface: row.interface ?? "",
      addressPool: row["address-pool"] ?? null,
    });
  }

  const { health, detail } = evaluateGuestPoolHealth({
    hotspotBridge,
    guestPool,
    bindings,
  });

  return {
    guestPool,
    bindings,
    poolHealth: health,
    poolHealthDetail: detail,
  };
}
