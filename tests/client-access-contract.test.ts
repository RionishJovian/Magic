import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { visibleNavItems } from "@/lib/nav/modes";
import { GATE_FALLBACK, resolveRouteGate } from "@/lib/nav/route-gate";

const CLIENT: readonly string[] = ["client"];

/** The 16 authoritative non-trial client-facing functional features, by URL. */
const CLIENT_FEATURE_PATHS = [
  "/app", // Overview
  "/app/routers",
  "/app/sites",
  "/app/devices",
  "/app/access-points",
  "/app/incidents",
  "/app/fleet",
  "/app/live",
  "/app/vouchers",
  "/app/voucher-layouts",
  "/app/revenue",
  "/app/reseller-operation",
  "/app/portal", // Captive portal
  "/app/syslog",
  "/app/services",
  "/app/profile",
].sort();

/** Help-only surfaces: real pages, but not features. */
const NON_FEATURE_PATHS = ["/app/manual", "/app/magic-dude"];

const OWNER_ONLY_PATHS = [
  "/app/users",
  "/app/tenants",
  "/app/audit",
  "/app/scripts",
  "/app/backups",
  "/app/usage",
  "/app/i18n",
  "/app/terminal",
  "/app/orders",
  "/app/deployments",
  "/app/readiness",
  "/app/test-lab",
  "/app/test-lab/sandbox",
  "/app/test-lab/real",
  "/app/test-lab/mcp",
  "/app/quick-setup",
  "/app/connectors",
];

describe("client visible navigation is exactly the 16 features", () => {
  const visible = visibleNavItems(CLIENT).map((i) => i.to);

  it("exposes the 16 functional features and nothing else", () => {
    const features = visible.filter((p) => !NON_FEATURE_PATHS.includes(p)).sort();
    expect(features).toEqual(CLIENT_FEATURE_PATHS);
    expect(features.length).toBe(16);
  });

  it("shows help while keeping the popup-only Magic Dude page out of navigation", () => {
    expect(visible).toContain("/app/manual");
    expect(visible).not.toContain("/app/magic-dude");
    expect(visible).not.toContain("/app/test-lab/sandbox");
  });
});

describe("route gate — typed URLs are judged like hidden tabs", () => {
  it("blocks every Business Owner-only path for a client and sends them home", () => {
    for (const path of OWNER_ONLY_PATHS) {
      const gate = resolveRouteGate(CLIENT, path);
      expect(gate.allowed, path).toBe(false);
      if (!gate.allowed) expect(gate.redirectTo).toBe(GATE_FALLBACK);
    }
  });

  it("allows a client every router-related route, including nested ids", () => {
    for (const path of ["/app/routers", "/app/routers/abc-123", "/app/fleet"]) {
      expect(resolveRouteGate(CLIENT, path).allowed, path).toBe(true);
    }
  });

  it("blocks Quick setup and Connectors for a client and an agent", () => {
    for (const roles of [CLIENT, ["agent"]]) {
      for (const path of ["/app/quick-setup", "/app/connectors"]) {
        const gate = resolveRouteGate(roles, path);
        expect(gate.allowed, path).toBe(false);
        if (!gate.allowed) expect(gate.redirectTo).toBe(GATE_FALLBACK);
      }
    }
    expect(resolveRouteGate(["primary"], "/app/quick-setup").allowed).toBe(true);
    expect(resolveRouteGate(["primary"], "/app/connectors").allowed).toBe(true);
  });

  it("allows help and the legacy Magic Dude redirect while hiding sandbox", () => {
    expect(resolveRouteGate(CLIENT, "/app/manual").allowed).toBe(true);
    expect(resolveRouteGate(CLIENT, "/app/magic-dude").allowed).toBe(true);
    expect(resolveRouteGate(CLIENT, "/app/easy").allowed).toBe(true);
    expect(resolveRouteGate(CLIENT, "/app/easy/vouchers").allowed).toBe(true);
    expect(resolveRouteGate(CLIENT, "/app/test-lab/sandbox").allowed).toBe(false);
  });

  it("lets Business Owners through their own tools", () => {
    expect(resolveRouteGate(["primary"], "/app/audit").allowed).toBe(true);
    expect(resolveRouteGate(["primary"], "/app/terminal").allowed).toBe(true);
    expect(resolveRouteGate(["primary"], "/app/test-lab").allowed).toBe(true);
  });

  it("never blocks the fallback itself, so redirects cannot loop", () => {
    for (const roles of [["client"], ["expired"], ["pending"], []]) {
      expect(resolveRouteGate(roles, GATE_FALLBACK).allowed).toBe(true);
    }
  });

  it("ignores trailing slashes", () => {
    expect(resolveRouteGate(CLIENT, "/app/users/").allowed).toBe(false);
    expect(resolveRouteGate(CLIENT, "/app/vouchers/").allowed).toBe(true);
  });
});

describe("backend defense — private server functions carry their own guard", () => {
  const files = ["src/lib/terminal-templates.functions.ts", "src/lib/sandbox.functions.ts"];

  it("guards every handler with requirePrivileged", () => {
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      const handlers = src.match(/\.handler\(/g)?.length ?? 0;
      const guards = src.match(/requirePrivileged\(/g)?.length ?? 0;
      expect(handlers, file).toBeGreaterThan(0);
      expect(guards, file).toBe(handlers);
    }
  });

  it("guards terminal history and WebFig launch handlers server-side", () => {
    const history = readFileSync("src/lib/terminal-history.functions.ts", "utf8");
    expect(history.match(/requirePrivileged\(/g)?.length).toBe(2);
    expect(history).toContain("requireWebfigLaunchAccess(context.supabase, context.userId)");

    const webfig = readFileSync("src/lib/webfig.server.ts", "utf8");
    expect(webfig).toContain("getRoles(supabase, userId)");
    expect(webfig).toContain("isPlatformAdminUser(supabase, userId)");
    expect(webfig).toContain('supabase.rpc("has_active_webfig_unlock_key")');
    expect(webfig).toContain("if (!allowed) throw new Error(WEBFIG_LOCKED_REASON)");
  });

  it("keeps the terminal command runner role-checked server-side", () => {
    const src = readFileSync("src/lib/fleet.functions.ts", "utf8");
    const runner = src.slice(src.indexOf("export const runTerminalCommand"));
    expect(runner).toContain("requireSupabaseAuth");
    expect(runner).toContain("getRoles(context.supabase, context.userId)");
    expect(runner).toContain("isPlatformAdminUser(context.supabase, context.userId)");
    expect(runner).toContain("isPrivilegedAccount(roles, isPlatformAdmin)");
    expect(runner).toContain("effectiveOwner(context.supabase, context.userId)");
    expect(runner).toContain("router is outside your tenant");
  });

  it("keeps admin listings tenant-scoped and global backups platform-admin-only", () => {
    const tenants = readFileSync("src/lib/tenants.functions.ts", "utf8");
    expect(tenants).toContain("assertTenantConsoleAccess");
    expect(tenants).toContain("tenantUserIdSet(scope)");
    expect(tenants).toContain("filter((p) => !allowedIds || allowedIds.has(p.id))");
    expect(readFileSync("src/lib/backups.functions.ts", "utf8")).toContain("requirePlatformAdmin");
    expect(readFileSync("src/lib/users.functions.ts", "utf8")).toContain("assertOwner");
    const sites = readFileSync("src/lib/sites.functions.ts", "utf8");
    const platformSites = sites.slice(sites.indexOf("export const listPlatformActiveSites"));
    expect(platformSites).toContain("resolveAdminScope(context)");
    expect(platformSites).toContain("tenantUserIdSet(scope)");
    expect(platformSites).toContain("allowedOwnerIds.has(router.owner_id)");
  });

  it("gates tunnel hub CRUD to platform administrators", () => {
    // Agentless DIY tunnel_hubs CRUD was removed; Magic Hub uses cloud-router.functions.
    expect(() => readFileSync("src/lib/tunnel.functions.ts", "utf8")).toThrow();
    expect(() => readFileSync("src/components/TunnelPanel.tsx", "utf8")).toThrow();
  });

  it("locks tunnel_hubs RLS to is_platform_admin, not tenant owner/admin roles", () => {
    // Historical RLS hardening migration remains; table is dropped by a later migration.
    const migration = readFileSync(
      "supabase/migrations/20260815180000_tunnel_hubs_platform_admin_only.sql",
      "utf8",
    );
    const sql = migration
      .split("\n")
      .filter((line) => !/^\s*--/.test(line))
      .join("\n");
    expect(sql).toContain("is_platform_admin(auth.uid())");
    expect(sql).not.toMatch(/has_role\s*\(/);
    expect(sql).not.toMatch(/has_tenant_role\s*\(/);
    const drop = readFileSync(
      "supabase/migrations/20260816160000_drop_agentless_outbound_tunnel.sql",
      "utf8",
    );
    expect(drop).toContain("DROP TABLE IF EXISTS public.tunnel_hubs");
  });
});

describe("client manual states the 14-feature contract", () => {
  const src = readFileSync("src/routes/_authenticated/app.manual.tsx", "utf8");

  it("no longer claims 22 tools", () => {
    expect(src).not.toContain("22 tools");
  });

  it("says 14 features and excludes help from the count", () => {
    expect(src).toContain("14 features");
    expect(src).toMatch(/not part of the 14 features/);
    expect(src).not.toContain("16 features");
  });

  it("lists Quick setup only for Business Owners", () => {
    expect(src).toMatch(/\{isStaff \? \([\s\S]*t\.label\("Quick setup"\)/);
  });

  it("does not tell clients there are three reach paths", () => {
    expect(src).toContain("You reach your RouterBoard in two ways");
    expect(src).not.toMatch(
      /t\.copy\(\s*"MikroTik Magic is a cloud-hosted web app\. It reaches your RouterBoard in three ways/,
    );
  });

  it("hides Public IP / DDNS setup steps from non-staff", () => {
    expect(src).toMatch(/\{isStaff \? \([\s\S]*Option A — Public IP \/ DDNS/);
    expect(src).toContain('t.label("Option B — Magic Hub")');
    expect(src).toContain('t.label("Option A — Local Connector (no public IP needed)")');
    expect(src).toContain('t.label("Option B — Local Connector (no public IP needed)")');
    expect(src).toContain('t.label("Option C — Magic Hub")');
    // Direct t.label("…") args so i18n:ci extracts both staff and client strings
    expect(src).not.toMatch(/t\.label\(\s*isStaff\s*\?/);
    const pub = src.indexOf('t.label("Option A — Public IP / DDNS")');
    expect(pub).toBeGreaterThan(-1);
    expect(src.lastIndexOf("{isStaff ? (", pub)).toBeGreaterThan(-1);
  });
});

describe("Quick Setup is Business Owner only", () => {
  it("marks the nav tab privilegedOnly with no client feature grant", () => {
    const item = visibleNavItems(["primary"]).find((i) => i.to === "/app/quick-setup");
    expect(item?.privilegedOnly).toBe(true);
    expect(item?.feature).toBeUndefined();
  });

  it("gates probe and rollback handlers with requirePrivileged", () => {
    const src = readFileSync("src/lib/mikrotik.functions.ts", "utf8");
    for (const name of [
      "probeCloudDns",
      "checkPublicReachability",
      "probeWanExposure",
      "executeQuickSetupRollback",
    ]) {
      const start = src.indexOf(`export const ${name}`);
      expect(start, name).toBeGreaterThan(-1);
      const next = src.indexOf("export const ", start + 1);
      const slice = src.slice(start, next === -1 ? start + 2500 : next);
      expect(slice, name).toContain("requirePrivileged");
    }
  });

  it("hides the Cloud Remote chooser card from non-staff", () => {
    const shared = readFileSync("src/lib/connection-methods.ts", "utf8");
    expect(shared).toContain('to: "/app/quick-setup"');
    expect(shared).toMatch(/id: "remote"[\s\S]*?staffOnly: true/);
    const chooser = readFileSync("src/components/RemoteAccessChooser.tsx", "utf8");
    expect(chooser).toContain("connectionMethodsForRole");
  });
});
