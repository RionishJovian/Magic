import { beforeEach, describe, expect, it, vi } from "vitest";

const routerAPI = vi.hoisted(() => ({
  ping: vi.fn(),
  raw: vi.fn(),
}));

vi.mock("@/lib/mikrotik.server", () => ({ routerAPI }));

import { probeRouterLanTopology } from "@/lib/topology/probe.server";

describe("probeRouterLanTopology device discovery", () => {
  beforeEach(() => {
    routerAPI.ping.mockReset().mockResolvedValue(undefined);
    routerAPI.raw.mockReset().mockImplementation(async (_connection, path: string) => {
      const rows: Record<string, Array<Record<string, string>>> = {
        "/interface/list": [{ ".id": "*1", name: "WAN" }],
        "/interface/list/member": [{ list: "*1", interface: "ether1" }],
        "/ip/hotspot": [{ interface: "bridge-lan", disabled: "false" }],
        "/ip/address": [{ interface: "bridge-lan", address: "192.168.88.1/24" }],
        "/interface/bridge/port": [
          { bridge: "bridge-lan", interface: "ether2" },
          { bridge: "bridge-lan", interface: "ether3" },
        ],
        "/interface/ethernet": [
          { name: "ether1", running: "true" },
          { name: "ether2", running: "true" },
          { name: "ether3", running: "true" },
        ],
        "/interface/bridge/host": [
          {
            "mac-address": "AA:BB:CC:DD:EE:01",
            "on-interface": "ether2",
            "last-seen": "1s",
          },
        ],
        "/ip/dhcp-server/lease": [
          {
            "mac-address": "AA:BB:CC:DD:EE:01",
            "host-name": "front-ap",
            "active-address": "192.168.88.20",
            status: "bound",
          },
          {
            "mac-address": "AA:BB:CC:DD:EE:02",
            "host-name": "guest-phone",
            "active-address": "192.168.88.21",
            status: "bound",
          },
          {
            "mac-address": "AA:BB:CC:DD:EE:99",
            "active-address": "192.168.88.99",
            status: "waiting",
          },
        ],
        "/ip/hotspot/active": [
          {
            "mac-address": "AA:BB:CC:DD:EE:02",
            address: "192.168.88.21",
            user: "voucher-101",
            uptime: "4m2s",
          },
        ],
        "/ip/arp": [
          {
            "mac-address": "AA:BB:CC:DD:EE:03",
            address: "192.168.88.22",
            interface: "ether3",
            complete: "true",
          },
          {
            "mac-address": "AA:BB:CC:DD:EE:04",
            address: "100.64.0.1",
            interface: "ether1",
            complete: "true",
          },
        ],
      };
      return rows[path] ?? [];
    });
  });

  it("merges bridge hosts with active DHCP and ARP clients", async () => {
    const result = await probeRouterLanTopology({} as never);

    expect(result.discoveredDevices).toHaveLength(3);
    expect(result.discoveredDevices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          macAddress: "AA:BB:CC:DD:EE:01",
          onInterface: "ether2",
          hostname: "front-ap",
          ipAddress: "192.168.88.20",
        }),
        expect.objectContaining({
          macAddress: "AA:BB:CC:DD:EE:02",
          onInterface: "bridge-lan",
          hostname: "guest-phone",
        }),
        expect.objectContaining({
          macAddress: "AA:BB:CC:DD:EE:03",
          onInterface: "ether3",
          ipAddress: "192.168.88.22",
        }),
      ]),
    );
    expect(result.discoveredDevices.some((device) => device.macAddress.endsWith("99"))).toBe(false);
    expect(result.discoveredDevices.some((device) => device.macAddress.endsWith("04"))).toBe(false);
  });
});
