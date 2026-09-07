import type {
  RouterLanProbe,
  SiteTopologySnapshot,
  TopologyEdge,
  TopologyLinkStatus,
  TopologyDiscoveredDevice,
  TopologyNode,
  TopologyPortLabel,
} from "./types";

function edgeStatus(...parts: TopologyLinkStatus[]): TopologyLinkStatus {
  if (parts.includes("down")) return "down";
  if (parts.every((p) => p === "up")) return "up";
  return "unknown";
}

/** Build a Dude-style tree: WAN → router → LAN ports → labeled devices. */
export function buildSiteTopologySnapshot(input: {
  siteId: string;
  siteName: string;
  routerId: string | null;
  routerName: string;
  routerOnline: boolean;
  probe: RouterLanProbe | null;
  portLabels: TopologyPortLabel[];
  polledAt?: number;
}): SiteTopologySnapshot {
  const probe = input.probe;
  const polledAt = input.polledAt ?? Date.now();
  const wanLabel =
    probe?.wanInterfaces.length === 1
      ? probe.wanInterfaces[0]!
      : probe?.wanInterfaces.length
        ? `WAN (${probe.wanInterfaces.join(", ")})`
        : "Internet / WAN";

  const nodes: TopologyNode[] = [];
  const edges: TopologyEdge[] = [];

  const wanId = "wan";
  nodes.push({
    id: wanId,
    kind: "wan",
    label: wanLabel,
    detail: "Upstream (Starlink / ISP)",
    status: input.routerOnline ? "up" : "down",
  });

  const routerId = "router";
  nodes.push({
    id: routerId,
    kind: "router",
    label: input.routerName,
    detail: probe?.hotspotBridge
      ? `Hotspot on ${probe.hotspotBridge}${probe.gatewayIp ? ` · ${probe.gatewayIp}` : ""}`
      : (input.routerId ?? "Gateway"),
    status: input.routerOnline ? "up" : "down",
  });
  edges.push({
    id: "wan-router",
    from: wanId,
    to: routerId,
    status: input.routerOnline ? "up" : "down",
  });

  const labelByPort = new Map(input.portLabels.map((p) => [p.port, p]));
  const discoveredByPort = new Map<string, TopologyDiscoveredDevice[]>();
  for (const device of probe?.discoveredDevices ?? []) {
    const group = discoveredByPort.get(device.onInterface) ?? [];
    group.push(device);
    discoveredByPort.set(device.onInterface, group);
  }
  const bridgePorts =
    probe?.ports.filter((p) => p.onHotspotBridge) ??
    probe?.ports ??
    input.portLabels.map((p) => ({
      name: p.port,
      link: "unknown" as const,
      onHotspotBridge: true,
    }));

  const sortedPorts = [...bridgePorts].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );

  for (const port of sortedPorts) {
    const portId = `port:${port.name}`;
    nodes.push({
      id: portId,
      kind: "port",
      label: port.name,
      detail: port.onHotspotBridge ? "On hotspot bridge" : "LAN",
      status: port.link,
    });
    edges.push({
      id: `router-${port.name}`,
      from: routerId,
      to: portId,
      status: edgeStatus(input.routerOnline ? "up" : "down", port.link),
    });

    const meta = labelByPort.get(port.name);
    if (meta?.label?.trim()) {
      const deviceId = `device:${port.name}`;
      nodes.push({
        id: deviceId,
        kind: "device",
        label: meta.label.trim(),
        detail:
          meta.kind === "switch"
            ? "Switch (L2)"
            : meta.kind === "ap"
              ? "Access point — set guest SSID on device"
              : "Downstream device",
        status: port.link,
      });
      edges.push({
        id: `port-device-${port.name}`,
        from: portId,
        to: deviceId,
        status: port.link,
      });
    }

    const discoveredParent = meta?.label?.trim() ? `device:${port.name}` : portId;
    for (const discovered of discoveredByPort.get(port.name) ?? []) {
      const suffix = discovered.macAddress.replace(/[^A-F0-9]/g, "").slice(-4);
      const learnedId = `learned:${port.name}:${discovered.macAddress}`;
      const detail = [
        discovered.ipAddress,
        `MAC · ${suffix}`,
        discovered.lastSeen ? `seen ${discovered.lastSeen}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      nodes.push({
        id: learnedId,
        kind: "device",
        label: discovered.hostname || discovered.ipAddress || `Connected device · ${suffix}`,
        detail,
        status: port.link,
      });
      edges.push({
        id: `port-client-${port.name}-${discovered.macAddress}`,
        from: discoveredParent,
        to: learnedId,
        status: port.link,
      });
    }
  }

  const knownPorts = new Set(sortedPorts.map((port) => port.name));
  const unplacedDevices = (probe?.discoveredDevices ?? []).filter(
    (device) => !knownPorts.has(device.onInterface),
  );
  if (unplacedDevices.length) {
    const groupId = "device:other-clients";
    nodes.push({
      id: groupId,
      kind: "device",
      label: "Other connected devices",
      detail: `${unplacedDevices.length} observed on bridge, DHCP or ARP`,
      status: input.routerOnline ? "up" : "down",
    });
    edges.push({
      id: "router-other-clients",
      from: routerId,
      to: groupId,
      status: input.routerOnline ? "up" : "down",
    });
    for (const discovered of unplacedDevices) {
      const suffix = discovered.macAddress.replace(/[^A-F0-9]/g, "").slice(-4);
      const learnedId = `learned:other:${discovered.macAddress}`;
      nodes.push({
        id: learnedId,
        kind: "device",
        label: discovered.hostname || discovered.ipAddress || `Connected device · ${suffix}`,
        detail: [
          discovered.ipAddress,
          discovered.onInterface,
          `MAC · ${suffix}`,
          discovered.lastSeen ? `seen ${discovered.lastSeen}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        status: input.routerOnline ? "up" : "down",
      });
      edges.push({
        id: `other-client-${discovered.macAddress}`,
        from: groupId,
        to: learnedId,
        status: input.routerOnline ? "up" : "down",
      });
    }
  }

  return {
    siteId: input.siteId,
    siteName: input.siteName,
    routerId: input.routerId,
    routerName: input.routerName,
    routerOnline: input.routerOnline,
    wanLabel,
    hotspotBridge: probe?.hotspotBridge ?? null,
    gatewayIp: probe?.gatewayIp ?? null,
    guestPool: probe?.guestPool ?? null,
    poolBindings: probe?.poolBindings ?? [],
    poolHealth: probe?.poolHealth ?? "unknown",
    poolHealthDetail: probe?.poolHealthDetail ?? "Pool status unknown",
    nodes,
    edges,
    portLabels: input.portLabels,
    discoveredDevices: probe?.discoveredDevices ?? [],
    discoveryAccess: probe?.discoveryAccess ?? {
      bridgeHostTable: false,
      dhcpLeases: false,
      arp: false,
      hotspotActive: false,
    },
    polledAt,
    probeError: probe?.error ?? (probe && !probe.reachable ? "Router unreachable" : null),
  };
}
