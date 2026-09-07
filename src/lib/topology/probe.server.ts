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

function discoveredBridgeDevices(input: {
  bridgeHosts: Row[];
  leases: Row[];
  arps: Row[];
}): TopologyDiscoveredDevice[] {
  const leaseByMac = new Map(input.leases.map((row) => [normalizeMac(row["mac-address"]), row]));
  const arpByMac = new Map(input.arps.map((row) => [normalizeMac(row["mac-address"]), row]));
  const seen = new Set<string>();
  const devices: TopologyDiscoveredDevice[] = [];

  for (const host of input.bridgeHosts) {
    const macAddress = normalizeMac(host["mac-address"]);
    const onInterface = host["on-interface"] ?? "";
    if (!macAddress || !onInterface || host.local === "true" || host.type === "local") continue;
    const key = `${onInterface}:${macAddress}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const lease = leaseByMac.get(macAddress);
    const arp = arpByMac.get(macAddress);
    devices.push({
      macAddress,
      onInterface,
      hostname: lease?.["host-name"]?.trim() || arp?.["host-name"]?.trim() || null,
      lastSeen: host["last-seen"] ?? null,
    });
  }

  return devices.slice(0, 48);
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
      discoveryAccess: { bridgeHostTable: false, dhcpLeases: false, arp: false },
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
      discoveredDevices: discoveredBridgeDevices({
        bridgeHosts: bridgeHostsResult.rows,
        leases: leasesResult.rows,
        arps: arpsResult.rows,
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
      discoveryAccess: { bridgeHostTable: false, dhcpLeases: false, arp: false },
    };
  }
}
