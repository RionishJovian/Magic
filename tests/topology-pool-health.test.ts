import { describe, expect, it } from "vitest";
import { evaluateGuestPoolHealth } from "@/lib/topology/pool-health";
import { MM_HOTSPOT_POOL_NAME } from "@/lib/wifi-hotspot.server";

describe("evaluateGuestPoolHealth", () => {
  const guestPool = {
    name: MM_HOTSPOT_POOL_NAME,
    ranges: "192.168.88.10-192.168.88.254",
    total: 245,
    used: 12,
    usagePct: 5,
  };

  it("passes when hotspot and DHCP share hotspot-pool on the bridge", () => {
    const result = evaluateGuestPoolHealth({
      hotspotBridge: "bridge-lan",
      guestPool,
      bindings: [
        {
          role: "hotspot",
          serverName: "hs-lan",
          interface: "bridge-lan",
          addressPool: MM_HOTSPOT_POOL_NAME,
        },
        {
          role: "dhcp",
          serverName: "mm-hs-dhcp",
          interface: "bridge-lan",
          addressPool: MM_HOTSPOT_POOL_NAME,
        },
      ],
    });
    expect(result.health).toBe("shared_ok");
    expect(result.detail).toContain(MM_HOTSPOT_POOL_NAME);
  });

  it("flags split pools when hotspot and DHCP disagree", () => {
    const result = evaluateGuestPoolHealth({
      hotspotBridge: "bridge-lan",
      guestPool,
      bindings: [
        {
          role: "hotspot",
          serverName: "hs-lan",
          interface: "bridge-lan",
          addressPool: MM_HOTSPOT_POOL_NAME,
        },
        {
          role: "dhcp",
          serverName: "lan-dhcp",
          interface: "bridge-lan",
          addressPool: "lan-pool",
        },
      ],
    });
    expect(result.health).toBe("split_pools");
  });

  it("warns when pool usage is high", () => {
    const result = evaluateGuestPoolHealth({
      hotspotBridge: "bridge-lan",
      guestPool: { ...guestPool, used: 230, usagePct: 94 },
      bindings: [
        {
          role: "hotspot",
          serverName: "hs-lan",
          interface: "bridge-lan",
          addressPool: MM_HOTSPOT_POOL_NAME,
        },
        {
          role: "dhcp",
          serverName: "mm-hs-dhcp",
          interface: "bridge-lan",
          addressPool: MM_HOTSPOT_POOL_NAME,
        },
      ],
    });
    expect(result.health).toBe("high_usage");
  });

  it("reports missing pool", () => {
    const result = evaluateGuestPoolHealth({
      hotspotBridge: "bridge-lan",
      guestPool: null,
      bindings: [],
    });
    expect(result.health).toBe("missing_pool");
  });
});
