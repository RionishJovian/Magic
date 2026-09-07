import { describe, it, expect } from "vitest";
import { sanitizeFixCommand } from "@/lib/apply-fix";
import { buildDeterministicInsights } from "@/lib/fleet-detectors";
import { estimatePoolSize } from "@/lib/fleet-probe.server";
import { relativeAge } from "@/lib/fleet-health";

describe("sanitizeFixCommand", () => {
  it("allows a single-line interface enable", () => {
    const r = sanitizeFixCommand('/interface enable [find name="ether2"]');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.script).toContain("ether2");
  });
  it("blocks destructive resets", () => {
    expect(sanitizeFixCommand("/system reset-configuration").ok).toBe(false);
    expect(sanitizeFixCommand("/file remove [find]").ok).toBe(false);
    expect(sanitizeFixCommand("a\nb").ok).toBe(false);
  });
});

describe("estimatePoolSize", () => {
  it("counts inclusive IPv4 ranges", () => {
    expect(estimatePoolSize("10.0.0.2-10.0.0.11")).toBe(10);
    expect(estimatePoolSize("")).toBe(0);
  });
});

describe("buildDeterministicInsights", () => {
  it("emits critical unreachable and interface-down with router_id", () => {
    const got = buildDeterministicInsights([
      {
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        name: "HQ",
        online: false,
        error: "timeout",
      },
      {
        id: "11111111-2222-3333-4444-555555555555",
        name: "BR",
        online: true,
        board_name: "RB5009",
        cpu_load: 90,
        interfaces_down: [{ name: "ether3", type: "ether" }],
        dhcp_pools: [{ name: "hs", total: 100, used: 96 }],
      },
    ]);
    expect(got.some((i) => i.title.includes("unreachable"))).toBe(true);
    expect(got.some((i) => i.id.includes("iface-down"))).toBe(true);
    expect(got.some((i) => i.fix_command?.includes("ether3"))).toBe(true);
    expect(got.some((i) => i.title.includes("DHCP"))).toBe(true);
    expect(got.every((i) => i.router_id)).toBe(true);
  });
});

describe("relativeAge", () => {
  it("formats recent ages", () => {
    const now = Date.parse("2026-08-16T12:00:00Z");
    expect(relativeAge(now - 10_000, now)).toBe("just now");
    expect(relativeAge(now - 120_000, now)).toBe("2m");
  });
});
