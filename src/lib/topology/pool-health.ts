import { MM_HOTSPOT_POOL_NAME } from "@/lib/wifi-hotspot.server";

export type TopologyGuestPool = {
  name: string;
  ranges: string | null;
  total: number;
  used: number;
  usagePct: number | null;
};

export type TopologyPoolBinding = {
  role: "hotspot" | "dhcp";
  serverName: string;
  interface: string;
  addressPool: string | null;
};

export type TopologyPoolHealth =
  | "shared_ok"
  | "split_pools"
  | "missing_pool"
  | "no_dhcp_on_bridge"
  | "no_hotspot"
  | "high_usage"
  | "unknown";

export function poolUsagePct(total: number, used: number): number | null {
  if (total <= 0) return null;
  return Math.min(100, Math.round((used / total) * 100));
}

export function evaluateGuestPoolHealth(input: {
  hotspotBridge: string | null;
  guestPool: TopologyGuestPool | null;
  bindings: TopologyPoolBinding[];
}): { health: TopologyPoolHealth; detail: string } {
  const { hotspotBridge, guestPool, bindings } = input;
  if (!hotspotBridge) {
    return { health: "unknown", detail: "No active hotspot server — pool sharing not checked." };
  }

  const hotspotOnBridge = bindings.filter(
    (b) => b.role === "hotspot" && b.interface === hotspotBridge,
  );
  const dhcpOnBridge = bindings.filter((b) => b.role === "dhcp" && b.interface === hotspotBridge);

  if (!guestPool) {
    return {
      health: "missing_pool",
      detail: `${MM_HOTSPOT_POOL_NAME} not found — guests may not get IPs until Hotspot Apply creates it.`,
    };
  }

  if (!hotspotOnBridge.length) {
    return {
      health: "no_hotspot",
      detail: `Pool ${guestPool.name} exists but no hotspot server on ${hotspotBridge}.`,
    };
  }

  if (!dhcpOnBridge.length) {
    return {
      health: "no_dhcp_on_bridge",
      detail: `No DHCP server on ${hotspotBridge} — APs and wired guests need DHCP on the gateway.`,
    };
  }

  const hotspotPools = new Set(
    hotspotOnBridge.map((b) => b.addressPool).filter((p): p is string => Boolean(p)),
  );
  const dhcpPools = new Set(
    dhcpOnBridge.map((b) => b.addressPool).filter((p): p is string => Boolean(p)),
  );

  const sharedMagicPool =
    hotspotPools.has(MM_HOTSPOT_POOL_NAME) && dhcpPools.has(MM_HOTSPOT_POOL_NAME);
  const sameCustomPool =
    hotspotPools.size === 1 && dhcpPools.size === 1 && [...hotspotPools][0] === [...dhcpPools][0];

  if (!sharedMagicPool && !sameCustomPool) {
    const hs = [...hotspotPools].join(", ") || "none";
    const dhcp = [...dhcpPools].join(", ") || "none";
    return {
      health: "split_pools",
      detail: `Hotspot uses ${hs} but DHCP on ${hotspotBridge} uses ${dhcp} — guests may fail to authenticate.`,
    };
  }

  const pct = guestPool.usagePct;
  if (pct != null && pct >= 90) {
    return {
      health: "high_usage",
      detail: `${guestPool.name} is ${pct}% full (${guestPool.used}/${guestPool.total}) — expand the range or shorten leases.`,
    };
  }

  const poolLabel = guestPool.name === MM_HOTSPOT_POOL_NAME ? MM_HOTSPOT_POOL_NAME : guestPool.name;
  const usage =
    pct != null
      ? ` · ${guestPool.used}/${guestPool.total} (${pct}%)`
      : guestPool.ranges
        ? ` · ${guestPool.ranges}`
        : "";
  return {
    health: "shared_ok",
    detail: `Hotspot and DHCP on ${hotspotBridge} share ${poolLabel}${usage}.`,
  };
}
