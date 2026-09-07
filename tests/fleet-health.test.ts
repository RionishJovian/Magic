import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  fleetInsights,
  fleetLiveTotals,
  fleetModeLabel,
  fleetRefreshLabel,
  fmtBytes,
  fmtUptime,
  memoryUsedPercent,
  parseCpuLoad,
  readAlertKeys,
  toBytes,
} from "@/lib/fleet-health";

describe("fmtBytes", () => {
  it("treats missing values as em dash, not zero", () => {
    expect(fmtBytes(undefined)).toBe("—");
    expect(fmtBytes(Number.NaN)).toBe("—");
  });
  it("renders a true zero instead of hiding it", () => {
    expect(fmtBytes(0)).toBe("0 B");
  });
  it("scales", () => {
    expect(fmtBytes(512)).toBe("512 B");
    expect(fmtBytes(2048)).toBe("2.0 KB");
  });
});

describe("parseCpuLoad", () => {
  it("accepts numbers, numeric strings, and percent suffixes", () => {
    expect(parseCpuLoad(12)).toBe(12);
    expect(parseCpuLoad("15")).toBe(15);
    expect(parseCpuLoad("85%")).toBe(85);
  });
  it("rejects junk", () => {
    expect(parseCpuLoad("")).toBeUndefined();
    expect(parseCpuLoad("n/a")).toBeUndefined();
    expect(parseCpuLoad(null)).toBeUndefined();
  });
});

describe("memoryUsedPercent", () => {
  it("computes used percent including a fully used router", () => {
    expect(memoryUsedPercent(1000, 250)).toBe(75);
    expect(memoryUsedPercent(1000, 0)).toBe(100);
  });
  it("does not treat missing free memory as 0% used", () => {
    expect(memoryUsedPercent(1000, undefined)).toBeUndefined();
    expect(memoryUsedPercent(undefined, 10)).toBeUndefined();
  });
});

describe("fmtUptime", () => {
  it("keeps the two most significant RouterOS units", () => {
    expect(fmtUptime("2d10h38m45s")).toBe("2d 10h");
    expect(fmtUptime("5w4d3h")).toBe("5w 4d");
    expect(fmtUptime("38m45s")).toBe("38m 45s");
    expect(fmtUptime("12s")).toBe("12s");
  });
  it("treats missing values as em dash", () => {
    expect(fmtUptime(undefined)).toBe("—");
    expect(fmtUptime("")).toBe("—");
  });
});

describe("fleetRefreshLabel", () => {
  it("does not concatenate Refreshing with health on the idle control", () => {
    expect(fleetRefreshLabel(false)).toBe("Refresh health");
    expect(fleetRefreshLabel(true)).toBe("Refreshing…");
    expect(fleetRefreshLabel(false)).not.toMatch(/Refreshinghealth/);
  });
});

describe("toBytes", () => {
  it("parses RouterOS numeric strings including zero", () => {
    expect(toBytes("0")).toBe(0);
    expect(toBytes("1024")).toBe(1024);
    expect(toBytes("")).toBeUndefined();
  });
});

describe("fleetInsights", () => {
  it("drops malformed rows and keeps valid ones", () => {
    const got = fleetInsights({
      insights: [
        { id: "cpu-high", severity: "warning", title: "CPU", subtitle: "board", router: "CCR" },
        { title: "no id" },
        null,
      ],
    });
    expect(got).toHaveLength(1);
    expect(got[0]?.id).toBe("cpu-high");
  });
  it("returns empty for missing payload", () => {
    expect(fleetInsights(null)).toEqual([]);
    expect(fleetInsights({})).toEqual([]);
  });
});

describe("fleetLiveTotals", () => {
  it("uses RouterOS active-session counts instead of voucher lifecycle state", () => {
    expect(
      fleetLiveTotals([
        { online: true, active_sessions: 34 },
        { online: false, active_sessions: 99 },
        { online: true },
      ]),
    ).toEqual({ online: 2, offline: 1, activeSessions: 133 });
  });
});

describe("fleetModeLabel", () => {
  it("labels Magic Hub distinctly from Public IP / DDNS", () => {
    expect(fleetModeLabel({ connection_mode: "hub" })).toBe("Magic Hub");
    expect(fleetModeLabel({ connection_mode: "cloud" })).toBe("Magic Hub");
    expect(fleetModeLabel({ connection_mode: "sandbox" })).toBe("Sandbox");
    expect(fleetModeLabel({ connector_id: "c1" })).toBe("Local Connector");
    expect(fleetModeLabel({ connection_mode: "direct" })).toBe("Public IP / DDNS");
  });
});

describe("readAlertKeys", () => {
  it("ignores non-array JSON", () => {
    expect(readAlertKeys("{not:true}")).toEqual([]);
    expect(readAlertKeys('{"a":1}')).toEqual([]);
    expect(readAlertKeys('["a","b"]')).toEqual(["a", "b"]);
  });
});

describe("Fleet wiring", () => {
  it("probes through loadRouterConn instead of dialing the stored host", () => {
    const health = readFileSync("src/lib/fleet.functions.ts", "utf8");
    const slice = health.slice(
      health.indexOf("export const getFleetHealth"),
      health.indexOf("export const listFleetScans"),
    );
    expect(slice).toContain("collectFleetSnapshot");
    expect(slice).toContain("loadRouterConn");
    expect(slice).not.toContain("decryptSecret");
    expect(slice).not.toContain("tunnelBases");
    expect(slice).not.toContain("password_ciphertext");
  });

  it("AI scan snapshots reuse the same probe", () => {
    const src = readFileSync("src/lib/fleet-ai.server.ts", "utf8");
    expect(src).toContain("collectFleetSnapshot");
    expect(src).toContain("loadRouterConn");
    expect(src).not.toContain("tunnelBases");
    expect(src).not.toContain("password_ciphertext");
  });

  it("keeps Refresh health idle during the 30s poll and shortens uptime chips", () => {
    const page = readFileSync("src/routes/_authenticated/app.fleet.tsx", "utf8");
    expect(page).toContain("fleetRefreshLabel(manualRefresh)");
    expect(page).toContain("whitespace-nowrap");
    expect(page).toContain("fmtUptime(r.uptime)");
    expect(page).not.toMatch(/disabled=\{health\.isFetching\}/);
    expect(page).not.toMatch(/health\.isFetching \? "Refreshing/);
  });
});
