import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterPhysicalRouters, isVirtualRouter, SANDBOX_REMOVED_MESSAGE } from "@/lib/test-router";
import { visibleNavItems } from "@/lib/nav/modes";

const read = (p: string) => readFileSync(p, "utf8");

describe("virtual sandbox is gone from operator workflows", () => {
  it("treats leftover is_virtual and connection_mode=sandbox rows as virtual", () => {
    expect(isVirtualRouter({ is_virtual: true, connection_mode: "hub" })).toBe(true);
    expect(isVirtualRouter({ is_virtual: false, connection_mode: "sandbox" })).toBe(true);
    expect(isVirtualRouter({ is_virtual: false, connection_mode: "hub" })).toBe(false);
    expect(isVirtualRouter({ connection_mode: "direct" })).toBe(false);
    expect(
      filterPhysicalRouters([
        { id: "a", connection_mode: "hub" },
        { id: "b", is_virtual: true, connection_mode: "sandbox" },
        { id: "c", connection_mode: "sandbox" },
      ]).map((r) => r.id),
    ).toEqual(["a"]);
  });

  it("hides Sandbox from owner navigation and Home / chooser cards", () => {
    expect(visibleNavItems(["primary"]).map((i) => i.to)).not.toContain("/app/test-lab/sandbox");
    expect(read("src/lib/nav/modes.ts")).not.toContain('to: "/app/test-lab/sandbox"');
    expect(read("src/components/RemoteAccessChooser.tsx")).not.toContain("/app/test-lab/sandbox");
    expect(read("src/routes/_authenticated/app.index.tsx")).not.toContain("/app/test-lab/sandbox");
    expect(read("src/routes/_authenticated/app.test-lab.index.tsx")).toContain(
      "/app/test-lab/real",
    );
  });

  it("filters leftover virtual rows out of every operator list that feeds Live, Vouchers, Portal, Fleet", () => {
    for (const file of [
      "src/lib/routers.functions.ts",
      "src/lib/portal.functions.ts",
      "src/lib/sites.functions.ts",
      "src/lib/fleet.functions.ts",
      "src/lib/mcp/tools/list-routers.ts",
    ]) {
      expect(read(file), file).toMatch(/filterPhysicalRouters|isVirtualRouter/);
    }
  });

  it("refuses leftover virtual rows instead of serving a fake RouterOS world", () => {
    expect(read("src/lib/router-conn.server.ts")).toContain("SANDBOX_REMOVED_MESSAGE");
    expect(read("src/lib/mikrotik.server.ts")).not.toContain("sandboxFetch");
    expect(read("src/lib/sandbox.functions.ts")).toContain("SANDBOX_REMOVED_MESSAGE");
    expect(read("src/lib/sandbox.functions.ts")).not.toContain("test-lab/sandbox.server");
    expect(SANDBOX_REMOVED_MESSAGE).toMatch(/physical MikroTik/);
  });

  it("pushes voucher plans and portal HTML through loadRouterConn (real board path)", () => {
    const portal = read("src/lib/portal.functions.ts");
    const push = portal.slice(portal.indexOf("export const pushPlansToRouter"));
    expect(push).toContain("loadRouterConn");
    expect(push).toContain("assertNotVirtualRouter");
    expect(push).toContain("ensurePlanProfileOnRouter");
    const profileUpsert = read("src/lib/portal/ensure-plan-profile.server.ts");
    expect(profileUpsert).toContain("routerAPI.addUserProfile");
    expect(profileUpsert).toContain("routerAPI.patchUserProfile");

    const publish = portal.slice(portal.indexOf("export const publishPortalToRouter"));
    expect(publish).toContain("loadRouterConn");
    expect(publish).toContain("executeDeploy");
    expect(publish).toContain("isVirtualRouter");

    const issue = portal.slice(portal.indexOf("export const issuePlanVouchers"));
    expect(issue).toContain("loadRouterConn");
  });
});
