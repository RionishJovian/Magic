import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("Site + Router workflow", () => {
  it("scopes sites RLS to effective_owner (not global owner role)", () => {
    const mig = read("supabase/migrations/20260820161500_sites_tenant_rls.sql");
    expect(mig).toContain("effective_owner(auth.uid())");
    expect(mig).toContain('"sites tenant select"');
    expect(mig).not.toMatch(/has_role\(auth\.uid\(\),\s*'owner'/);
    expect(read(".lovable/sql/sites-tenant-rls.sql")).toContain("effective_owner(auth.uid())");
  });

  it("listSites and listRouters filter by effective owner (defense in depth)", () => {
    const sites = read("src/lib/sites.functions.ts");
    expect(sites).toMatch(/listSites[\s\S]*effective_owner[\s\S]*\.eq\("owner_id", ownerId\)/);
    expect(sites).toMatch(/listRoutersWithSite[\s\S]*\.eq\("owner_id", ownerId\)/);

    const routers = read("src/lib/routers.functions.ts");
    expect(routers).toMatch(/listRouters[\s\S]*\.eq\("owner_id", ownerId\)/);
  });

  it("validates site ownership on assign; soft-resolves on saveRouter", () => {
    const ownership = read("src/lib/sites-ownership.server.ts");
    expect(ownership).toContain("assertSiteOwnedByTenant");
    expect(ownership).toContain("resolveOwnedSiteId");
    expect(ownership).toContain("SITE_NOT_ON_ACCOUNT");
    expect(ownership).toContain('.eq("owner_id", ownerId)');

    const routers = read("src/lib/routers.functions.ts");
    expect(routers).toContain("resolveOwnedSiteId");
    expect(routers).toContain("site_id: ownedSiteId ?? null");

    const sites = read("src/lib/sites.functions.ts");
    expect(sites).toContain("assertSiteOwnedByTenant");
    expect(sites).toMatch(/assignRouterToSite[\s\S]*assertSiteOwnedByTenant/);
  });

  it("clears foreign/stale site switcher selection when sites load", () => {
    const app = read("src/routes/_authenticated/app.tsx");
    expect(app).toContain("setSelectedSite(null)");
    expect(app).toMatch(/sitesQ\.isSuccess[\s\S]*selectedSite/);
  });

  it("prefills Add router from the site switcher and tests only filtered rows", () => {
    const page = read("src/routes/_authenticated/app.routers.tsx");
    expect(page).toContain("blankForm");
    expect(page).toContain("selectedSite?.id");
    expect(page).toContain("const rows = filtered");
    expect(page).toMatch(/No routers on site/);
  });

  it("clears mm.selectedSite when the selected site is deleted", () => {
    const sites = read("src/routes/_authenticated/app.sites.tsx");
    expect(sites).toContain("setSelectedSite(null)");
    expect(sites).toContain("selected?.id === input.id");
    expect(sites).toContain("Unassigned routers");
  });

  it("returns site_id from deployable + fleet lists and filters Portal / Fleet / Payments", () => {
    expect(read("src/lib/portal.functions.ts")).toMatch(/listDeployableRouters[\s\S]*site_id/);
    expect(read("src/lib/fleet-probe.server.ts")).toContain("site_id?: string | null");
    expect(read("src/lib/fleet.functions.ts")).toContain("site_id");

    expect(read("src/routes/_authenticated/app.portal.tsx")).toContain("visibleRouters");
    expect(read("src/routes/_authenticated/app.fleet.tsx")).toContain("useSelectedSite");
    expect(read("src/routes/_authenticated/app.orders.tsx")).toContain("useSelectedSite");
    expect(read("src/components/PlansPanel.tsx")).toContain("siteRouters");
  });
});
