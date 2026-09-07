import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteTopologyCanvas } from "@/components/SiteTopologyCanvas";
import type { SiteTopologySnapshot } from "@/lib/topology/types";

const snapshot: SiteTopologySnapshot = {
  siteId: "site-1",
  siteName: "Cafe",
  routerId: "router-1",
  routerName: "CCR2004",
  routerOnline: true,
  wanLabel: "ether1",
  hotspotBridge: "bridge-lan",
  gatewayIp: "192.168.88.1",
  guestPool: null,
  poolBindings: [],
  poolHealth: "unknown",
  poolHealthDetail: "Unknown",
  nodes: [
    { id: "wan", kind: "wan", label: "Internet", status: "up" },
    { id: "router", kind: "router", label: "CCR2004", status: "up" },
    { id: "port:ether2", kind: "port", label: "ether2", status: "up" },
    {
      id: "learned:ether2:AA:BB:CC:DD:EE:01",
      kind: "device",
      label: "guest-phone",
      detail: "192.168.88.20 · MAC · EE01",
      status: "up",
    },
  ],
  edges: [
    { id: "wan-router", from: "wan", to: "router", status: "up" },
    { id: "router-ether2", from: "router", to: "port:ether2", status: "up" },
    {
      id: "port-client",
      from: "port:ether2",
      to: "learned:ether2:AA:BB:CC:DD:EE:01",
      status: "up",
    },
  ],
  portLabels: [],
  discoveredDevices: [
    {
      macAddress: "AA:BB:CC:DD:EE:01",
      onInterface: "ether2",
      hostname: "guest-phone",
      ipAddress: "192.168.88.20",
      lastSeen: "1s",
    },
  ],
  discoveryAccess: { bridgeHostTable: true, dhcpLeases: true, arp: true, hotspotActive: true },
  polledAt: 1,
  probeError: null,
};

describe("SiteTopologyCanvas responsive layout", () => {
  it("renders a readable mobile hierarchy and a non-shrinking desktop canvas", () => {
    const html = renderToStaticMarkup(<SiteTopologyCanvas snapshot={snapshot} />);

    expect(html).toContain('role="list"');
    expect(html).toContain("sm:hidden");
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("min-width:760px");
    expect(html).toContain("guest-phone");
    expect(html).toContain("1 downstream device");
    expect(html).not.toContain("Select a device or investigate an alert");
  });
});
