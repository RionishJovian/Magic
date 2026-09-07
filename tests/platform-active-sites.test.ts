import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  isRouterConnectionActive,
  PLATFORM_ACTIVE_HANDSHAKE_MS,
} from "../src/lib/platform-active-sites";

describe("isRouterConnectionActive", () => {
  const now = Date.parse("2026-08-21T12:00:00.000Z");

  it("treats cloud_status online as active", () => {
    expect(isRouterConnectionActive({ cloud_status: "online" }, now)).toBe(true);
    expect(isRouterConnectionActive({ cloud_status: "ONLINE" }, now)).toBe(true);
  });

  it("treats fresh handshake as active", () => {
    const hs = new Date(now - PLATFORM_ACTIVE_HANDSHAKE_MS + 1_000).toISOString();
    expect(
      isRouterConnectionActive({ cloud_status: "offline", cloud_last_handshake_at: hs }, now),
    ).toBe(true);
  });

  it("treats fresh last-seen as active", () => {
    const seen = new Date(now - 30_000).toISOString();
    expect(
      isRouterConnectionActive({ cloud_status: "connecting", cloud_last_seen_at: seen }, now),
    ).toBe(true);
  });

  it("rejects stale handshake and offline status", () => {
    const hs = new Date(now - PLATFORM_ACTIVE_HANDSHAKE_MS - 1_000).toISOString();
    expect(
      isRouterConnectionActive(
        { cloud_status: "offline", cloud_last_handshake_at: hs, cloud_last_seen_at: hs },
        now,
      ),
    ).toBe(false);
  });
});

describe("platform active sites access contract", () => {
  it("gates the cross-tenant list behind the Platform Support scope", () => {
    const src = readFileSync("src/lib/sites.functions.ts", "utf8");
    expect(src).toContain("export const listPlatformActiveSites");
    expect(src).toContain("resolveAdminScope");
    expect(src).toContain("tenantUserIdSet");
    // Tenant list must stay owner-scoped — do not broaden listSites.
    const listSites = src.slice(
      src.indexOf("export const listSites"),
      src.indexOf("export const saveSite"),
    );
    expect(listSites).toContain('.eq("owner_id", ownerId)');
    expect(listSites).not.toContain("requirePlatformAdmin");
  });

  it("exposes isPlatformAdmin on getMe without treating café owner as platform", () => {
    const src = readFileSync("src/lib/auth.functions.ts", "utf8");
    expect(src).toContain("isPlatformAdmin");
    expect(src).toContain('from("platform_admins")');
  });

  it("renders the platform panel only for platform admins on Sites", () => {
    const page = readFileSync("src/routes/_authenticated/app.sites.tsx", "utf8");
    expect(page).toContain("PlatformActiveSitesPanel");
    expect(page).toContain("me.data?.isPlatformAdmin");
  });

  it("keeps the platform monitor status-only while reporting total router counts", () => {
    const panel = readFileSync("src/components/PlatformActiveSitesPanel.tsx", "utf8");
    expect(panel).toContain("activeRouterCount");
    expect(panel).toContain("offlineRouterCount");
    expect(panel).toContain("totalRouterCount");
    expect(panel).toContain("Active physical routers · map");
    expect(panel).toContain("activeMapSites");
    expect(panel).toContain("DeveloperRouterSupportConsole");
    expect(panel).not.toContain("password");
  });
});
