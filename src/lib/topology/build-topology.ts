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
  const switchLabels = new Map(
    input.portLabels
      .filter((label) => label.kind === "switch" && label.label.trim())
      .map((label) => [label.port, label]),
  );
  const discoveredBySwitchPort = new Map<string, TopologyDiscoveredDevice[]>();
  for (const device of probe?.discoveredDevices ?? []) {
    if (!switchLabels.has(device.onInterface)) continue;
    const group = discoveredBySwitchPort.get(device.onInterface) ?? [];
    group.push(device);
    discoveredBySwitchPort.set(device.onInterface, group);
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

      if (meta.kind === "switch") {
        for (const discovered of discoveredBySwitchPort.get(port.name) ?? []) {
          const suffix = discovered.macAddress.replace(/[^A-F0-9]/g, "").slice(-4);
          const learnedId = `learned:${port.name}:${discovered.macAddress}`;
          nodes.push({
            id: learnedId,
            kind: "device",
            label: discovered.hostname || `Learned device · ${suffix}`,
            detail: `Learned behind ${meta.label.trim()}${discovered.lastSeen ? ` · seen ${discovered.lastSeen}` : ""}`,
            status: port.link,
          });
          edges.push({
            id: `switch-learned-${port.name}-${discovered.macAddress}`,
            from: deviceId,
            to: learnedId,
            status: port.link,
          });
        }
      }
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
    discoveredDevices: [...discoveredBySwitchPort.values()].flat(),
    discoveryAccess: probe?.discoveryAccess ?? {
      bridgeHostTable: false,
      dhcpLeases: false,
      arp: false,
    },
    polledAt,
    probeError: probe?.error ?? (probe && !probe.reachable ? "Router unreachable" : null),
  };
}
