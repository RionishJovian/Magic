import { describe, expect, it } from "vitest";
import { planMultiWan, capabilitiesFor, parseOsVersion } from "@/lib/provisioning/multi-wan";
import { SandboxTransport } from "@/lib/provisioning/sandbox";
import { applyIntent, planIntent } from "@/lib/provisioning/engine.server";
import { makeTag, parseTag, stableHash } from "@/lib/provisioning/tags";
import type { DeviceSnapshot, MultiWanIntent, SnapshotRule } from "@/lib/provisioning/types";

const ROUTER = "11111111-1111-1111-1111-111111111111";

function intent(over: Partial<MultiWanIntent> = {}): MultiWanIntent {
  return {
    kind: "multi-wan",
    routerId: ROUTER,
    mode: "balance",
    lanInterface: "bridge-lan",
    allowManagementPathChange: false,
    policy: { failThreshold: 3, probeIntervalSec: 10, holdDownSec: 60, autoFailback: true },
    links: [
      {
        key: "fiber",
        label: "ISP Fiber",
        iface: "ether1",
        provider: "fiber",
        gateway: "10.0.0.1",
        weight: 1,
        healthCheckTarget: "1.1.1.1",
        secondaryHealthCheckTarget: "9.9.9.9",
        cgnat: false,
        wantsInbound: true,
        enabled: true,
      },
      {
        key: "starlink",
        label: "Starlink",
        iface: "ether2",
        provider: "starlink",
        gateway: "10.1.0.1",
        weight: 1,
        healthCheckTarget: "8.8.8.8",
        secondaryHealthCheckTarget: "208.67.222.222",
        cgnat: true,
        wantsInbound: false,
        enabled: true,
      },
    ],
    ...over,
  };
}

function snapshot(over: Partial<DeviceSnapshot> = {}): DeviceSnapshot {
  const version = parseOsVersion(over.version?.raw ?? "7.14.3");
  return {
    routerId: ROUTER,
    identity: "test",
    boardName: "RB5009",
    version,
    capabilities: capabilitiesFor(version),
    interfaces: ["ether1", "ether2", "bridge-lan"].map((name) => ({
      name,
      type: "ether",
      running: true,
    })),
    addresses: [],
    routes: [],
    rules: [],
    managementIface: null,
    publicAddress: null,
    sandbox: true,
    takenAt: new Date(0).toISOString(),
    ...over,
  };
}

describe("tags", () => {
  it("is stable regardless of key order", () => {
    expect(stableHash({ a: 1, b: 2 })).toBe(stableHash({ b: 2, a: 1 }));
  });
  it("round-trips through a RouterOS comment", () => {
    const tag = makeTag("multi-wan", { r: "route", key: "fiber" });
    expect(parseTag(`some text ${tag}`)).toEqual({
      intent: "multi-wan",
      hash: tag.split(":")[2],
    });
  });
});

describe("multi-WAN planning idempotency", () => {
  it("plans additions on a clean device", () => {
    const plan = planMultiWan(intent(), snapshot());
    expect(plan.summary.add).toBeGreaterThan(0);
    expect(plan.summary.skip).toBe(0);
    expect(plan.noop).toBe(false);
  });

  it("skips everything when the same intent is replanned against its own result", () => {
    const first = planMultiWan(intent(), snapshot());
    const rules: SnapshotRule[] = first.steps.map((s) => ({ section: s.section, comment: s.tag }));
    const second = planMultiWan(intent(), snapshot({ rules }));
    expect(second.summary.add).toBe(0);
    expect(second.summary.modify).toBe(0);
    expect(second.summary.remove).toBe(0);
    expect(second.summary.skip).toBe(first.steps.length);
    expect(second.noop).toBe(true);
  });

  it("removes managed rules the intent no longer wants", () => {
    const first = planMultiWan(intent(), snapshot());
    const rules: SnapshotRule[] = first.steps.map((s) => ({ section: s.section, comment: s.tag }));
    const reduced = intent({
      links: intent().links.map((l) => (l.key === "starlink" ? { ...l, enabled: false } : l)),
      mode: "failover",
    });
    const second = planMultiWan(reduced, snapshot({ rules }));
    expect(second.summary.remove).toBeGreaterThan(0);
  });

  it("does not duplicate rules across repeated sandbox applies", async () => {
    const t = new SandboxTransport({ interfaces: ["ether1", "ether2", "bridge-lan"] });
    const first = await applyIntent(t, intent(), { skipBackup: true });
    expect(first.outcome.ok).toBe(true);
    const second = await planIntent(t, intent());
    expect(second.plan.noop).toBe(true);
    expect(second.plan.summary.skip).toBe(first.plan.steps.length);
  });
});

describe("management-path conflicts", () => {
  it("blocks changes to the uplink carrying management traffic", () => {
    const plan = planMultiWan(intent(), snapshot({ managementIface: "ether1" }));
    const f = plan.findings.find((x) => x.id === "management-path");
    expect(f?.severity).toBe("blocker");
    expect(plan.blocked).toBe(true);
  });

  it("downgrades to a warning once the operator acknowledges it", () => {
    const plan = planMultiWan(
      intent({ allowManagementPathChange: true }),
      snapshot({ managementIface: "ether1" }),
    );
    expect(plan.findings.find((x) => x.id === "management-path")).toBeUndefined();
    expect(plan.findings.find((x) => x.id === "management-path-ack")?.severity).toBe("warning");
  });

  it("always blocks disabling the management uplink", () => {
    const plan = planMultiWan(
      intent({
        allowManagementPathChange: true,
        links: intent().links.map((l) => (l.key === "fiber" ? { ...l, enabled: false } : l)),
      }),
      snapshot({ managementIface: "ether1" }),
    );
    expect(plan.findings.find((x) => x.id === "management-path-disabled")?.severity).toBe(
      "blocker",
    );
  });
});

describe("RouterOS capability gating", () => {
  it("blocks apply on RouterOS 6 and warns about legacy routing marks", () => {
    const v6 = parseOsVersion("6.49.10");
    const plan = planMultiWan(
      intent(),
      snapshot({ version: v6, capabilities: capabilitiesFor(v6) }),
    );
    expect(plan.findings.find((f) => f.id === "os-too-old")?.severity).toBe("blocker");
    expect(plan.findings.find((f) => f.id === "legacy-routing-marks")?.severity).toBe("warning");
    expect(plan.steps.some((s) => s.command.includes("routing-mark="))).toBe(true);
    expect(plan.steps.some((s) => s.command.includes("routing-table="))).toBe(false);
  });

  it("uses routing tables on RouterOS 7", () => {
    const plan = planMultiWan(intent(), snapshot());
    expect(plan.steps.some((s) => s.command.includes("routing-table="))).toBe(true);
    expect(plan.findings.find((f) => f.id === "os-too-old")).toBeUndefined();
  });

  it("refuses to apply while blockers remain", async () => {
    const t = new SandboxTransport({
      version: "6.49.10",
      interfaces: ["ether1", "ether2", "bridge-lan"],
    });
    const { outcome } = await applyIntent(t, intent(), { skipBackup: true });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/blockers/i);
  });
});

describe("Starlink / CGNAT behaviour", () => {
  it("warns that a Starlink uplink is outbound only", () => {
    const plan = planMultiWan(intent(), snapshot());
    const f = plan.findings.find((x) => x.id === "cgnat-starlink");
    expect(f?.severity).toBe("warning");
    expect(f?.detail).toMatch(/port forwarding/i);
  });

  it("blocks when inbound is requested on a CGNAT uplink", () => {
    const plan = planMultiWan(
      intent({
        links: intent().links.map((l) => (l.key === "starlink" ? { ...l, wantsInbound: true } : l)),
      }),
      snapshot(),
    );
    expect(plan.findings.find((x) => x.id === "cgnat-starlink")?.severity).toBe("blocker");
    expect(plan.blocked).toBe(true);
  });

  it("never claims that balancing adds bandwidth together", () => {
    const plan = planMultiWan(intent(), snapshot());
    const info = plan.findings.find((x) => x.id === "balance-expectation");
    expect(info?.severity).toBe("info");
    expect(info?.detail).toMatch(/will not exceed the speed of the one uplink/i);
  });
});

describe("production failover", () => {
  it("puts default routes in the main table with recursive probes", () => {
    const plan = planMultiWan(intent({ mode: "failover" }), snapshot());
    const defaults = plan.steps.filter((s) => s.command.includes("dst-address=0.0.0.0/0"));
    expect(defaults.length).toBe(4);
    expect(
      defaults.every(
        (s) => !s.command.includes("routing-table=") && !s.command.includes("routing-mark="),
      ),
    ).toBe(true);
    expect(defaults.every((s) => s.command.includes("target-scope=11"))).toBe(true);
    expect(defaults.slice(0, 2).every((s) => s.command.includes("distance=1"))).toBe(true);
    expect(defaults.slice(2).every((s) => s.command.includes("distance=2"))).toBe(true);
    expect(plan.steps.some((s) => s.command.includes("dst-address=1.1.1.1/32"))).toBe(true);
    expect(plan.steps.some((s) => s.command.includes("dst-address=9.9.9.9/32"))).toBe(true);
    expect(plan.steps.some((s) => s.command.includes("dst-address=8.8.8.8/32"))).toBe(true);
    expect(plan.steps.some((s) => s.command.includes("dst-address=208.67.222.222/32"))).toBe(true);
    expect(plan.steps.some((s) => s.command.includes("gateway=10.0.0.1"))).toBe(true);
    expect(plan.steps.some((s) => s.command.includes("gateway=10.1.0.1"))).toBe(true);
  });

  it("uses RouterOS recursive route health instead of state-transition scripts", () => {
    const plan = planMultiWan(intent({ mode: "failover" }), snapshot());
    expect(plan.steps.some((s) => s.section === "/tool/netwatch")).toBe(false);
    expect(
      plan.steps
        .filter((s) => s.command.includes("dst-address=0.0.0.0/0"))
        .every((s) => s.command.includes("check-gateway=ping")),
    ).toBe(true);
  });

  it("adds one masquerade rule per WAN", () => {
    const plan = planMultiWan(intent({ mode: "failover" }), snapshot());
    const nat = plan.steps.filter((s) => s.section === "/ip/firewall/nat");
    expect(nat).toHaveLength(2);
    expect(nat[0]?.command).toMatch(/chain=srcnat.*out-interface=ether1.*masquerade/);
    expect(nat[1]?.command).toMatch(/chain=srcnat.*out-interface=ether2.*masquerade/);
  });

  it("turns off DHCP add-default-route so it cannot fight failover", () => {
    const plan = planMultiWan(
      intent({ mode: "failover" }),
      snapshot({ dhcpClients: [{ iface: "ether1", addDefaultRoute: true }] }),
    );
    const dhcp = plan.steps.find((s) => s.section === "/ip/dhcp-client");
    expect(dhcp?.command).toMatch(/add-default-route=no/);
    expect(dhcp?.command).toMatch(/interface=ether1/);
    const firstManagedRoute = plan.steps.findIndex((step) => step.section === "/ip/route");
    const dhcpChange = plan.steps.findIndex((step) => step.section === "/ip/dhcp-client");
    expect(dhcpChange).toBeGreaterThan(firstManagedRoute);
  });

  it("never deletes a DHCP or PPPoE client when the intent changes", () => {
    const tagged = "mmagic:multi-wan:deadbeef";
    const plan = planMultiWan(
      intent({ mode: "failover" }),
      snapshot({
        rules: [
          { section: "/ip/dhcp-client", comment: tagged },
          { section: "/interface/pppoe-client", comment: tagged },
        ],
      }),
    );
    expect(plan.steps.filter((s) => s.action === "remove")).toEqual([]);
  });

  it("emits stale removals before new adds", () => {
    const first = planMultiWan(intent({ mode: "balance" }), snapshot());
    const rules: SnapshotRule[] = first.steps.map((s) => ({ section: s.section, comment: s.tag }));
    const second = planMultiWan(intent({ mode: "failover" }), snapshot({ rules }));
    const lastRemove = second.steps.reduce((acc, s, i) => (s.action === "remove" ? i : acc), -1);
    const firstWrite = second.steps.findIndex((s) => s.action === "add" || s.action === "modify");
    expect(lastRemove).toBeGreaterThanOrEqual(0);
    expect(firstWrite).toBeGreaterThan(lastRemove);
  });
});

describe("PCC safety", () => {
  it("preserves connected networks and keeps inbound replies on their original WAN", () => {
    const plan = planMultiWan(
      intent({ mode: "balance" }),
      snapshot({
        addresses: [
          { iface: "ether1", address: "10.0.0.2/24", dynamic: true },
          { iface: "bridge-lan", address: "192.168.88.1/24", dynamic: false },
        ],
      }),
    );
    const mangle = plan.steps.filter((step) => step.section === "/ip/firewall/mangle");
    expect(
      mangle.some((step) => step.command.includes("dst-address=10.0.0.0/24 action=accept")),
    ).toBe(true);
    expect(
      mangle.some(
        (step) =>
          step.command.includes("in-interface=ether1") &&
          step.command.includes("new-connection-mark=mmagic-fiber-conn"),
      ),
    ).toBe(true);
    expect(
      mangle.some(
        (step) =>
          step.command.includes("chain=output") &&
          step.command.includes("new-routing-mark=mmagic-fiber"),
      ),
    ).toBe(true);
    expect(
      mangle
        .filter((step) => step.command.includes("per-connection-classifier"))
        .every((step) => step.command.includes("connection-mark=no-mark")),
    ).toBe(true);
  });

  it("blocks PCC when an existing FastTrack rule can bypass policy routing", () => {
    const plan = planMultiWan(
      intent({ mode: "balance" }),
      snapshot({
        fastTrackRules: [
          {
            section: "/ip/firewall/filter",
            id: "*1",
            comment: "defconf: fasttrack",
          },
        ],
      }),
    );
    expect(plan.findings.find((finding) => finding.id === "fasttrack-conflict")?.severity).toBe(
      "blocker",
    );
  });

  it("adds a backup WAN inside every policy-routing table", () => {
    const plan = planMultiWan(intent({ mode: "balance" }), snapshot());
    const routes = plan.steps.filter((step) => step.section === "/ip/route");
    expect(
      routes.some(
        (step) =>
          step.command.includes("gateway=8.8.8.8") &&
          step.command.includes("distance=11") &&
          step.command.includes("routing-table=mmagic-fiber"),
      ),
    ).toBe(true);
    expect(
      routes.some(
        (step) =>
          step.command.includes("gateway=1.1.1.1") &&
          step.command.includes("distance=10") &&
          step.command.includes("routing-table=mmagic-starlink"),
      ),
    ).toBe(true);
  });
});

describe("operator input safety", () => {
  it("blocks a one-WAN plan and duplicate WAN interfaces", () => {
    const one = planMultiWan(intent({ links: [intent().links[0]!] }), snapshot());
    expect(one.findings.find((finding) => finding.id === "second-uplink-required")?.severity).toBe(
      "blocker",
    );

    const duplicate = planMultiWan(
      intent({ links: intent().links.map((link) => ({ ...link, iface: "ether1" })) }),
      snapshot(),
    );
    expect(
      duplicate.findings.find((finding) => finding.id === "duplicate-interface-ether1")?.severity,
    ).toBe("blocker");
  });

  it("blocks unmanaged static default routes instead of deleting them", () => {
    const plan = planMultiWan(
      intent({ mode: "failover" }),
      snapshot({
        routes: [{ dst: "0.0.0.0/0", gateway: "10.0.0.1", distance: 1, dynamic: false }],
      }),
    );
    expect(plan.findings.find((finding) => finding.id === "existing-default")?.severity).toBe(
      "blocker",
    );
    expect(
      plan.steps.some((step) => step.command.includes("10.0.0.1") && step.action === "remove"),
    ).toBe(false);
  });
});

describe("apply pipeline", () => {
  it("rolls back to the pre-apply backup when a command fails", async () => {
    const t = new SandboxTransport({
      interfaces: ["ether1", "ether2", "bridge-lan"],
      failOnCommand: /firewall nat/,
    });
    const { outcome } = await applyIntent(t, intent());
    expect(outcome.ok).toBe(false);
    expect(outcome.backup).not.toBeNull();
    expect(outcome.rolledBack).toBe(true);
    const after = await planIntent(t, intent());
    expect(after.plan.summary.skip).toBe(0); // nothing was left behind
  });

  it("refuses an apply when the reviewed dry-run hash is stale", async () => {
    const t = new SandboxTransport({ interfaces: ["ether1", "ether2", "bridge-lan"] });
    const { outcome } = await applyIntent(t, intent(), {
      skipBackup: true,
      reviewedIntentHash: "stale-review",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/changed after review/i);
  });
});
