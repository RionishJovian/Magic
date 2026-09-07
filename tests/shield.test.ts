import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Login Bypass Shield server hardening", () => {
  it("uses PUT-first firewall creates with CLI fallback in mikrotik.server", () => {
    const src = readFileSync("src/lib/mikrotik.server.ts", "utf8");
    expect(src).toContain("firewallFilterRuleToCli");
    expect(src).toContain("`${path}/add`");
    expect(src).toContain("/execute");
  });

  it("records partial shield state when LAN list is missing", () => {
    const src = readFileSync("src/lib/shield.functions.ts", "utf8");
    expect(src).toContain("SHIELD_PARTIAL_WARNING");
    expect(src).toContain("shieldPartial");
    const audit = readFileSync("src/lib/quick-config-audit.server.ts", "utf8");
    expect(audit).toContain("login_bypass_shield_changed");
  });

  it("pings the router and surfaces add failures in shield.functions", () => {
    const src = readFileSync("src/lib/shield.functions.ts", "utf8");
    expect(src).toContain("await routerAPI.ping(c)");
    expect(src).toContain("hasInterfaceList");
    expect(src).toContain("lastError instanceof Error");
    expect(src).not.toMatch(/addFirewallFilter\(c, rule\)\.catch/);
  });
});
