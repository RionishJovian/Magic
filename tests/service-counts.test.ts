import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  formatRuleCount,
  formatSyslogToday,
  formatTreeCount,
  formatWgPeers,
} from "@/lib/service-counts";

describe("service count formatters", () => {
  it("prints real zeros and hides failed probes as em-dash", () => {
    expect(formatRuleCount(null)).toBe("—");
    expect(formatRuleCount(0)).toBe("0 rules");
    expect(formatRuleCount(412)).toBe("412 rules");
    expect(formatTreeCount(1)).toBe("1 trees");
    expect(formatSyslogToday(0)).toBe("0 today");
    expect(formatWgPeers(null)).toBe("—");
    expect(formatWgPeers({ total: 0, handshake_ok: 0 })).toBe("0 peers");
    expect(formatWgPeers({ total: 3, handshake_ok: 2 })).toBe("2/3 handshake");
  });
});

describe("Routers and Fleet show the real service strip", () => {
  it("does not hardcode MikroGate slideshow numbers", () => {
    const strip = readFileSync("src/components/ServiceCountsStrip.tsx", "utf8");
    expect(strip).not.toMatch(/412 rules/);
    expect(strip).not.toMatch(/3 hits\/s/);
    expect(strip).not.toMatch(/1\.2k entries/);
    expect(strip).toContain("firewall_rules");
    expect(strip).toContain("syslog_today");
  });

  it("mounts the strip on Fleet cards and Routers live telemetry", () => {
    expect(readFileSync("src/routes/_authenticated/app.fleet.tsx", "utf8")).toContain(
      "ServiceCountsStrip",
    );
    expect(readFileSync("src/components/LiveTelemetryDashboard.tsx", "utf8")).toContain(
      "ServiceCountsStrip",
    );
  });

  it("attaches syslog_today after fleet probes", () => {
    const src = readFileSync("src/lib/fleet.functions.ts", "utf8");
    expect(src).toContain("attachSyslogToday");
    expect(src).toContain("syslog_events");
  });
});
