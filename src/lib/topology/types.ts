import type { TopologyGuestPool, TopologyPoolBinding, TopologyPoolHealth } from "./pool-health";

export type TopologyLinkStatus = "up" | "down" | "unknown";

export type { TopologyGuestPool, TopologyPoolBinding, TopologyPoolHealth };

export type TopologyPortLabel = {
  port: string;
  label: string;
  kind: "switch" | "ap" | "other";
};

/** Read-only observation from the router bridge host table, not a switch-port claim. */
export type TopologyDiscoveredDevice = {
  macAddress: string;
  onInterface: string;
  hostname: string | null;
  ipAddress: string | null;
  lastSeen: string | null;
};

export type TopologyDiscoveryAccess = {
  bridgeHostTable: boolean;
  dhcpLeases: boolean;
  arp: boolean;
  hotspotActive: boolean;
};

export type TopologyNodeKind = "wan" | "router" | "port" | "device";

export type TopologyNode = {
  id: string;
  kind: TopologyNodeKind;
  label: string;
  detail?: string;
  status: TopologyLinkStatus;
};

export type TopologyEdge = {
  id: string;
  from: string;
  to: string;
  status: TopologyLinkStatus;
};

export type SiteTopologySnapshot = {
  siteId: string;
  siteName: string;
  routerId: string | null;
  routerName: string;
  routerOnline: boolean;
  wanLabel: string;
  hotspotBridge: string | null;
  gatewayIp: string | null;
  guestPool: TopologyGuestPool | null;
  poolBindings: TopologyPoolBinding[];
  poolHealth: TopologyPoolHealth;
  poolHealthDetail: string;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  portLabels: TopologyPortLabel[];
  discoveredDevices: TopologyDiscoveredDevice[];
  discoveryAccess: TopologyDiscoveryAccess;
  polledAt: number;
  probeError: string | null;
};

export type TopologyMagicDudeInsight = {
  title: string;
  summary: string;
  evidence: string[];
  impact: string;
  recommendation: string;
  confidence: "high" | "medium" | "low";
};

export type RouterLanProbe = {
  reachable: boolean;
  error: string | null;
  wanInterfaces: string[];
  hotspotBridge: string | null;
  gatewayIp: string | null;
  guestPool: TopologyGuestPool | null;
  poolBindings: TopologyPoolBinding[];
  poolHealth: TopologyPoolHealth;
  poolHealthDetail: string;
  ports: Array<{
    name: string;
    link: TopologyLinkStatus;
    onHotspotBridge: boolean;
  }>;
  discoveredDevices: TopologyDiscoveredDevice[];
  discoveryAccess: TopologyDiscoveryAccess;
};
