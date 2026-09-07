import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  clientConnectWayCount,
  clientConnectWayTitles,
  clientCoreToolCount,
  landingProductStats,
} from "@/lib/product-claims";
import { visibleNavItems } from "@/lib/nav/modes";

describe("product claims digits match the real product", () => {
  it("derives core tools from the client navigation", () => {
    const visible = visibleNavItems(["client"]).map((i) => i.to);
    const coreTools = visible.filter((p) => p !== "/app/manual" && p !== "/app/magic-dude");
    expect(clientCoreToolCount()).toBe(coreTools.length);
    expect(coreTools.length).toBeGreaterThan(0);
  });

  it("ways to connect = Magic Hub + Local Connector for customers", () => {
    expect(clientConnectWayCount()).toBe(2);
    expect(clientConnectWayTitles()).toEqual(["Magic Hub", "Local Connector"]);
  });

  it("landing stats strip uses those counts — never 22 or 3", () => {
    const stats = landingProductStats();
    expect(stats.find((s) => s.l === "Core tools")?.n).toBe(String(clientCoreToolCount()));
    expect(stats.find((s) => s.l === "Ways to connect")?.n).toBe("2");
    expect(stats.map((s) => s.n)).not.toContain("22");
    expect(stats.map((s) => s.n)).not.toContain("3");
  });

  it("landing page imports landingProductStats (no hard-coded 22 / 3 ways)", () => {
    const src = readFileSync("src/routes/index.tsx", "utf8");
    expect(src).toContain("landingProductStats");
    expect(src).not.toMatch(/n:\s*"22"/);
    expect(src).not.toMatch(/n:\s*"3"/);
    expect(src).not.toContain(
      "Works with a public IP, a Local Connector agent, or a WireGuard tunnel",
    );
    expect(src).toMatch(/Magic Hub \(Cloud Remote/);
    expect(src).toMatch(/Local Connector/);
  });

  it("client Manual intro says two ways; staff intro mentions Public IP honestly", () => {
    const src = readFileSync("src/routes/_authenticated/app.manual.tsx", "utf8");
    expect(src).toContain("You reach your RouterBoard in two ways");
    expect(src).toContain("Owner/admin accounts also get Public IP / DDNS");
    expect(src).not.toMatch(
      /t\.copy\(\s*"MikroTik Magic is a cloud-hosted web app\. It reaches your RouterBoard in three ways/,
    );
  });
});
