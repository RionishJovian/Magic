import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RouterConn } from "@/lib/mikrotik.server";

const conn: RouterConn = {
  host: "router.test",
  port: 443,
  username: "admin",
  password: "secret",
  useTls: true,
};

type MockState = {
  wifi: Record<string, string>[];
  wireless: Record<string, string>[];
  hotspots: Record<string, string>[];
  cap: Record<string, string>[];
  wifiSecurity: Record<string, string>[];
  wifiDatapath: Record<string, string>[];
  wifiConfig: Record<string, string>[];
  bridges: Record<string, string>[];
  bridgePorts: Record<string, string>[];
  lists: Record<string, string>[];
  listMembers: Record<string, string>[];
  pools: Record<string, string>[];
  profiles: Record<string, string>[];
  addresses: Record<string, string>[];
  dhcp: Record<string, string>[];
  dhcpNetworks: Record<string, string>[];
  ethers: Record<string, string>[];
  writes: string[];
};

const state: MockState = {
  wifi: [],
  wireless: [],
  hotspots: [],
  cap: [],
  wifiSecurity: [],
  wifiDatapath: [],
  wifiConfig: [],
  bridges: [],
  bridgePorts: [],
  lists: [],
  listMembers: [],
  pools: [],
  profiles: [],
  addresses: [],
  dhcp: [],
  dhcpNetworks: [],
  ethers: [],
  writes: [],
};

async function defaultRawMock(_c: RouterConn, path: string, init?: RequestInit) {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET") state.writes.push(`${method} ${path}`);
  if (path === "/interface/wifi" && method === "GET") return state.wifi;
  if (path === "/interface/wireless" && method === "GET") return state.wireless;
  if (path === "/ip/hotspot" && method === "GET") return state.hotspots;
  if (path === "/interface/wifi/cap" && method === "GET") return state.cap;
  if (path === "/interface/wifi/security" && method === "GET") return state.wifiSecurity;
  if (path === "/interface/wifi/datapath" && method === "GET") return state.wifiDatapath;
  if (path === "/interface/wifi/configuration" && method === "GET") return state.wifiConfig;
  if (path === "/interface/list" && method === "GET") return state.lists;
  if (path === "/interface/list/member" && method === "GET") return state.listMembers;
  if (path === "/interface/bridge" && method === "GET") return state.bridges;
  if (path === "/interface/bridge/port" && method === "GET") return state.bridgePorts;
  if (path === "/ip/pool" && method === "GET") return state.pools;
  if (path === "/ip/hotspot/profile" && method === "GET") return state.profiles;
  if (path === "/ip/address" && method === "GET") return state.addresses;
  if (path === "/ip/dhcp-server" && method === "GET") return state.dhcp;
  if (path === "/ip/dhcp-server/network" && method === "GET") return state.dhcpNetworks;
  if (path === "/interface/ethernet" && method === "GET") return state.ethers;
  if (path === "/interface" && method === "GET") return state.ethers;
  return undefined;
}

vi.mock("@/lib/mikrotik.server", () => ({
  routerAPI: {
    ping: vi.fn(async () => ({})),
    execScript: vi.fn(async (_c: RouterConn, script: string) => {
      state.writes.push(`EXEC ${script}`);
    }),
    raw: vi.fn(defaultRawMock),
  },
}));

import {
  normalizeLanPorts,
  parseLanPortsFromHotspotAuditDetail,
  MM_HOTSPOT_POOL_NAME,
  MM_HOTSPOT_PROFILE_NAME,
  MM_HOTSPOT_SERVER_NAME,
  MM_HOTSPOT_DHCP_SERVER_NAME,
  applyHotspotSetup,
  assessHotspotGuestReady,
  deriveNetworkCidr,
  derivePoolRange,
  describePlannedStep,
  guestSsidNamesFromProbe,
  isCapsmanWifiManager,
  isLikelyWanInterface,
  pickSuggestedBridge,
  planHotspotSetup,
  plannedStepToCli,
  probeWifiHotspot,
  slugFromSsid,
  type WifiHotspotProbe,
} from "@/lib/wifi-hotspot.server";

function baseProbe(overrides: Partial<WifiHotspotProbe> = {}): WifiHotspotProbe {
  return {
    reachable: true,
    reachError: null,
    stack: "wifiwave2",
    wifiInterfaces: [
      {
        id: "*1",
        name: "wifi1",
        ssid: null,
        disabled: false,
        masterInterface: null,
        configuration: null,
        comment: null,
        band: "2.4",
        managedByMagic: false,
      },
      {
        id: "*2",
        name: "wifi2",
        ssid: null,
        disabled: false,
        masterInterface: null,
        configuration: null,
        comment: null,
        band: "5",
        managedByMagic: false,
      },
    ],
    hotspotServers: [],
    bridges: [{ name: "bridge-lan", label: "bridge-lan" }],
    etherPorts: [{ name: "ether2", label: "ether2" }],
    suggestedBridge: "bridge-lan",
    capModeActive: false,
    defaultMode: "builtin-wifi",
    canSetupBuiltin: true,
    canSetupLanPort: true,
    setupBlockedReason: null,
    hasHotspotPool: false,
    hasHotspotProfile: false,
    hasMagicDhcpServer: false,
    dhcpNetworkCidrs: [],
    hotspotProfile: null,
    voucherLoginMode: "unknown",
    existingWifiNames: [],
    checklist: { pool: false, profile: false, server: false, ssid: false },
    foundation: {
      gatewayIp: "192.168.88.1",
      poolRange: "192.168.88.10-192.168.88.254",
      hasDhcpOnBridge: true,
    },
    bridgeFoundations: {
      "bridge-lan": {
        gatewayIp: "192.168.88.1",
        poolRange: "192.168.88.10-192.168.88.254",
        hasDhcpOnBridge: true,
      },
    },
    ...overrides,
  };
}

beforeEach(async () => {
  state.wifi = [
    { ".id": "*1", name: "wifi1", disabled: "false" },
    { ".id": "*2", name: "wifi2", disabled: "false" },
  ];
  state.wireless = [];
  state.hotspots = [];
  state.cap = [{ enabled: "false" }];
  state.bridges = [{ name: "bridge-lan" }];
  state.bridgePorts = [];
  state.lists = [];
  state.listMembers = [];
  state.pools = [];
  state.profiles = [];
  state.addresses = [{ interface: "bridge-lan", address: "192.168.88.1/24" }];
  state.dhcp = [{ interface: "bridge-lan", disabled: "false" }];
  state.ethers = [{ name: "ether2" }, { name: "ether3" }];
  state.writes = [];
  const { routerAPI } = await import("@/lib/mikrotik.server");
  vi.mocked(routerAPI.raw).mockImplementation(defaultRawMock);
  vi.mocked(routerAPI.execScript).mockClear();
});

describe("normalizeLanPorts", () => {
  it("prefers lanPorts array over legacy single lanPort", () => {
    expect(normalizeLanPorts({ lanPorts: ["ether3", "ether4"], lanPort: "ether2" })).toEqual([
      "ether3",
      "ether4",
    ]);
  });

  it("falls back to legacy lanPort", () => {
    expect(normalizeLanPorts({ lanPort: "ether5" })).toEqual(["ether5"]);
  });
});

describe("parseLanPortsFromHotspotAuditDetail", () => {
  it("recovers only app-recorded ports from a successful apply summary", () => {
    expect(
      parseLanPortsFromHotspotAuditDetail(
        'lan-port · SSID "WELCOME" · ports ether3,ether4 · 2 created, 3 skipped',
      ),
    ).toEqual(["ether3", "ether4"]);
  });

  it("does not invent a mapping from old audit summaries", () => {
    expect(parseLanPortsFromHotspotAuditDetail('lan-port · SSID "WELCOME" · failed')).toEqual([]);
  });
});

describe("WAN interface safety", () => {
  it("recognizes WAN and uplink labels without treating ordinary LAN ports as WAN", () => {
    expect(isLikelyWanInterface({ name: "ether1_WAN" })).toBe(true);
    expect(isLikelyWanInterface({ name: "ether8", comment: "ISP uplink" })).toBe(true);
    expect(isLikelyWanInterface({ name: "ether4", comment: "Guest AP" })).toBe(false);
  });
});

describe("derivePoolRange", () => {
  it("builds pool from gateway IP", () => {
    expect(derivePoolRange("192.168.88.1")).toBe("192.168.88.10-192.168.88.254");
  });

  it("keeps a /25 pool inside its actual subnet", () => {
    expect(derivePoolRange("192.168.88.129/25")).toBe("192.168.88.138-192.168.88.254");
  });
});

describe("deriveNetworkCidr", () => {
  it("builds /24 CIDR from gateway IP", () => {
    expect(deriveNetworkCidr("192.168.88.1")).toBe("192.168.88.0/24");
  });

  it("preserves a non-/24 prefix", () => {
    expect(deriveNetworkCidr("192.168.88.129/25")).toBe("192.168.88.128/25");
  });
});

describe("planHotspotSetup", () => {
  it("blocks LAN-port setup before planning any router writes when no AP port is selected", () => {
    const plan = planHotspotSetup(baseProbe(), {
      mode: "lan-port",
      externalApConfirmed: true,
      ssid: "Guest",
      bridge: "bridge-lan",
      bands: [],
      lanPorts: [],
      disableCapMode: false,
    });
    expect(plan.canApply).toBe(false);
    expect(plan.steps).toEqual([]);
    expect(plan.blockReason).toMatch(/LAN port/i);
  });

  it("blocks LAN-port setup until the operator confirms the physical AP connection", () => {
    const plan = planHotspotSetup(baseProbe(), {
      mode: "lan-port",
      externalApConfirmed: false,
      ssid: "Guest",
      bridge: "bridge-lan",
      bands: [],
      lanPorts: ["ether4"],
      disableCapMode: false,
    });
    expect(plan.canApply).toBe(false);
    expect(plan.steps).toEqual([]);
    expect(plan.blockReason).toMatch(/external AP/i);
  });

  it("plans foundation + wifi for built-in mode", () => {
    const plan = planHotspotSetup(baseProbe(), {
      mode: "builtin-wifi",
      ssid: "CafeGuest",
      bridge: "bridge-lan",
      bands: ["2.4", "5"],
      lanPorts: [],
      disableCapMode: false,
    });
    expect(plan.canApply).toBe(true);
    expect(plan.items.some((i) => i.id === "pool" && i.status === "create")).toBe(true);
    expect(plan.items.some((i) => i.id === "profile" && i.status === "create")).toBe(true);
    expect(plan.items.some((i) => i.id === "server" && i.status === "create")).toBe(true);
    expect(plan.items.some((i) => i.id === "wifi" && i.status === "create")).toBe(true);
    expect(plan.steps.some((s) => s.path === "/ip/pool")).toBe(true);
    expect(plan.items.some((i) => i.id === "dhcp" && i.status === "skip")).toBe(true);
    expect(plan.steps.some((s) => s.path === "/interface/wifi")).toBe(true);
  });

  it("plans DHCP when bridge has no server", () => {
    const plan = planHotspotSetup(
      baseProbe({
        foundation: {
          gatewayIp: "192.168.88.1",
          poolRange: "192.168.88.10-192.168.88.254",
          hasDhcpOnBridge: false,
        },
        bridgeFoundations: {
          "bridge-lan": {
            gatewayIp: "192.168.88.1",
            poolRange: "192.168.88.10-192.168.88.254",
            hasDhcpOnBridge: false,
          },
        },
      }),
      {
        mode: "builtin-wifi",
        ssid: "CafeGuest",
        bridge: "bridge-lan",
        bands: ["2.4"],
        lanPorts: [],
        disableCapMode: false,
      },
    );
    expect(plan.steps.some((s) => s.path === "/ip/dhcp-server")).toBe(true);
    expect(plan.steps.some((s) => s.body.name === MM_HOTSPOT_DHCP_SERVER_NAME)).toBe(true);
    expect(plan.steps.some((s) => s.path === "/ip/dhcp-server/network")).toBe(true);
    expect(plan.warnings.some((w) => w.includes("No DHCP server"))).toBe(false);
  });

  it("skips DHCP when bridge already has a server", () => {
    const plan = planHotspotSetup(baseProbe(), {
      mode: "lan-port",
      externalApConfirmed: true,
      ssid: "Guest",
      bridge: "bridge-lan",
      bands: [],
      lanPorts: ["ether2"],
      disableCapMode: false,
    });
    expect(plan.steps.some((s) => s.path === "/ip/dhcp-server")).toBe(false);
    expect(plan.items.some((i) => i.id === "dhcp" && i.status === "skip")).toBe(true);
  });

  it("still plans foundation when guest Wi-Fi objects already exist", () => {
    const plan = planHotspotSetup(
      baseProbe({
        existingWifiNames: [
          "mm-hs-open-cafeguest",
          "mm-hs-dp-cafeguest",
          "mm-hs-cfg-cafeguest",
          "mm-hs-2g-cafeguest",
          "mm-hs-5g-cafeguest",
        ],
        hasHotspotPool: false,
        hasHotspotProfile: false,
      }),
      {
        mode: "builtin-wifi",
        ssid: "CafeGuest",
        bridge: "bridge-lan",
        bands: ["2.4", "5"],
        lanPorts: [],
        disableCapMode: false,
      },
    );
    expect(plan.canApply).toBe(true);
    expect(plan.steps.some((s) => s.path === "/ip/pool")).toBe(true);
    expect(plan.steps.some((s) => s.path === "/ip/hotspot/profile")).toBe(true);
    expect(plan.blockReason).toBeNull();
  });

  it("uses the selected bridge gateway, not only the suggested bridge", () => {
    const plan = planHotspotSetup(
      baseProbe({
        suggestedBridge: "bridge-lan",
        foundation: {
          gatewayIp: "192.168.88.1",
          poolRange: "192.168.88.10-192.168.88.254",
          hasDhcpOnBridge: true,
        },
        bridgeFoundations: {
          "bridge-lan": {
            gatewayIp: "192.168.88.1",
            poolRange: "192.168.88.10-192.168.88.254",
            hasDhcpOnBridge: true,
          },
          bridgeLocal: {
            gatewayIp: "192.168.100.49",
            poolRange: "192.168.100.10-192.168.100.254",
            hasDhcpOnBridge: true,
          },
        },
        bridges: [
          { name: "bridge-lan", label: "bridge-lan" },
          { name: "bridgeLocal", label: "bridgeLocal" },
        ],
      }),
      {
        mode: "builtin-wifi",
        ssid: "CafeGuest",
        bridge: "bridgeLocal",
        bands: ["2.4"],
        lanPorts: [],
        disableCapMode: false,
      },
    );
    expect(plan.canApply).toBe(true);
    expect(plan.gatewayIp).toBe("192.168.100.49");
    expect(plan.poolRange).toBe("192.168.100.10-192.168.100.254");
  });

  it("creates DHCP on the selected bridge when Magic DHCP only serves another bridge", () => {
    const plan = planHotspotSetup(
      baseProbe({
        hasMagicDhcpServer: true,
        magicDhcpServerBridges: ["bridge-lan"],
        bridgeFoundations: {
          "bridge-lan": {
            gatewayIp: "192.168.88.1",
            poolRange: "192.168.88.10-192.168.88.254",
            hasDhcpOnBridge: true,
          },
          bridgeLocal: {
            gatewayIp: "192.168.100.49",
            poolRange: "192.168.100.10-192.168.100.254",
            hasDhcpOnBridge: false,
          },
        },
        bridges: [
          { name: "bridge-lan", label: "bridge-lan" },
          { name: "bridgeLocal", label: "bridgeLocal" },
        ],
      }),
      {
        mode: "lan-port",
        externalApConfirmed: true,
        ssid: "CafeGuest",
        bridge: "bridgeLocal",
        bands: [],
        lanPorts: ["ether2"],
        disableCapMode: false,
      },
    );
    expect(plan.steps.some((s) => s.path === "/ip/dhcp-server")).toBe(true);
  });

  it("blocks a pool from another bridge network instead of reusing it", () => {
    const plan = planHotspotSetup(
      baseProbe({
        hasHotspotPool: true,
        hotspotPoolRange: "192.168.88.10-192.168.88.254",
        bridgeFoundations: {
          bridgeLocal: {
            gatewayIp: "192.168.100.49",
            poolRange: "192.168.100.10-192.168.100.254",
            hasDhcpOnBridge: false,
          },
        },
        bridges: [{ name: "bridgeLocal", label: "bridgeLocal" }],
        suggestedBridge: "bridgeLocal",
        foundation: {
          gatewayIp: "192.168.100.49",
          poolRange: "192.168.100.10-192.168.100.254",
          hasDhcpOnBridge: false,
        },
      }),
      {
        mode: "lan-port",
        externalApConfirmed: true,
        ssid: "CafeGuest",
        bridge: "bridgeLocal",
        bands: [],
        lanPorts: ["ether2"],
        disableCapMode: false,
      },
    );
    expect(plan.canApply).toBe(false);
    expect(plan.blockReason).toContain("does not match");
    expect(plan.steps).toEqual([]);
  });

  it("skips existing pool and profile", () => {
    const plan = planHotspotSetup(
      baseProbe({
        hasHotspotPool: true,
        hasHotspotProfile: true,
        checklist: { pool: true, profile: true, server: false, ssid: false },
      }),
      {
        mode: "builtin-wifi",
        ssid: "Guest",
        bridge: "bridge-lan",
        bands: ["2.4"],
        lanPorts: [],
        disableCapMode: false,
      },
    );
    expect(plan.items.filter((i) => i.status === "skip").length).toBeGreaterThanOrEqual(2);
    expect(plan.steps.some((s) => s.path === "/ip/pool")).toBe(false);
  });

  it("creates a managed HotSpot profile for local voucher validation", () => {
    const plan = planHotspotSetup(baseProbe(), {
      mode: "builtin-wifi",
      ssid: "Guest",
      bridge: "bridge-lan",
      bands: ["2.4"],
      lanPorts: [],
      disableCapMode: false,
    });
    const profile = plan.steps.find((step) => step.path === "/ip/hotspot/profile");
    expect(profile?.body["use-radius"]).toBe("no");
  });

  it("plans LAN port mode with AP note", () => {
    const plan = planHotspotSetup(baseProbe(), {
      mode: "lan-port",
      externalApConfirmed: true,
      ssid: "Guest",
      bridge: "bridge-lan",
      bands: [],
      lanPorts: ["ether2"],
      disableCapMode: false,
    });
    expect(plan.canApply).toBe(true);
    expect(plan.items.some((i) => i.status === "info" && i.detail?.includes("external AP"))).toBe(
      true,
    );
    expect(plan.steps.some((s) => s.path === "/interface/bridge/port")).toBe(true);
  });

  it("bridges multiple LAN ports for switch + AP layouts", () => {
    const plan = planHotspotSetup(baseProbe(), {
      mode: "lan-port",
      externalApConfirmed: true,
      ssid: "CafeGuest",
      bridge: "bridge-lan",
      bands: [],
      lanPorts: ["ether3", "ether4", "ether5"],
      disableCapMode: false,
    });
    const bridgeSteps = plan.steps.filter((s) => s.path === "/interface/bridge/port");
    expect(bridgeSteps).toHaveLength(3);
    expect(bridgeSteps.map((s) => s.body.interface)).toEqual(["ether3", "ether4", "ether5"]);
    expect(plan.items.some((i) => i.detail?.includes("every external AP"))).toBe(true);
  });

  it("skips LAN ports already on the hotspot bridge", () => {
    const plan = planHotspotSetup(
      baseProbe(),
      {
        mode: "lan-port",
        externalApConfirmed: true,
        ssid: "CafeGuest",
        bridge: "bridge-lan",
        bands: [],
        lanPorts: ["ether3", "ether4"],
        disableCapMode: false,
      },
      { lanPortsOnBridge: new Set(["ether3", "ether4"]) },
    );
    expect(plan.steps.some((s) => s.path === "/interface/bridge/port")).toBe(false);
    expect(plan.items.filter((i) => i.kind === "port" && i.status === "skip")).toHaveLength(2);
  });

  it("blocks when CAP active without disableCapMode", () => {
    const plan = planHotspotSetup(baseProbe({ capModeActive: true }), {
      mode: "builtin-wifi",
      ssid: "Guest",
      bridge: "bridge-lan",
      bands: ["2.4"],
      lanPorts: [],
      disableCapMode: false,
    });
    expect(plan.canApply).toBe(false);
    expect(plan.steps).toHaveLength(0);
  });

  it("skips wifi objects that already exist on the router", () => {
    const plan = planHotspotSetup(
      baseProbe({
        existingWifiNames: [
          "mm-hs-open-guestnet",
          "mm-hs-dp-guestnet",
          "mm-hs-cfg-guestnet",
          "mm-hs-2g-guestnet",
        ],
      }),
      {
        mode: "builtin-wifi",
        ssid: "GuestNet",
        bridge: "bridge-lan",
        bands: ["2.4"],
        lanPorts: [],
        disableCapMode: false,
      },
    );
    expect(plan.steps.some((s) => s.path === "/interface/wifi/security")).toBe(false);
    expect(plan.steps.some((s) => s.path === "/interface/wifi")).toBe(false);
    expect(plan.items.find((i) => i.id === "wifi")?.status).toBe("skip");
  });

  it("plans local AP steps for master radios when disableCapMode is set", () => {
    const plan = planHotspotSetup(
      baseProbe({
        capModeActive: true,
        wifiInterfaces: [
          {
            id: "*1",
            name: "wifi1",
            ssid: null,
            disabled: false,
            masterInterface: null,
            configuration: null,
            comment: null,
            band: "2.4",
            managedByMagic: false,
          },
          {
            id: "*2",
            name: "wifi2",
            ssid: null,
            disabled: false,
            masterInterface: null,
            configuration: null,
            comment: null,
            band: "5",
            managedByMagic: false,
          },
        ],
      }),
      {
        mode: "builtin-wifi",
        ssid: "Guest",
        bridge: "bridge-lan",
        bands: ["2.4"],
        lanPorts: [],
        disableCapMode: true,
      },
    );
    expect(plan.canApply).toBe(true);
    expect(plan.steps.some((s) => s.path === "/interface/wifi/cap")).toBe(true);
    expect(plan.steps.some((s) => s.body.name === "wifi1")).toBe(true);
  });

  it("uses stable mm-hs-server name for hotspot server", () => {
    const plan = planHotspotSetup(
      baseProbe({ hotspotServers: [], hasHotspotPool: true, hasHotspotProfile: true }),
      {
        mode: "builtin-wifi",
        ssid: "Mikro Magic",
        bridge: "bridge-lan",
        bands: ["2.4"],
        lanPorts: [],
        disableCapMode: false,
      },
    );
    const serverStep = plan.steps.find((s) => s.path === "/ip/hotspot");
    expect(serverStep?.body.name).toBe(MM_HOTSPOT_SERVER_NAME);
  });

  it("uses mm-hs-<bridge> when canonical server name is on another bridge", () => {
    const plan = planHotspotSetup(
      baseProbe({
        hasHotspotPool: true,
        hasHotspotProfile: true,
        bridges: [
          { name: "bridge-lan", label: "bridge-lan" },
          { name: "bridge-guest", label: "bridge-guest" },
        ],
        bridgeFoundations: {
          "bridge-lan": {
            gatewayIp: "192.168.88.1",
            poolRange: "192.168.88.10-192.168.88.254",
            hasDhcpOnBridge: true,
          },
          "bridge-guest": {
            gatewayIp: "10.10.10.1",
            poolRange: "10.10.10.10-10.10.10.254",
            hasDhcpOnBridge: true,
          },
        },
        hotspotServers: [
          {
            id: "*1",
            name: MM_HOTSPOT_SERVER_NAME,
            interface: "bridge-lan",
            profile: MM_HOTSPOT_PROFILE_NAME,
            addressPool: MM_HOTSPOT_POOL_NAME,
            disabled: false,
            managedByMagic: true,
          },
        ],
      }),
      {
        mode: "lan-port",
        externalApConfirmed: true,
        ssid: "Guest",
        bridge: "bridge-guest",
        bands: [],
        lanPorts: ["ether2"],
        disableCapMode: false,
      },
    );
    const serverStep = plan.steps.find((s) => s.path === "/ip/hotspot");
    expect(serverStep?.body.name).toBe("mm-hs-bridge-guest");
    expect(serverStep?.body.interface).toBe("bridge-guest");
  });

  it("patches hotspot-address when profile gateway is stale", () => {
    const plan = planHotspotSetup(
      baseProbe({
        hasHotspotPool: true,
        hasHotspotProfile: true,
        hotspotProfile: { id: "*prof1", hotspotAddress: "192.168.88.1", useRadius: false },
        bridgeFoundations: {
          "bridge-lan": {
            gatewayIp: "10.20.30.1",
            poolRange: "10.20.30.10-10.20.30.254",
            hasDhcpOnBridge: true,
          },
        },
        foundation: {
          gatewayIp: "10.20.30.1",
          poolRange: "10.20.30.10-10.20.30.254",
          hasDhcpOnBridge: true,
        },
      }),
      {
        mode: "lan-port",
        externalApConfirmed: true,
        ssid: "Guest",
        bridge: "bridge-lan",
        bands: [],
        lanPorts: ["ether2"],
        disableCapMode: false,
      },
    );
    const patch = plan.steps.find(
      (s) => s.op === "patch" && s.path.includes("/ip/hotspot/profile/"),
    );
    expect(patch?.body["hotspot-address"]).toBe("10.20.30.1");
  });

  it("disables RADIUS on an existing Magic profile", () => {
    const plan = planHotspotSetup(
      baseProbe({
        hasHotspotPool: true,
        hasHotspotProfile: true,
        hotspotProfile: { id: "*prof1", hotspotAddress: "192.168.88.1", useRadius: true },
      }),
      {
        mode: "lan-port",
        externalApConfirmed: true,
        ssid: "Guest",
        bridge: "bridge-lan",
        bands: [],
        lanPorts: ["ether2"],
        disableCapMode: false,
      },
    );
    const patch = plan.steps.find((s) => s.path.includes("/ip/hotspot/profile/"));
    expect(patch?.body["use-radius"]).toBe("no");
  });

  it("binds an existing Hotspot server to the local voucher profile", () => {
    const plan = planHotspotSetup(
      baseProbe({
        hasHotspotPool: true,
        hasHotspotProfile: true,
        hotspotProfile: { id: "*prof1", hotspotAddress: "192.168.88.1", useRadius: false },
        hotspotServers: [
          {
            id: "*server1",
            name: "WELCOME",
            interface: "bridge-lan",
            profile: "WELCOME",
            addressPool: MM_HOTSPOT_POOL_NAME,
            disabled: false,
            managedByMagic: false,
          },
        ],
      }),
      {
        mode: "lan-port",
        externalApConfirmed: true,
        ssid: "WELCOME",
        bridge: "bridge-lan",
        bands: [],
        lanPorts: ["ether2"],
        disableCapMode: false,
      },
    );
    const patch = plan.steps.find(
      (step) => step.op === "patch" && step.path.includes("/ip/hotspot/*server1"),
    );
    expect(patch?.body.profile).toBe(MM_HOTSPOT_PROFILE_NAME);
    expect(patch?.rollbackBody?.profile).toBe("WELCOME");
  });

  it("creates open wifi security with empty authentication-types", () => {
    const plan = planHotspotSetup(baseProbe(), {
      mode: "builtin-wifi",
      ssid: "CafeGuest",
      bridge: "bridge-lan",
      bands: ["2.4"],
      lanPorts: [],
      disableCapMode: false,
    });
    const sec = plan.steps.find((s) => s.path === "/interface/wifi/security");
    expect(sec?.body["authentication-types"]).toBe("");
  });
});

describe("describePlannedStep", () => {
  it("builds CLI description for wifi configuration", () => {
    const cli = describePlannedStep({
      op: "put",
      path: "/interface/wifi/configuration",
      body: {
        name: "mm-hs-cfg-guest",
        ssid: "Guest",
        mode: "ap",
        security: "mm-hs-open-guest",
        datapath: "mm-hs-dp-guest",
      },
      label: "SSID Guest",
    });
    expect(cli).toContain("/interface wifi configuration add");
    expect(cli).not.toContain("comment=");
  });
});

describe("probeWifiHotspot", () => {
  it("detects wifiwave2 and default built-in mode", async () => {
    const result = await probeWifiHotspot(conn);
    expect(result.stack).toBe("wifiwave2");
    expect(result.defaultMode).toBe("builtin-wifi");
    expect(result.foundation.gatewayIp).toBe("192.168.88.1");
  });

  it("detects CAP mode when master radios use configuration.manager=capsman", async () => {
    state.cap = [{ enabled: "false" }];
    state.wifi = [
      {
        ".id": "*1",
        name: "wifi1",
        "configuration.manager": "capsman",
      },
      {
        ".id": "*2",
        name: "wifi2",
        "configuration.manager": "capsman-or-local",
      },
    ];
    const result = await probeWifiHotspot(conn);
    expect(result.capModeActive).toBe(true);
  });
});

describe("isCapsmanWifiManager", () => {
  it("matches capsman and capsman-or-local", () => {
    expect(isCapsmanWifiManager("capsman")).toBe(true);
    expect(isCapsmanWifiManager("capsman-or-local")).toBe(true);
    expect(isCapsmanWifiManager("local")).toBe(false);
  });
});

describe("plannedStepToCli", () => {
  it("builds pool add command", () => {
    const cli = plannedStepToCli({
      op: "put",
      path: "/ip/pool",
      body: { name: "hotspot-pool", ranges: "192.168.88.10-192.168.88.254", comment: "mm" },
      label: "pool",
    });
    expect(cli).toContain("/ip pool add");
    expect(cli).toContain("hotspot-pool");
  });

  it("omits comment on wifi security/configuration/virtual AP CLI", () => {
    const sec = plannedStepToCli({
      op: "put",
      path: "/interface/wifi/security",
      body: { name: "mm-hs-open-guest", comment: "mm-hotspot-ssid" },
      label: "sec",
    });
    expect(sec).toContain("/interface wifi security add");
    expect(sec).not.toContain("comment=");

    const cfg = plannedStepToCli({
      op: "put",
      path: "/interface/wifi/configuration",
      body: {
        name: "mm-hs-cfg-guest",
        ssid: "Mikro Magic",
        mode: "ap",
        security: "mm-hs-open-guest",
        datapath: "mm-hs-dp-guest",
        comment: "mm-hotspot-ssid",
      },
      label: "cfg",
    });
    expect(cfg).toContain('ssid="Mikro Magic"');
    expect(cfg).not.toContain("comment=");

    const vap = plannedStepToCli({
      op: "put",
      path: "/interface/wifi",
      body: {
        name: "mm-hs-2g-1",
        "master-interface": "wifi1",
        configuration: "mm-hs-cfg-1",
        disabled: "no",
        comment: "mm-hotspot-ssid",
      },
      label: "vap",
    });
    expect(vap).toContain("/interface wifi add");
    expect(vap).not.toContain("comment=");
  });

  it("builds wifi manager patch command", () => {
    const cli = plannedStepToCli({
      op: "patch",
      path: "/interface/wifi/*1",
      body: { name: "wifi1", "configuration.manager": "local" },
      label: "local ap",
    });
    expect(cli).toBe("/interface wifi set wifi1 configuration.manager=local");
  });

  it("omits comment on bridge port CLI", () => {
    const cli = plannedStepToCli({
      op: "put",
      path: "/interface/bridge/port",
      body: { bridge: "bridgeLocal", interface: "ether2", comment: "mm-hotspot-foundation" },
      label: "port",
    });
    expect(cli).toContain("/interface bridge port add");
    expect(cli).toContain("bridge=bridgeLocal");
    expect(cli).not.toContain("comment=");
  });
});

describe("applyHotspotSetup CLI fallback", () => {
  it("falls back to exec when REST returns no such command", async () => {
    const { routerAPI } = await import("@/lib/mikrotik.server");
    vi.mocked(routerAPI.raw).mockImplementation(async (_c, path, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method !== "GET") {
        throw new Error('RouterOS API 400: {"detail":"no such command"}');
      }
      return defaultRawMock(_c, path, init);
    });

    await applyHotspotSetup(conn, {
      mode: "builtin-wifi",
      ssid: "GuestNet",
      bridge: "bridge-lan",
      bands: ["2.4"],
      lanPorts: [],
      disableCapMode: false,
    });

    expect(vi.mocked(routerAPI.execScript).mock.calls.length).toBeGreaterThan(0);
  });

  it("falls back when routerAPI has normalized the REST compatibility error", async () => {
    const { routerAPI } = await import("@/lib/mikrotik.server");
    vi.mocked(routerAPI.raw).mockImplementation(async (_c, path, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method !== "GET") {
        throw new Error(
          "This router rejected a command (unsupported menu or RouterOS too old). Update RouterOS 7.1+ if possible. Magical fallback may retry via CLI — open the apply trace for details.",
        );
      }
      return defaultRawMock(_c, path, init);
    });

    const result = await applyHotspotSetup(conn, {
      mode: "lan-port",
      externalApConfirmed: true,
      ssid: "GuestNet",
      bridge: "bridge-lan",
      bands: [],
      lanPorts: ["ether2"],
      disableCapMode: false,
    });

    expect(result.ok).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps.every((step) => step.transport === "cli")).toBe(true);
    expect(result.steps.every((step) => step.outcome === "created")).toBe(true);
  });

  it("returns step trace with created and skipped counts", async () => {
    state.pools = [{ name: MM_HOTSPOT_POOL_NAME }];
    state.profiles = [{ name: MM_HOTSPOT_PROFILE_NAME }];
    const result = await applyHotspotSetup(conn, {
      mode: "builtin-wifi",
      ssid: "GuestNet",
      bridge: "bridge-lan",
      bands: ["2.4"],
      lanPorts: [],
      disableCapMode: false,
    });
    expect(result.ok).toBe(true);
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.created.length + result.skipped.length).toBe(result.steps.length);
    expect(result.steps.every((s) => s.command || s.error)).toBe(true);
  });
});

/** Persist PUT/POST creates into mock state so mid-apply rollback can DELETE by name. */
function statefulApplyMock(opts?: { failPutPaths?: string[]; failDeletePaths?: string[] }) {
  let seq = 100;
  const failPut = new Set(opts?.failPutPaths ?? []);
  const failDelete = new Set(opts?.failDeletePaths ?? []);

  const bucketFor = (path: string): Record<string, string>[] | null => {
    if (path === "/ip/pool") return state.pools;
    if (path === "/ip/hotspot/profile") return state.profiles;
    if (path === "/ip/hotspot") return state.hotspots;
    if (path === "/ip/dhcp-server") return state.dhcp;
    if (path === "/ip/dhcp-server/network") return state.dhcpNetworks;
    if (path === "/interface/bridge/port") return state.bridgePorts;
    if (path === "/interface/wifi/security") return state.wifiSecurity;
    if (path === "/interface/wifi/datapath") return state.wifiDatapath;
    if (path === "/interface/wifi/configuration") return state.wifiConfig;
    if (path === "/interface/wifi") return state.wifi;
    return null;
  };

  return async (_c: RouterConn, path: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET") return defaultRawMock(_c, path, init);

    state.writes.push(`${method} ${path}`);

    if (method === "DELETE") {
      const slash = path.lastIndexOf("/");
      const base = path.slice(0, slash);
      const id = decodeURIComponent(path.slice(slash + 1));
      if (failDelete.has(base)) throw new Error("simulated DELETE failure");
      const bucket = bucketFor(base);
      if (bucket) {
        const idx = bucket.findIndex((r) => r[".id"] === id);
        if (idx >= 0) bucket.splice(idx, 1);
      }
      return undefined;
    }

    if (method === "PATCH") {
      const slash = path.lastIndexOf("/");
      const base = path.slice(0, slash);
      const id = decodeURIComponent(path.slice(slash + 1));
      const bucket = bucketFor(base);
      if (bucket && typeof init?.body === "string") {
        const row = bucket.find((item) => item[".id"] === id);
        if (row) Object.assign(row, JSON.parse(init.body) as Record<string, string>);
      }
      return undefined;
    }

    if (method === "PUT" || method === "POST") {
      const basePath = path.replace(/\/add$/, "");
      if (failPut.has(basePath)) throw new Error("simulated REST failure");
      const bucket = bucketFor(basePath);
      if (bucket && typeof init?.body === "string") {
        const body = JSON.parse(init.body) as Record<string, string>;
        const id = `*${seq++}`;
        bucket.push({ ".id": id, ...body });
      }
      return undefined;
    }

    return defaultRawMock(_c, path, init);
  };
}

describe("applyHotspotSetup rollback", () => {
  it("rolls back earlier PUT creates when a later step fails (mocked router)", async () => {
    const { routerAPI } = await import("@/lib/mikrotik.server");
    vi.mocked(routerAPI.raw).mockImplementation(
      statefulApplyMock({ failPutPaths: ["/ip/hotspot"] }),
    );

    const result = await applyHotspotSetup(conn, {
      mode: "builtin-wifi",
      ssid: "GuestNet",
      bridge: "bridge-lan",
      bands: ["2.4"],
      lanPort: null,
      disableCapMode: false,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Hotspot server.*failed/i);
    expect(result.error).toMatch(/rolled back/i);
    expect(result.rolledBack?.length).toBeGreaterThanOrEqual(2);
    expect(result.rolledBack).toEqual(
      expect.arrayContaining([
        `IP pool ${MM_HOTSPOT_POOL_NAME}`,
        `Hotspot profile ${MM_HOTSPOT_PROFILE_NAME}`,
      ]),
    );
    expect(state.pools.find((p) => p.name === MM_HOTSPOT_POOL_NAME)).toBeUndefined();
    expect(state.profiles.find((p) => p.name === MM_HOTSPOT_PROFILE_NAME)).toBeUndefined();
    expect(state.hotspots.find((h) => h.name === MM_HOTSPOT_SERVER_NAME)).toBeUndefined();
    expect(state.writes.some((w) => w.startsWith("DELETE /ip/pool/"))).toBe(true);
    expect(state.writes.some((w) => w.startsWith("DELETE /ip/hotspot/profile/"))).toBe(true);
  });

  it("reports remaining objects when rollback DELETE fails (mocked router)", async () => {
    const { routerAPI } = await import("@/lib/mikrotik.server");
    vi.mocked(routerAPI.raw).mockImplementation(
      statefulApplyMock({
        failPutPaths: ["/ip/hotspot"],
        failDeletePaths: ["/ip/pool", "/ip/hotspot/profile"],
      }),
    );

    const result = await applyHotspotSetup(conn, {
      mode: "builtin-wifi",
      ssid: "GuestNet",
      bridge: "bridge-lan",
      bands: ["2.4"],
      lanPort: null,
      disableCapMode: false,
    });

    expect(result.ok).toBe(false);
    expect(result.rolledBack ?? []).toHaveLength(0);
    expect(result.error).toMatch(/may remain on the router/i);
    expect(state.pools.find((p) => p.name === MM_HOTSPOT_POOL_NAME)).toBeDefined();
    expect(state.profiles.find((p) => p.name === MM_HOTSPOT_PROFILE_NAME)).toBeDefined();
  });

  it("backs up first and restores a patched profile after a later failure", async () => {
    const { routerAPI } = await import("@/lib/mikrotik.server");
    state.pools = [{ ".id": "*pool", name: MM_HOTSPOT_POOL_NAME }];
    state.profiles = [
      {
        ".id": "*profile",
        name: MM_HOTSPOT_PROFILE_NAME,
        "hotspot-address": "192.168.88.2",
      },
    ];
    vi.mocked(routerAPI.raw).mockImplementation(
      statefulApplyMock({ failPutPaths: ["/ip/hotspot"] }),
    );

    const result = await applyHotspotSetup(conn, {
      mode: "builtin-wifi",
      ssid: "GuestNet",
      bridge: "bridge-lan",
      bands: ["2.4"],
      lanPorts: [],
      disableCapMode: false,
    });

    expect(state.writes[0]).toMatch(/^EXEC \/system backup save/);
    expect(result.ok).toBe(false);
    expect(result.rolledBack).toContain("Refresh profile gateway → 192.168.88.1");
    expect(state.profiles[0]?.["hotspot-address"]).toBe("192.168.88.2");
  });
});

describe("applyHotspotSetup isolation", () => {
  it("refuses WAN bridge", async () => {
    state.lists = [{ ".id": "*L", name: "WAN" }];
    state.listMembers = [{ list: "*L", interface: "bridge-wan" }];
    state.bridges = [{ name: "bridge-wan" }, { name: "bridge-lan" }];
    await expect(
      applyHotspotSetup(conn, {
        mode: "builtin-wifi",
        ssid: "Guest",
        bridge: "bridge-wan",
        bands: ["2.4"],
        lanPorts: [],
        disableCapMode: false,
      }),
    ).rejects.toThrow(/WAN bridge/i);
  });

  it("refuses a WAN-labelled physical port even when RouterOS has no WAN list", async () => {
    state.ethers = [{ name: "ether1_WAN" }, { name: "ether4", comment: "Guest AP" }];
    await expect(
      applyHotspotSetup(conn, {
        mode: "lan-port",
        externalApConfirmed: true,
        ssid: "Guest",
        bridge: "bridge-lan",
        bands: [],
        lanPorts: ["ether1_WAN"],
        disableCapMode: false,
      }),
    ).rejects.toThrow(/WAN or unavailable port/i);
    expect(state.writes).toEqual([]);
  });

  it("creates foundation and wifi without touching firewall", async () => {
    state.dhcp = [];
    state.dhcpNetworks = [];
    await applyHotspotSetup(conn, {
      mode: "builtin-wifi",
      ssid: "GuestNet",
      bridge: "bridge-lan",
      bands: ["2.4", "5"],
      lanPorts: [],
      disableCapMode: false,
    });
    expect(state.writes.some((w) => w.includes("/ip/pool"))).toBe(true);
    expect(state.writes.some((w) => w.includes("/ip/dhcp-server"))).toBe(true);
    expect(state.writes.some((w) => w.includes("/ip/hotspot/profile"))).toBe(true);
    expect(state.writes.some((w) => w.includes("/interface/wifi"))).toBe(true);
    expect(state.writes.some((w) => w.includes("/ip/firewall"))).toBe(false);
    expect(state.writes.some((w) => w.includes("/caps-man"))).toBe(false);
  });
});

describe("slugFromSsid", () => {
  it("slugifies names", () => {
    expect(slugFromSsid("Guest WiFi!")).toBe("guest-wifi");
  });
});

describe("pickSuggestedBridge", () => {
  it("prefers hotspot server interface", () => {
    expect(
      pickSuggestedBridge(
        [{ name: "bridge-lan", label: "bridge-lan" }],
        [
          {
            id: "*1",
            name: "hs",
            interface: "bridge-hotspot",
            profile: null,
            addressPool: null,
            disabled: false,
            managedByMagic: false,
          },
        ],
      ),
    ).toBe("bridge-hotspot");
  });

  it("prefers bridgeLocal over an unrelated first bridge", () => {
    expect(
      pickSuggestedBridge(
        [
          { name: "br-guest", label: "br-guest" },
          { name: "bridgeLocal", label: "bridgeLocal" },
        ],
        [],
      ),
    ).toBe("bridgeLocal");
  });
});

describe("guestSsidNamesFromProbe / assessHotspotGuestReady", () => {
  it("lists Magic SSID strings from virtual APs", () => {
    const names = guestSsidNamesFromProbe(
      baseProbe({
        wifiInterfaces: [
          {
            id: "*9",
            name: "mm-hs-2g-cafe",
            ssid: "CafeGuest",
            disabled: false,
            masterInterface: "wifi1",
            configuration: "mm-hs-cfg-cafe",
            comment: "mm-hotspot-ssid",
            band: "2.4",
            managedByMagic: true,
          },
        ],
        checklist: { pool: true, profile: true, server: true, ssid: true },
      }),
    );
    expect(names).toEqual(["CafeGuest"]);
  });

  it("blocks when foundation missing", () => {
    const r = assessHotspotGuestReady(baseProbe());
    expect(r.level).toBe("block");
    expect(r.foundationReady).toBe(false);
  });

  it("warns for LAN-port foundation without a router-observable guest SSID", () => {
    const r = assessHotspotGuestReady(
      baseProbe({
        hasHotspotPool: true,
        hasHotspotProfile: true,
        checklist: { pool: true, profile: true, server: true, ssid: false },
        hotspotServers: [
          {
            id: "*1",
            name: "mm-hs-server",
            interface: "bridge-lan",
            profile: "hsprof-vouchers",
            addressPool: "hotspot-pool",
            disabled: false,
            managedByMagic: true,
          },
        ],
      }),
    );
    expect(r.level).toBe("warn");
    expect(r.foundationReady).toBe(true);
    expect(r.hasGuestSsid).toBe(false);
    expect(r.radioReady).toBe(false);
    expect(r.accessPathReady).toBe(false);
    expect(r.summary).toMatch(/external AP is not verified/i);
  });

  it("ok when Magic SSID is present", () => {
    const r = assessHotspotGuestReady(
      baseProbe({
        hasHotspotPool: true,
        hasHotspotProfile: true,
        checklist: { pool: true, profile: true, server: true, ssid: true },
        wifiInterfaces: [
          {
            id: "*9",
            name: "mm-hs-2g-cafe",
            ssid: "CafeGuest",
            disabled: false,
            masterInterface: "wifi1",
            configuration: "mm-hs-cfg-cafe",
            comment: null,
            band: "2.4",
            managedByMagic: true,
          },
        ],
      }),
    );
    expect(r.level).toBe("ok");
    expect(r.accessPathReady).toBe(true);
    expect(r.guestSsids).toEqual(["CafeGuest"]);
  });

  it("blocks voucher sales when the managed profile requires RADIUS", () => {
    const r = assessHotspotGuestReady(
      baseProbe({
        voucherLoginMode: "radius",
        hasHotspotPool: true,
        hasHotspotProfile: true,
        checklist: { pool: true, profile: true, server: true, ssid: true },
      }),
    );
    expect(r.level).toBe("block");
    expect(r.summary).toMatch(/RADIUS/i);
  });
});
