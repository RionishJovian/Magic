import type { RouterConn } from "@/lib/mikrotik.server";
import { routerAPI } from "@/lib/mikrotik.server";
import { probeGuestPoolSharing } from "./pool-probe";
import type { RouterLanProbe, TopologyDiscoveredDevice, TopologyLinkStatus } from "./types";

type Row = Record<string, string>;

const WAN_LIST_NAMES = new Set(["wan"]);

async function listRows(c: RouterConn, path: string): Promise<Row[]> {
  try {
    const rows = await routerAPI.raw<Row[]>(c, path);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function listRowsWithAccess(
  c: RouterConn,
  path: string,
): Promise<{ rows: Row[]; accessible: boolean }> {
  try {
    const rows = await routerAPI.raw<Row[]>(c, path);
    return { rows: Array.isArray(rows) ? rows : [], accessible: true };
  } catch {
    return { rows: [], accessible: false };
  }
}

async function wanInterfaceNames(c: RouterConn): Promise<string[]> {
  const lists = await listRows(c, "/interface/list");
  const wanListIds = new Set(
    lists
      .filter((l) => WAN_LIST_NAMES.has((l.name ?? "").toLowerCase()))
      .map((l) => l[".id"] ?? ""),
  );
  if (!wanListIds.size) return [];
  const members = await listRows(c, "/interface/list/member");
  return [
    ...new Set(
      members
        .filter((m) => wanListIds.has(m.list ?? ""))
        .map((m) => m.interface ?? "")
        .filter(Boolean),
    ),
  ];
}

function linkFromRunning(row: Row): TopologyLinkStatus {
  if (row.running === "true") return "up";
  if (row.running === "false") return "down";
  return "unknown";
}

function gatewayFromAddresses(rows: Row[], bridge: string): string | null {
  const row = rows.find((a) => a.interface === bridge);
  if (!row?.address) return null;
  return row.address.split("/")[0] ?? null;
}

function normalizeMac(value: string | undefined): string {
  return (value ?? "").toUpperCase();
}

function validClientMac(value: string): boolean {
  return (
    /^[0-9A-F]{2}(?::[0-9A-F]{2}){5}$/.test(value) &&
    value !== "00:00:00:00:00:00" &&
    value !== "FF:FF:FF:FF:FF:FF"
  );
}

function discoveredNetworkDevices(input: {
  bridgeHosts: Row[];
  leases: Row[];
  arps: Row[];
  hotspotClients: Row[];
  fallbackInterface: string;
}): TopologyDiscoveredDevice[] {
  const devices = new Map<string, TopologyDiscoveredDevice>();

  const merge = (
    macAddress: string,
    patch: Partial<Omit<TopologyDiscoveredDevice, "macAddress">>,
  ) => {
    if (!validClientMac(macAddress)) return;
    const current = devices.get(macAddress) ?? {
      macAddress,
      onInterface: input.fallbackInterface,
      hostname: null,
      ipAddress: null,
      lastSeen: null,
    };
    devices.set(macAddress, {
      ...current,
      ...Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== null && value !== ""),
      ),
    });
  };

  for (const client of input.hotspotClients) {
    merge(normalizeMac(client["mac-address"]), {
      hostname: client.user?.trim() ? `Hotspot · ${client.user.trim()}` : null,
      ipAddress: client.address ?? null,
      lastSeen: client.uptime ?? null,
    });
  }

  for (const lease of input.leases) {
    if (lease.status && lease.status !== "bound") continue;
    merge(normalizeMac(lease["mac-address"]), {
      hostname: lease["host-name"]?.trim() || null,
      ipAddress: lease["active-address"] ?? lease.address ?? null,
      lastSeen: lease["last-seen"] ?? null,
    });
  }

  for (const arp of input.arps) {
    if (arp.complete === "false") continue;
    merge(normalizeMac(arp["mac-address"]), {
      onInterface: arp.interface ?? "",
      hostname: arp["host-name"]?.trim() || null,
      ipAddress: arp.address ?? null,
      lastSeen: arp["last-seen"] ?? null,
    });
  }

  // Apply bridge-host observations last because `on-interface` is the most
  // precise RouterOS evidence for which physical router port learned the MAC.
  for (const host of input.bridgeHosts) {
    const macAddress = normalizeMac(host["mac-address"]);
    const onInterface = host["on-interface"] ?? "";
    if (!macAddress || !onInterface || host.local === "true" || host.type === "local") continue;
    merge(macAddress, {
      onInterface,
      hostname: host["host-name"]?.trim() || null,
      ipAddress: host.address ?? null,
      lastSeen: host["last-seen"] ?? null,
    });
  }

  return [...devices.values()]
    .sort((a, b) =>
      (a.hostname || a.ipAddress || a.macAddress).localeCompare(
        b.hostname || b.ipAddress || b.macAddress,
        undefined,
        { numeric: true },
      ),
    )
    .slice(0, 48);
}

/** Probe LAN topology from a reachable RouterBoard (Hub / Connector / direct). */
export async function probeRouterLanTopology(c: RouterConn): Promise<RouterLanProbe> {
  try {
    await routerAPI.ping(c);
  } catch (e) {
    return {
      reachable: false,
      error: e instanceof Error ? e.message : String(e),
      wanInterfaces: [],
      hotspotBridge: null,
      gatewayIp: null,
      guestPool: null,
      poolBindings: [],
      poolHealth: "unknown",
      poolHealthDetail: "Router unreachable",
      ports: [],
      discoveredDevices: [],
      discoveryAccess: {
        bridgeHostTable: false,
        dhcpLeases: false,
        arp: false,
        hotspotActive: false,
      },
    };
  }

  try {
    const [
      wanInterfaces,
      hotspots,
      addresses,
      bridgePorts,
      ethers,
      bridgeHostsResult,
      leasesResult,
      arpsResult,
      hotspotClientsResult,
    ] = await Promise.all([
      wanInterfaceNames(c),
      listRows(c, "/ip/hotspot"),
      listRows(c, "/ip/address"),
      listRows(c, "/interface/bridge/port"),
      listRows(c, "/interface/ethernet").then(async (rows) =>
        rows.length ? rows : listRows(c, "/interface"),
      ),
      listRowsWithAccess(c, "/interface/bridge/host"),
      listRowsWithAccess(c, "/ip/dhcp-server/lease"),
      listRowsWithAccess(c, "/ip/arp"),
      listRowsWithAccess(c, "/ip/hotspot/active"),
    ]);

    const wanSet = new Set(wanInterfaces);
    const activeHotspot = hotspots.find((h) => h.disabled !== "true") ?? hotspots[0] ?? null;
    const hotspotBridge = activeHotspot?.interface ?? null;
    const gatewayIp = hotspotBridge ? gatewayFromAddresses(addresses, hotspotBridge) : null;

    const onBridge = new Set(
      bridgePorts
        .filter((bp) => bp.bridge === hotspotBridge)
        .map((bp) => bp.interface ?? "")
        .filter(Boolean),
    );

    const etherByName = new Map<string, Row>();
    for (const row of ethers) {
      const name = row.name ?? "";
      if (/^ether\d/i.test(name)) etherByName.set(name, row);
    }

    const portNames = new Set<string>([...onBridge]);
    for (const name of etherByName.keys()) {
      if (!wanSet.has(name)) portNames.add(name);
    }

    const ports = [...portNames]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((name) => ({
        name,
        link: linkFromRunning(etherByName.get(name) ?? {}),
        onHotspotBridge: onBridge.has(name),
      }));

    const poolSnap = await probeGuestPoolSharing(c, hotspotBridge);
    const discoveryAccess = {
      bridgeHostTable: bridgeHostsResult.accessible,
      dhcpLeases: leasesResult.accessible,
      arp: arpsResult.accessible,
      hotspotActive: hotspotClientsResult.accessible,
    };

    return {
      reachable: true,
      error: null,
      wanInterfaces,
      hotspotBridge,
      gatewayIp,
      guestPool: poolSnap.guestPool,
      poolBindings: poolSnap.bindings,
      poolHealth: poolSnap.poolHealth,
      poolHealthDetail: poolSnap.poolHealthDetail,
      ports,
      discoveredDevices: discoveredNetworkDevices({
        bridgeHosts: bridgeHostsResult.rows,
        leases: leasesResult.rows,
        arps: arpsResult.rows.filter((row) => !wanSet.has(row.interface ?? "")),
        hotspotClients: hotspotClientsResult.rows,
        fallbackInterface: hotspotBridge ?? "LAN clients",
      }),
      discoveryAccess,
    };
  } catch (e) {
    return {
      reachable: false,
      error: e instanceof Error ? e.message : String(e),
      wanInterfaces: [],
      hotspotBridge: null,
      gatewayIp: null,
      guestPool: null,
      poolBindings: [],
      poolHealth: "unknown",
      poolHealthDetail: "Router unreachable",
      ports: [],
      discoveredDevices: [],
      discoveryAccess: {
        bridgeHostTable: false,
        dhcpLeases: false,
        arp: false,
        hotspotActive: false,
      },
    };
  }
}
