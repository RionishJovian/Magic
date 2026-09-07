import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultRules } from "@/lib/alerts/rules";
import { buildSignals, type RouterProbe } from "@/lib/health.server";

function probe(overrides: Partial<RouterProbe> = {}): RouterProbe {
  return {
    id: "router-1",
    name: "Cafe router",
    siteId: null,
    online: true,
    latencyMs: 20,
    uptimeSeconds: 600,
    cpuUsagePct: 10,
    memoryUsagePct: 20,
    freeMemoryBytes: 800,
    totalMemoryBytes: 1000,
    wanState: "up",
    tunnelState: "none",
    error: null,
    ...overrides,
  };
}

describe("router resource monitoring", () => {
  it("creates CPU and memory signals only from measured threshold breaches", () => {
    const signals = buildSignals(
      [
        {
          subject_kind: "router",
          subject_id: "router-1",
          reachable: true,
          wan_state: "up",
          connector_state: null,
          cpu_usage_pct: 91,
          memory_usage_pct: 94,
          observed_at: "2026-09-08T00:00:00Z",
        },
      ],
      [probe({ cpuUsagePct: 92, memoryUsagePct: 95 })],
      [],
    );

    expect(signals.map((signal) => signal.kind)).toEqual(["router_cpu_high", "router_memory_high"]);
    expect(signals.every((signal) => signal.consecutive === 1)).toBe(true);
  });

  it("keeps healthy or unavailable resource values quiet", () => {
    expect(buildSignals([], [probe()], [])).toHaveLength(0);
    expect(buildSignals([], [probe({ cpuUsagePct: null, memoryUsagePct: null })], [])).toHaveLength(
      0,
    );
  });

  it("enables deduplicated CPU and memory rules with conservative defaults", () => {
    const rules = defaultRules();
    expect(rules.find((rule) => rule.kind === "router_cpu_high")).toMatchObject({
      severity: "critical",
      threshold: 2,
    });
    expect(rules.find((rule) => rule.kind === "router_memory_high")).toMatchObject({
      severity: "warning",
      threshold: 2,
    });
  });

  it("uses real resource reads, cron auth and recommendation-only alerts", () => {
    const probeSource = readFileSync("src/lib/health.server.ts", "utf8");
    const workerSource = readFileSync("src/routes/api/public/hooks/router-health.ts", "utf8");
    const monitoringSource = readFileSync("src/lib/monitoring.server.ts", "utf8");

    expect(probeSource).toContain('"/system/resource"');
    expect(workerSource).toContain("isAuthorizedCronRequest");
    expect(monitoringSource).toContain("VOUCHER_MAINTENANCE_EXCLUDED_ROUTER_IDS");
    expect(monitoringSource).toContain("automatic_action_executed: false");
    expect(`${probeSource}\n${monitoringSource}`).not.toContain("Math.random");
    expect(monitoringSource).not.toContain('routerAPI.raw(conn, "/system/reboot"');
  });
});
