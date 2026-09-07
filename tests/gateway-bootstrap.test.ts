import { describe, expect, it } from "vitest";
import { planGatewayBootstrap, confirmApply } from "@/lib/gateway-bootstrap/planner";
import { applyGatewayBootstrap } from "@/lib/gateway-bootstrap/engine.server";
import type {
  BootstrapSnapshot,
  BootstrapTransport,
  GatewayBootstrapIntent,
} from "@/lib/gateway-bootstrap/types";
import { capabilitiesFor, parseOsVersion } from "@/lib/provisioning/multi-wan";
const intent: GatewayBootstrapIntent = {
  kind: "gateway-bootstrap",
  routerId: "00000000-0000-4000-8000-000000000001",
  wanInterface: "ether1",
  strategy: "existing-bridge",
  bridge: "bridge-guest",
  gatewayCidr: "10.5.50.1/24",
  dhcpRange: "10.5.50.10-10.5.50.254",
  guestPorts: ["ether2"],
  dnsServers: [],
};
const snap = (over: Partial<BootstrapSnapshot> = {}): BootstrapSnapshot => ({
  routerId: intent.routerId,
  identity: "test",
  boardName: "test",
  version: parseOsVersion("7.14"),
  capabilities: capabilitiesFor(parseOsVersion("7.14")),
  interfaces: [
    { name: "ether1", type: "ether", running: true },
    { name: "ether2", type: "ether", running: true },
    { name: "bridge-guest", type: "bridge", running: true },
  ],
  bridges: ["bridge-guest"],
  bridgePorts: [],
  vlans: [],
  addresses: [{ iface: "ether1", address: "192.0.2.2/24", dynamic: true }],
  routes: [{ dst: "0.0.0.0/0", gateway: "192.0.2.1", dynamic: true }],
  dhcpClients: [{ iface: "ether1" }],
  dhcpServers: [],
  dhcpNetworks: [],
  pools: [],
  natRules: [],
  rules: [],
  sandbox: true,
  takenAt: "1970-01-01T00:00:00Z",
  ...over,
});
describe("Gateway Bootstrap", () => {
  it("rejects guest/WAN overlap and bridged guest ports", () => {
    expect(planGatewayBootstrap({ ...intent, gatewayCidr: "192.0.2.1/24" }, snap()).blocked).toBe(
      true,
    );
    expect(
      planGatewayBootstrap(
        intent,
        snap({ bridgePorts: [{ bridge: "bridge-lan", iface: "ether2", dynamic: false }] }),
      ).blocked,
    ).toBe(true);
  });
  it("requires exact APPLY and creates tagged-only steps", () => {
    expect(confirmApply("apply")).toBe(false);
    expect(confirmApply("APPLY")).toBe(true);
    const p = planGatewayBootstrap(intent, snap());
    expect(
      p.steps
        .filter((s) => s.action === "add")
        .every((s) => s.tag.startsWith("mmagic:gateway-bootstrap:")),
    ).toBe(true);
  });
  it("is a no-op when all tagged objects already exist", () => {
    const first = planGatewayBootstrap(intent, snap());
    const rules = first.steps.map((s) => ({
      section: s.section,
      id: s.id,
      comment: s.tag,
      detail: "",
    }));
    expect(planGatewayBootstrap(intent, snap({ rules })).noop).toBe(true);
  });
  it("blocks a plan when RouterOS discovery is incomplete", () => {
    const plan = planGatewayBootstrap(intent, snap({ discoveryFailures: ["/interface/bridge"] }));
    expect(plan.blocked).toBe(true);
    expect(plan.findings).toContainEqual(
      expect.objectContaining({ id: "discovery-incomplete", severity: "blocker" }),
    );
  });

  it("refuses a changed intent before backup or writes", async () => {
    let backups = 0;
    let writes = 0;
    const transport: BootstrapTransport = {
      name: "sandbox",
      discover: async () => snap(),
      backup: async () => {
        backups++;
        return { id: "backup", name: "backup" };
      },
      run: async () => {
        writes++;
        return [];
      },
      verify: async () => ({ ok: true, checks: [] }),
      rollback: async () => ({ ok: true, removed: 0 }),
    };
    const result = await applyGatewayBootstrap(transport, {
      ...intent,
      reviewedIntentHash: "stale",
    });
    expect(result.outcome.ok).toBe(false);
    expect(result.outcome.error).toMatch(/changed after review/i);
    expect(backups).toBe(0);
    expect(writes).toBe(0);
  });

  it("applies when the reviewed hash matches the current intent", async () => {
    let backups = 0;
    let writes = 0;
    const reviewedIntentHash = planGatewayBootstrap(intent, snap()).intentHash;
    const transport: BootstrapTransport = {
      name: "sandbox",
      discover: async () => snap(),
      backup: async () => {
        backups++;
        return { id: "backup", name: "backup" };
      },
      run: async (_routerId, commands) => {
        writes += commands.length;
        return commands.map((command) => ({ ok: true, command }));
      },
      verify: async () => ({ ok: true, checks: [] }),
      rollback: async () => ({ ok: true, removed: 0 }),
    };
    const result = await applyGatewayBootstrap(transport, { ...intent, reviewedIntentHash });
    expect(result.outcome.ok).toBe(true);
    expect(backups).toBe(1);
    expect(writes).toBeGreaterThan(0);
  });
});
