import type { DeviceSnapshot, MultiWanIntent, WanLinkIntent, WanProvider } from "./types";

const PROBE_PAIRS = [
  ["1.1.1.1", "9.9.9.9"],
  ["8.8.8.8", "208.67.222.222"],
  ["1.0.0.1", "149.112.112.112"],
] as const;

export function emptyWanLink(index: number): WanLinkIntent {
  const probes = PROBE_PAIRS[(index - 1) % PROBE_PAIRS.length]!;
  return {
    key: `wan${index}`,
    label: index === 1 ? "Primary internet" : index === 2 ? "Backup internet" : `Uplink ${index}`,
    iface: "",
    provider: "other",
    gateway: "",
    weight: 1,
    healthCheckTarget: probes[0],
    secondaryHealthCheckTarget: probes[1],
    cgnat: false,
    wantsInbound: false,
    enabled: true,
  };
}

function providerFromInterface(iface: string): WanProvider {
  if (/starlink/i.test(iface)) return "starlink";
  if (/(lte|5g|cell|modem)/i.test(iface)) return "lte";
  if (/(fiber|fibre|pppoe|isp)/i.test(iface)) return "fiber";
  return "other";
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

/**
 * Suggest only interfaces RouterOS already identifies as WAN-facing. The helper
 * deliberately leaves WAN 2 empty rather than guessing a LAN switch port.
 */
export function suggestMultiWanSetup(
  snapshot: Pick<
    DeviceSnapshot,
    "interfaces" | "dhcpClients" | "pppoeClients" | "managementIface" | "routes"
  >,
): { links: WanLinkIntent[]; lanInterface: string; detectedWanInterfaces: string[] } {
  const detectedWanInterfaces = unique([
    ...(snapshot.dhcpClients ?? []).map((client) => client.iface),
    ...(snapshot.pppoeClients ?? []).map((client) => client.name),
    snapshot.managementIface,
  ]).filter((iface) => snapshot.interfaces.some((candidate) => candidate.name === iface));

  const links = [emptyWanLink(1), emptyWanLink(2)].map((link, index) => {
    const iface = detectedWanInterfaces[index] ?? "";
    const provider = providerFromInterface(iface);
    const dhcpGateway = (snapshot.dhcpClients ?? []).find(
      (client) => client.iface === iface,
    )?.gateway;
    const routeGateway = snapshot.routes.find(
      (route) => route.dst === "0.0.0.0/0" && route.iface === iface,
    )?.gateway;
    return {
      ...link,
      iface,
      provider,
      gateway: dhcpGateway || routeGateway || "",
      cgnat: provider === "starlink",
    };
  });

  const wanSet = new Set(detectedWanInterfaces);
  const lanCandidates = snapshot.interfaces
    .filter((iface) => !wanSet.has(iface.name))
    .sort((a, b) => {
      const score = (iface: (typeof snapshot.interfaces)[number]) =>
        (iface.type === "bridge" ? 10 : 0) +
        (/(hotspot|guest|bridge|lan)/i.test(iface.name) ? 5 : 0) +
        (iface.running ? 1 : 0);
      return score(b) - score(a);
    });

  return {
    links,
    lanInterface: lanCandidates[0]?.name ?? "",
    detectedWanInterfaces,
  };
}

export function nextWanLinkIndex(links: WanLinkIntent[]): number {
  const used = links
    .map((link) => Number(/^wan(\d+)$/.exec(link.key)?.[1] ?? 0))
    .filter(Number.isFinite);
  return Math.max(0, ...used) + 1;
}

export const DEFAULT_MULTI_WAN_POLICY: MultiWanIntent["policy"] = {
  failThreshold: 2,
  probeIntervalSec: 10,
  holdDownSec: 0,
  autoFailback: true,
};
