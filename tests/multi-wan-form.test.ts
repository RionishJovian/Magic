import { describe, expect, it } from "vitest";
import {
  emptyWanLink,
  nextWanLinkIndex,
  suggestMultiWanSetup,
} from "@/lib/provisioning/multi-wan-form";

describe("Multi-WAN form suggestions", () => {
  it("uses RouterOS-discovered WANs and prefers a running bridge for LAN", () => {
    const suggestion = suggestMultiWanSetup({
      interfaces: [
        { name: "ether1_WAN", type: "ether", running: true },
        { name: "pppoe-backup", type: "pppoe-out", running: true },
        { name: "Hotspot", type: "bridge", running: true },
        { name: "ether4", type: "ether", running: true },
      ],
      dhcpClients: [{ iface: "ether1_WAN", addDefaultRoute: true }],
      pppoeClients: [{ name: "pppoe-backup", addDefaultRoute: true }],
      managementIface: "ether1_WAN",
      routes: [
        {
          dst: "0.0.0.0/0",
          gateway: "192.0.2.1",
          distance: 1,
          dynamic: true,
          iface: "ether1_WAN",
        },
      ],
    });

    expect(suggestion.detectedWanInterfaces).toEqual(["ether1_WAN", "pppoe-backup"]);
    expect(suggestion.links.map((link) => link.iface)).toEqual(["ether1_WAN", "pppoe-backup"]);
    expect(suggestion.links[0]?.gateway).toBe("192.0.2.1");
    expect(suggestion.lanInterface).toBe("Hotspot");
  });

  it("leaves WAN 2 empty instead of guessing a switch port", () => {
    const suggestion = suggestMultiWanSetup({
      interfaces: [
        { name: "ether1_WAN", type: "ether", running: true },
        { name: "ether2", type: "ether", running: true },
        { name: "bridge", type: "bridge", running: true },
      ],
      dhcpClients: [{ iface: "ether1_WAN", addDefaultRoute: true }],
      pppoeClients: [],
      managementIface: "ether1_WAN",
      routes: [],
    });

    expect(suggestion.links[0]?.iface).toBe("ether1_WAN");
    expect(suggestion.links[1]?.iface).toBe("");
    expect(suggestion.lanInterface).toBe("bridge");
  });

  it("creates unique added-uplink keys and resilient probe pairs", () => {
    const links = [emptyWanLink(1), emptyWanLink(2)];
    expect(nextWanLinkIndex(links)).toBe(3);
    expect(links.every((link) => !!link.secondaryHealthCheckTarget)).toBe(true);
  });
});
