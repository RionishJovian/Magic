import { describe, expect, it } from "vitest";
import { buildSiteTopologySnapshot } from "@/lib/topology/build-topology";
import type { RouterLanProbe } from "@/lib/topology/types";

const probe: RouterLanProbe = {
  reachable: true,
  error: null,
  wanInterfaces: ["ether1"],
  hotspotBridge: "bridge-lan",
  gatewayIp: "192.168.88.1",
  guestPool: {
    name: "hotspot-pool",
    ranges: "192.168.88.10-192.168.88.254",
    total: 245,
    used: 10,
    usagePct: 4,
  },
  poolBindings: [
    {
      role: "hotspot",
      serverName: "hs-lan",
      interface: "bridge-lan",
      addressPool: "hotspot-pool",
    },
    {
      role: "dhcp",
      serverName: "mm-hs-dhcp",
      interface: "bridge-lan",
      addressPool: "hotspot-pool",
    },
  ],
  poolHealth: "shared_ok",
  poolHealthDetail: "Hotspot and DHCP on bridge-lan share hotspot-pool",
  ports: [
    { name: "ether3", link: "up", onHotspotBridge: true },
    { name: "ether4", link: "up", onHotspotBridge: true },
    { name: "ether5", link: "down", onHotspotBridge: true },
  ],
  discoveredDevices: [
    {
      macAddress: "AA:BB:CC:DD:EE:01",
      onInterface: "ether3",
      hostname: "office-ap",
      lastSeen: "2s",
    },
  ],
  discoveryAccess: { bridgeHostTable: true, dhcpLeases: true, arp: true },
};

describe("buildSiteTopologySnapshot", () => {
  it("builds WAN → router → ports → labeled devices", () => {
    const snap = buildSiteTopologySnapshot({
      siteId: "site-1",
      siteName: "Cafe",
      routerId: "r1",
      routerName: "RB5009",
      routerOnline: true,
      probe,
      portLabels: [
        { port: "ether3", label: "CRS326", kind: "switch" },
        { port: "ether4", label: "TP-Link AP", kind: "ap" },
        { port: "ether5", label: "Ruijie outdoor", kind: "ap" },
      ],
    });

    expect(snap.nodes.some((n) => n.kind === "wan")).toBe(true);
    expect(snap.nodes.some((n) => n.kind === "router" && n.label === "RB5009")).toBe(true);
    expect(snap.nodes.filter((n) => n.kind === "port")).toHaveLength(3);
    expect(snap.nodes.filter((n) => n.kind === "device")).toHaveLength(4);
    expect(snap.poolHealth).toBe("shared_ok");
    expect(snap.guestPool?.name).toBe("hotspot-pool");
    expect(snap.edges.find((e) => e.id === "port-device-ether5")?.status).toBe("down");
    expect(
      snap.nodes.some(
        (n) => n.label === "office-ap" && n.detail?.includes("Learned behind CRS326"),
      ),
    ).toBe(true);
    expect(snap.edges.find((e) => e.id === "switch-learned-ether3-AA:BB:CC:DD:EE:01")?.from).toBe(
      "device:ether3",
    );
  });

  it("marks WAN edge down when router is offline", () => {
    const snap = buildSiteTopologySnapshot({
      siteId: "site-1",
      siteName: "Cafe",
      routerId: "r1",
      routerName: "RB5009",
      routerOnline: false,
      probe: { ...probe, reachable: false, error: "timeout" },
      portLabels: [],
    });
    expect(snap.edges.find((e) => e.id === "wan-router")?.status).toBe("down");
  });
});
