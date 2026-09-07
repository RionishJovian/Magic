import { describe, expect, it } from "vitest";
import {
  evaluateCaptivePortalSecurity,
  generatePreAuthGuardPlan,
  type RouterSnapshot,
} from "@/lib/captive-portal-security.server";

const base = (overrides: Partial<RouterSnapshot> = {}): RouterSnapshot => ({
  firewallFilter: [],
  hotspotProfiles: [{ name: "default", "login-by": "http-chap,http-pap", "use-radius": "no" }],
  hotspotUsers: [],
  bindings: [],
  walledGarden: [],
  dns: [{ "allow-remote-requests": "yes", servers: "1.1.1.1" }],
  ipv6Filter: [],
  ipv6Addresses: [],
  ...overrides,
});

describe("read-only captive portal security health evaluator", () => {
  it("does not call a tagged shield rule protected without semantic evidence", () => {
    const report = evaluateCaptivePortalSecurity(
      base({
        firewallFilter: [
          {
            comment: "mm-login-shield",
            chain: "forward",
            action: "drop",
            protocol: "tcp",
            "dst-port": "853",
            disabled: "false",
          },
        ],
      }),
    );
    expect(report.controls.find((c) => c.key === "shield")?.status).toBe("MITIGATED");
    expect(report.controls.find((c) => c.key === "dns-udp")?.status).toBe("WARNING");
  });

  it("exposes missing IPv6 and UDP 443 evidence instead of hiding it in the score", () => {
    const report = evaluateCaptivePortalSecurity(base());
    expect(report.controls.find((c) => c.key === "ipv6")?.status).toBe("WARNING");
    expect(report.controls.find((c) => c.key === "quic")?.status).toBe("WARNING");
    expect(report.score).toBeLessThan(85);
  });

  it("detects an earlier enabled accept before a matching drop", () => {
    const report = evaluateCaptivePortalSecurity(
      base({
        firewallFilter: [
          {
            chain: "forward",
            action: "accept",
            protocol: "udp",
            "dst-port": "53",
            disabled: "false",
          },
          {
            chain: "forward",
            action: "drop",
            protocol: "udp",
            "dst-port": "53",
            "in-interface-list": "LAN",
            disabled: "false",
          },
        ],
      }),
    );
    expect(report.controls.find((c) => c.key === "dns-udp")?.status).toBe("WARNING");
    expect(report.controls.find((c) => c.key === "dns-udp")?.evidence.join(" ")).toContain(
      "earlier",
    );
  });

  it("returns unverified evidence when a RouterOS read failed", () => {
    const report = evaluateCaptivePortalSecurity({ errors: { firewallFilter: "timeout" } });
    expect(report.controls.find((c) => c.key === "dns-udp")?.status).toBe("UNVERIFIED");
    expect(report.endpointErrors).toContain("timeout");
  });

  it("detects disabled rules, FastTrack, bypass bindings, and broad gardens", () => {
    const plan = generatePreAuthGuardPlan({
      firewallFilter: [
        { chain: "forward", action: "fasttrack-connection", disabled: "false" },
        { chain: "forward", action: "drop", protocol: "udp", "dst-port": "53", disabled: "true" },
      ],
      hotspotProfiles: [{ name: "default" }],
      hotspotServers: [{ name: "hs1", interface: "bridge-guest", profile: "default" }],
      interfaces: [{ name: "bridge-guest" }],
      interfaceLists: [{ name: "GUEST" }],
      interfaceListMembers: [{ list: "GUEST", interface: "bridge-guest" }],
      bindings: [{ type: "bypassed", address: "10.0.0.10", disabled: "false" }],
      walledGarden: [{ action: "allow" }],
      dns: [{ "allow-remote-requests": "no" }],
      dhcpServers: [{ name: "guest" }],
      dhcpNetworks: [{ address: "10.0.0.0/24" }],
      addresses: [{ address: "10.0.0.1/24" }],
      ipv6Filter: [{ chain: "forward", action: "drop", disabled: "false" }],
      ipv6Addresses: [],
      systemResource: [{ version: "7.15" }],
    });
    expect(plan.risks.map((risk) => risk.key)).toEqual(
      expect.arrayContaining(["fasttrack", "bypassed-binding", "broad-garden"]),
    );
    expect(plan.status).toBe("BLOCKED / UNVERIFIED");
  });

  it("blocks plan generation when the HotSpot chain or topology is ambiguous", () => {
    const plan = generatePreAuthGuardPlan(base());
    expect(plan.status).toBe("BLOCKED / UNVERIFIED");
    expect(plan.runnable).toBe(false);
    expect(plan.rules).toHaveLength(0);
  });

  it("keeps IPv4 and IPv6 evidence separate and detects management overlap", () => {
    const plan = generatePreAuthGuardPlan({
      ...base(),
      hotspotServers: [{ name: "hs1", interface: "bridge-guest", profile: "default" }],
      interfaces: [{ name: "bridge-guest" }],
      interfaceLists: [{ name: "GUEST" }, { name: "MGMT" }],
      interfaceListMembers: [
        { list: "GUEST", interface: "bridge-guest" },
        { list: "MGMT", interface: "bridge-guest" },
      ],
      systemResource: [{ version: "7.15" }],
      dhcpServers: [{ name: "guest" }],
      dhcpNetworks: [{ address: "10.0.0.0/24" }],
      addresses: [{ address: "10.0.0.1/24" }],
      ipv6Filter: [],
      ipv6Addresses: [{ address: "2001:db8::1/64" }],
    });
    expect(plan.risks.map((risk) => risk.key)).toEqual(
      expect.arrayContaining(["management-overlap", "ipv6-gap"]),
    );
  });

  it("uses an observed dynamic HotSpot chain but never makes the plan runnable", () => {
    const plan = generatePreAuthGuardPlan({
      ...base(),
      systemResource: [{ version: "7.15" }],
      hotspotServers: [{ name: "hs1", interface: "bridge-guest", profile: "default" }],
      interfaces: [{ name: "bridge-guest" }],
      interfaceLists: [{ name: "GUEST" }],
      interfaceListMembers: [{ list: "GUEST", interface: "bridge-guest" }],
      dhcpServers: [{ name: "guest" }],
      dhcpNetworks: [{ address: "10.0.0.0/24" }],
      addresses: [{ address: "10.0.0.1/24" }],
      ipv6Filter: [{ chain: "forward", action: "drop", disabled: "false" }],
      firewallFilter: [
        { chain: "hs-unauth", dynamic: "true", action: "reject", disabled: "false" },
      ],
    });
    expect(plan.topology.dynamicHotspotChains).toContain("hs-unauth");
    expect(plan.rules.length).toBeGreaterThan(0);
    expect(plan.runnable).toBe(false);
  });

  it("contains no RouterOS mutation verbs in the read-only server function", async () => {
    const source = await import("node:fs").then(({ readFileSync }) =>
      readFileSync("src/lib/captive-portal-security.functions.ts", "utf8"),
    );
    expect(source).not.toMatch(/method:\s*["'](?:PUT|PATCH|DELETE)["']/i);
    expect(source).not.toMatch(/\b(?:add|set|remove|move|enable|disable)\b/i);
  });
});
