import { describe, it, expect } from "vitest";
import { capability, isSupported, supportedActions, assertCapability } from "@/lib/devices/vendors";
import {
  poeCycleGuard,
  checkPoeConfirmation,
  summarizePorts,
  type SwitchPort,
} from "@/lib/devices/ports";
import {
  decideIncidents,
  resolvableIncidents,
  defaultRules,
  freshnessOf,
  type IncidentSignal,
  type OpenIncident,
} from "@/lib/alerts/rules";
import { consecutiveFailures, buildSignals } from "@/lib/health.server";
import { visibleNavItems, navItemsForMode, canAccessPath } from "@/lib/nav/modes";

const mikrotikSwitch = {
  vendor: "mikrotik",
  category: "switch",
  transport: "direct",
} as const;
const ciscoSwitch = { vendor: "cisco", category: "switch", transport: "direct" } as const;

function port(over: Partial<SwitchPort> = {}): SwitchPort {
  return {
    ref: "*1",
    name: "ether5",
    index: 5,
    enabled: true,
    link: "up",
    speedMbps: 1000,
    duplex: "full",
    role: "access",
    vlan: 10,
    poe: "on",
    poeWatts: 6,
    apMac: null,
    apName: null,
    isManagement: false,
    description: null,
    ...over,
  };
}

describe("capability matrix", () => {
  it("allows what MikroTik switches really support", () => {
    expect(isSupported(mikrotikSwitch, "poeCycle")).toBe(true);
    expect(isSupported(mikrotikSwitch, "ports")).toBe(true);
  });

  it("refuses unsupported actions with a readable reason", () => {
    const c = capability(ciscoSwitch, "poeCycle");
    expect(c.supported).toBe(false);
    if (!c.supported) expect(c.reason).toMatch(/PoE power-cycle a port is not available/i);
  });

  it("refuses whole categories a vendor does not cover", () => {
    const c = capability({ vendor: "cisco", category: "ap", transport: "direct" }, "inventory");
    expect(c.supported).toBe(false);
  });

  it("blocks transport-incompatible actions regardless of vendor", () => {
    const c = capability(
      { vendor: "mikrotik", category: "ap", transport: "controller" },
      "terminal",
    );
    expect(c.supported).toBe(false);
    if (!c.supported) expect(c.reason).toMatch(/controller/i);
  });

  it("assertCapability throws the same message the UI shows", () => {
    expect(() => assertCapability(ciscoSwitch, "poeCycle")).toThrowError(
      /not available for Cisco/i,
    );
    expect(() => assertCapability(mikrotikSwitch, "poeCycle")).not.toThrow();
  });

  it("supportedActions never includes an unsupported action", () => {
    for (const a of supportedActions(ciscoSwitch)) {
      expect(isSupported(ciscoSwitch, a)).toBe(true);
    }
    expect(supportedActions(ciscoSwitch)).not.toContain("poeCycle");
  });
});

describe("PoE safety", () => {
  it("permits a plain powered access port", () => {
    expect(poeCycleGuard(mikrotikSwitch, port()).allowed).toBe(true);
  });

  it("never cuts the management path", () => {
    const g = poeCycleGuard(mikrotikSwitch, port({ isManagement: true }));
    expect(g.allowed).toBe(false);
    if (!g.allowed) expect(g.reason).toMatch(/cut you off/i);
  });

  it("never cuts uplink or trunk ports", () => {
    expect(poeCycleGuard(mikrotikSwitch, port({ role: "uplink" })).allowed).toBe(false);
    expect(poeCycleGuard(mikrotikSwitch, port({ role: "trunk" })).allowed).toBe(false);
  });

  it("refuses when PoE state is unknown or already off", () => {
    expect(poeCycleGuard(mikrotikSwitch, port({ poe: "unknown" })).allowed).toBe(false);
    expect(poeCycleGuard(mikrotikSwitch, port({ poe: "off" })).allowed).toBe(false);
    expect(poeCycleGuard(mikrotikSwitch, port({ poe: "unsupported" })).allowed).toBe(false);
  });

  it("requires the exact port name as typed confirmation", () => {
    expect(() => checkPoeConfirmation(port(), "ether4")).toThrowError(/ether5/);
    expect(() => checkPoeConfirmation(port(), " ether5 ")).not.toThrow();
  });

  it("summarises ports without inventing PoE draw", () => {
    const s = summarizePorts({
      ports: [
        port(),
        port({ ref: "*2", name: "ether6", poe: "unsupported", poeWatts: null, link: "down" }),
      ],
      budget: { totalWatts: null, usedWatts: null },
      measured: true,
      fetchedAt: new Date().toISOString(),
    });
    expect(s.total).toBe(2);
    expect(s.up).toBe(1);
    expect(s.poeOn).toBe(1);
    expect(s.usedWatts).toBeNull();
  });
});

describe("incident dedup and cooldown", () => {
  const signal: IncidentSignal = {
    kind: "site_offline",
    subjectId: "r1",
    subjectLabel: "Front desk",
    consecutive: 3,
  };
  const now = Date.parse("2026-01-01T12:00:00Z");

  it("creates an incident once the threshold is met", () => {
    const d = decideIncidents([signal], defaultRules(), [], now);
    expect(d[0]!.action).toBe("create");
  });

  it("holds back a single failed check", () => {
    const d = decideIncidents([{ ...signal, consecutive: 1 }], defaultRules(), [], now);
    expect(d[0]!.action).toBe("suppress");
  });

  it("suppresses a repeat inside the cooldown window", () => {
    const open: OpenIncident[] = [
      {
        kind: "site_offline",
        subjectId: "r1",
        lastNotifiedAt: new Date(now - 5 * 60_000).toISOString(),
        resolvedAt: null,
      },
    ];
    const d = decideIncidents([signal], defaultRules(), open, now);
    expect(d[0]!.action).toBe("suppress");
    if (d[0]!.action === "suppress") expect(d[0]!.reason).toMatch(/quiet for another/i);
  });

  it("collapses duplicate signals in one run", () => {
    const d = decideIncidents([signal, signal], defaultRules(), [], now);
    expect(d.filter((x) => x.action === "create")).toHaveLength(1);
  });

  it("respects a disabled rule", () => {
    const rules = defaultRules().map((r) =>
      r.kind === "site_offline" ? { ...r, enabled: false } : r,
    );
    const d = decideIncidents([signal], rules, [], now);
    expect(d[0]!.action).toBe("suppress");
  });

  it("resolves open incidents whose signal has stopped", () => {
    const open: OpenIncident[] = [
      { kind: "site_offline", subjectId: "r9", lastNotifiedAt: null, resolvedAt: null },
    ];
    expect(resolvableIncidents([signal], open)).toHaveLength(1);
    expect(resolvableIncidents([{ ...signal, subjectId: "r9" }], open)).toHaveLength(0);
  });

  it("distinguishes measured, stale and unavailable data", () => {
    expect(freshnessOf(new Date(now - 60_000).toISOString(), 10, now)).toBe("measured");
    expect(freshnessOf(new Date(now - 60 * 60_000).toISOString(), 10, now)).toBe("stale");
    expect(freshnessOf(null, 10, now)).toBe("unavailable");
  });
});

describe("health signal building", () => {
  const history = [
    {
      subject_kind: "router",
      subject_id: "r1",
      reachable: false,
      wan_state: null,
      connector_state: null,
      observed_at: "2026-01-01T11:58:00Z",
    },
    {
      subject_kind: "router",
      subject_id: "r1",
      reachable: false,
      wan_state: null,
      connector_state: null,
      observed_at: "2026-01-01T11:56:00Z",
    },
    {
      subject_kind: "router",
      subject_id: "r1",
      reachable: true,
      wan_state: null,
      connector_state: null,
      observed_at: "2026-01-01T11:54:00Z",
    },
  ];

  it("counts only the unbroken run of failures", () => {
    expect(consecutiveFailures(history, "router", "r1", (r) => r.reachable === false)).toBe(2);
  });

  it("raises site_offline for an unreachable router and wan_degraded for a degraded uplink", () => {
    const signals = buildSignals(
      history,
      [
        {
          id: "r1",
          name: "Front desk",
          siteId: null,
          online: false,
          latencyMs: null,
          uptimeSeconds: null,
          wanState: "unknown",
          tunnelState: "none",
          error: "timeout",
        },
        {
          id: "r2",
          name: "Cafe",
          siteId: null,
          online: true,
          latencyMs: 40,
          uptimeSeconds: 100,
          wanState: "degraded",
          tunnelState: "none",
          error: null,
        },
      ],
      [],
    );
    expect(signals.map((s) => s.kind)).toEqual(["site_offline", "wan_degraded"]);
  });

  it("flags a connector with no recent heartbeat", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    const signals = buildSignals(
      [],
      [],
      [{ id: "c1", name: "Shop connector", enabled: true, last_seen_at: "2026-01-01T11:30:00Z" }],
      now,
    );
    expect(signals[0]!.kind).toBe("connector_stale");
  });

  it("ignores a connector that checked in moments ago", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    const signals = buildSignals(
      [],
      [],
      [{ id: "c1", name: "Shop connector", enabled: true, last_seen_at: "2026-01-01T11:58:00Z" }],
      now,
    );
    expect(signals).toHaveLength(0);
  });
});

describe("role visibility for the new surfaces", () => {
  it("keeps deployments and readiness for privileged roles only", () => {
    const client = visibleNavItems(["client"]).map((i) => i.to);
    expect(client).not.toContain("/app/deployments");
    expect(client).not.toContain("/app/readiness");
    const owner = visibleNavItems(["primary"]).map((i) => i.to);
    expect(owner).toContain("/app/deployments");
    expect(owner).toContain("/app/readiness");
  });

  it("shows devices and incidents to any active member under Operations", () => {
    const ops = navItemsForMode(["client"], "operations").map((i) => i.to);
    expect(ops).toContain("/app/devices");
    expect(ops).toContain("/app/incidents");
  });

  it("keeps expired accounts out of the new operations surfaces", () => {
    expect(canAccessPath(["expired"], "/app/devices")).toBe(false);
    expect(canAccessPath(["expired"], "/app/incidents")).toBe(false);
  });
});
