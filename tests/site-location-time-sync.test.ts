import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  isPlausibleTimezone,
  resolveRouterTimezone,
  routerosClockPrepSnippet,
  ROUTER_NTP_SERVERS,
} from "@/lib/router-clock";
import { APP_TIMEZONE } from "@/lib/time";
import { buildCloudRouterScript, type CloudPeer } from "@/lib/cloud-vps.server";
import { buildQuickSetupScript } from "@/lib/quick-setup-script";

const read = (p: string) => readFileSync(p, "utf8");

const peer: CloudPeer = {
  peerId: "peer_test",
  address: "10.77.0.5/32",
  publicKey: "TEST_ROUTER_PUBLIC_KEY",
  privateKey: "TEST_PRIVATE_KEY",
  serverPublicKey: "TEST_HUB_PUBLIC_KEY",
  endpoint: "hub.mikromagic.app:51820",
  allowedIps: "10.77.0.1/32",
};

describe("router clock helpers", () => {
  it("validates IANA-ish site timezones but always resolves to Asia/Yangon for routers", () => {
    expect(isPlausibleTimezone("Asia/Yangon")).toBe(true);
    expect(isPlausibleTimezone("Africa/Nairobi")).toBe(true);
    expect(isPlausibleTimezone("UTC")).toBe(false);
    expect(isPlausibleTimezone("not a zone")).toBe(false);
    expect(resolveRouterTimezone(null)).toBe(APP_TIMEZONE);
    expect(resolveRouterTimezone("Asia/Bangkok")).toBe(APP_TIMEZONE);
    expect(resolveRouterTimezone("Africa/Nairobi")).toBe(APP_TIMEZONE);
  });

  it("emits NTP + timezone before any caller signs certs", () => {
    const snip = routerosClockPrepSnippet({ waitSeconds: 8 });
    expect(snip).toContain("Clock prep");
    for (const server of ROUTER_NTP_SERVERS.split(",")) expect(snip).toContain(server);
    expect(snip).toContain(`time-zone-name=${APP_TIMEZONE}`);
    expect(snip.indexOf("ntp client")).toBeLessThan(snip.indexOf("time-zone-name"));
  });
});

describe("Site location + Router time sync workflow", () => {
  it("Magic Hub paste enables NTP and sets Yangon before signing magic-https", () => {
    const script = buildCloudRouterScript({
      routerName: "site-a",
      peer,
      restPort: 443,
      env: {},
    });
    const ntpAt = script.indexOf("/system/ntp/client");
    const certAt = script.indexOf("/certificate sign magic-https");
    expect(ntpAt).toBeGreaterThan(-1);
    expect(certAt).toBeGreaterThan(ntpAt);
    expect(script).toContain("time-zone-name=Asia/Yangon");
    expect(script).toContain("Clock prep");
  });

  it("Quick Setup enables NTP before certificate sign", () => {
    const script = buildQuickSetupScript({
      apiUser: "magic-api",
      apiPassword: "TestPass123!",
      identity: "site-alpha",
      backupTag: "pre-magic-20260815120000",
    });
    const ntpAt = script.indexOf("/system/ntp/client");
    const certAt = script.indexOf("/certificate sign");
    expect(ntpAt).toBeGreaterThan(-1);
    expect(certAt).toBeGreaterThan(ntpAt);
    expect(script).toContain("time-zone-name=Asia/Yangon");
  });

  it("plan push enables NTP + Asia/Yangon via ensureRouterClockAligned", () => {
    const portal = read("src/lib/portal.functions.ts");
    const push = portal.slice(portal.indexOf("export const pushPlansToRouter"));
    expect(push).toContain("ensureRouterClockAligned");
    expect(push).toContain("timezoneWarning");
    expect(push).not.toContain("resolveRouterTimezone");
    expect(read("src/lib/router-clock.ts")).toContain("ensureRouterClockAligned");
    expect(read("src/lib/router-clock.ts")).toContain(ROUTER_NTP_SERVERS);
  });

  it("Quick Config exposes only verified protections and keeps QoS explicit", () => {
    const panel = read("src/components/QuickConfigPanel.tsx");
    const protectionBlock = panel.match(
      /PROTECTION_FEATURE_ORDER[\s\S]*?] as const satisfies readonly QuickConfigFeature\[\];/,
    )?.[0];
    expect(protectionBlock).toContain('"ntpSync"');
    expect(protectionBlock).toContain('"clientIsolation"');
    expect(protectionBlock).toContain('"wanInputGuard"');
    expect(protectionBlock).toContain('"loginFloodGuard"');
    expect(protectionBlock?.indexOf('"ntpSync"')).toBeLessThan(
      protectionBlock?.indexOf('"clientIsolation"') ?? 0,
    );
    expect(protectionBlock?.indexOf('"clientIsolation"')).toBeLessThan(
      protectionBlock?.indexOf('"wanInputGuard"') ?? 0,
    );
    expect(protectionBlock?.indexOf('"wanInputGuard"')).toBeLessThan(
      protectionBlock?.indexOf('"loginFloodGuard"') ?? 0,
    );
    expect(panel).toContain("orderedFeatureDefs(features, PROTECTION_FEATURE_ORDER)");
    expect(panel).toContain("FairShareQosSetup");
    expect(panel).toContain("Auto Daily Backup is disabled");
    expect(panel).toContain("voucher-code login");
  });

  it("Quick Config NTP sets timezone and honest copy (TLS/schedules, not voucher expiry)", () => {
    expect(read("src/lib/quick-config.server.ts")).toContain("time-zone-name");
    expect(read("src/lib/quick-config.server.ts")).toContain("resolveRouterTimezone");
    const panel = read("src/components/QuickConfigPanel.tsx");
    expect(panel).toMatch(/TLS certificates/);
    expect(panel).toMatch(/relative/);
    expect(panel).toMatch(/UTC\+06:30/);
    expect(panel).not.toMatch(/correct voucher expiry/);
  });

  it("Sites UI documents Asia/Yangon lock for attached routers", () => {
    const sites = read("src/routes/_authenticated/app.sites.tsx");
    expect(sites).toContain("Cancel edit");
    expect(sites).toContain("Save changes");
    expect(sites).toMatch(/Asia\/Yangon/);
    expect(sites).toMatch(/UTC\+06:30/);
  });

  it("portal deploy scopes POS entries to the selected routers' sites", () => {
    const portal = read("src/lib/portal.functions.ts");
    expect(portal).toContain("siteIds");
    expect(portal).toMatch(/themeFromSettings\([\s\S]*opts/);
    expect(portal).toContain('.in("id", preferred)');
  });

  it("Master hotspot script defaults to Asia/Yangon like the app clock", () => {
    const scripts = read("src/data/scripts.ts");
    expect(scripts).toContain("time-zone-name=Asia/Yangon");
    expect(scripts).not.toContain("time-zone-name=Africa/Nairobi");
  });
});
