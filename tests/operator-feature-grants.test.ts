import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canOperateFeature,
  GRANTABLE_FEATURES,
  meHasFeature,
  resolveAllowedFeatures,
} from "@/lib/operator-features";
import { canAccessPath, visibleNavItems } from "@/lib/nav/modes";
import { resolveRouteGate } from "@/lib/nav/route-gate";

describe("operator feature resolution", () => {
  it("gives Business Owner every feature", () => {
    expect(
      resolveAllowedFeatures({ roles: ["primary"], userGrants: [], roleDefaults: [] }),
    ).toEqual([...GRANTABLE_FEATURES]);
  });

  it("gives Team Magic Dev every feature without owner role", () => {
    expect(
      resolveAllowedFeatures({
        roles: ["client"],
        userGrants: [],
        roleDefaults: [],
        isPlatformAdmin: true,
      }),
    ).toEqual([...GRANTABLE_FEATURES]);
    expect(meHasFeature({ roles: ["client"], features: [], isPlatformAdmin: true }, "reboot")).toBe(
      true,
    );
  });

  it("gives a plain client vouchers, portal deploy, and own-router setup", () => {
    expect(resolveAllowedFeatures({ roles: ["client"], userGrants: [], roleDefaults: [] })).toEqual(
      ["vouchers", "portal_deploy", "router_config"],
    );
    expect(
      canOperateFeature("vouchers", { roles: ["client"], userGrants: [], roleDefaults: [] }),
    ).toBe(true);
    expect(
      canOperateFeature("portal_deploy", { roles: ["agent"], userGrants: [], roleDefaults: [] }),
    ).toBe(true);
    expect(
      canOperateFeature("reboot", { roles: ["client"], userGrants: [], roleDefaults: [] }),
    ).toBe(false);
  });

  it("blocks expired and pending accounts from every shop-floor feature", () => {
    expect(
      resolveAllowedFeatures({ roles: ["expired"], userGrants: ["vouchers"], roleDefaults: [] }),
    ).toEqual([]);
    expect(
      resolveAllowedFeatures({
        roles: ["client", "expired"],
        userGrants: ["reboot"],
        roleDefaults: [{ role: "client", feature: "poe" }],
      }),
    ).toEqual([]);
    expect(
      canOperateFeature("portal_deploy", { roles: ["pending"], userGrants: [], roleDefaults: [] }),
    ).toBe(false);
  });

  it("merges role defaults and per-user extras without subtracting", () => {
    const allowed = resolveAllowedFeatures({
      roles: ["client"],
      userGrants: ["reboot"],
      roleDefaults: [
        { role: "client", feature: "vouchers" },
        { role: "agent", feature: "poe" },
      ],
    });
    expect(allowed).toEqual(["vouchers", "portal_deploy", "router_config", "reboot"]);
  });

  it("keeps router provisioning separate from reboot permission", () => {
    expect(
      canOperateFeature("router_config", {
        roles: ["client"],
        userGrants: ["reboot"],
        roleDefaults: [],
      }),
    ).toBe(true);
    expect(
      canOperateFeature("router_config", {
        roles: ["client"],
        userGrants: ["router_config"],
        roleDefaults: [],
      }),
    ).toBe(true);
  });

  it("treats getMe features as already resolved for the UI", () => {
    expect(meHasFeature({ roles: ["client"], features: ["cash_sales"] }, "cash_sales")).toBe(true);
    expect(meHasFeature({ roles: ["client"], features: ["cash_sales"] }, "reboot")).toBe(false);
    expect(meHasFeature({ roles: ["primary"], features: [] }, "reboot")).toBe(true);
    expect(meHasFeature({ roles: ["client"], features: ["cash_sales"] }, "vouchers")).toBe(true);
    expect(meHasFeature({ roles: ["client"], features: [] }, "router_config")).toBe(true);
    expect(meHasFeature({ roles: ["client"], features: [] }, "reboot")).toBe(false);
    expect(meHasFeature({ roles: ["client", "expired"], features: ["vouchers"] }, "vouchers")).toBe(
      false,
    );
  });

  it("does not let a grant-table failure crash getMe", () => {
    const src = readFileSync("src/lib/auth.functions.ts", "utf8");
    expect(src).toContain("loadResolvedFeatures");
    expect(src).toMatch(/try \{[\s\S]*loadResolvedFeatures[\s\S]*\} catch/);
  });
});

describe("Payments tab follows cash_sales grant", () => {
  it("stays hidden for an ungranted client", () => {
    expect(visibleNavItems(["client"]).map((i) => i.to)).not.toContain("/app/orders");
    expect(canAccessPath(["client"], "/app/orders")).toBe(false);
    expect(resolveRouteGate(["client"], "/app/orders").allowed).toBe(false);
  });

  it("opens for a client granted cash_sales", () => {
    const features = ["cash_sales"];
    expect(visibleNavItems(["client"], features).map((i) => i.to)).toContain("/app/orders");
    expect(canAccessPath(["client"], "/app/orders", features)).toBe(true);
    expect(resolveRouteGate(["client"], "/app/orders", features).allowed).toBe(true);
  });

  it("does not treat Telegram as a shop-floor grant", () => {
    expect(GRANTABLE_FEATURES).not.toContain("telegram");
    expect(
      resolveAllowedFeatures({
        roles: ["client"],
        userGrants: ["telegram"],
        roleDefaults: [],
      }),
    ).toEqual(["vouchers", "portal_deploy", "router_config"]);
  });

  it("does not unlock Terminal with cash_sales", () => {
    expect(canAccessPath(["client"], "/app/terminal", ["cash_sales"])).toBe(false);
    expect(resolveRouteGate(["client"], "/app/terminal", ["cash_sales"]).allowed).toBe(false);
  });

  it("unlocks privileged tabs for platform admins without owner role", () => {
    expect(visibleNavItems(["client"], [], true).map((i) => i.to)).toContain("/app/terminal");
    expect(canAccessPath(["client"], "/app/users", [], true)).toBe(true);
    expect(resolveRouteGate(["client"], "/app/terminal", [], true).allowed).toBe(true);
  });
});
