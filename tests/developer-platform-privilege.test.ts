import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isPrivilegedAccount, hasTenantPrimaryRole } from "@/lib/app-role";
import { isStaffRoles } from "@/lib/connection-methods";
import { visibleNavItems } from "@/lib/nav/modes";
import { ACCOUNT_RANKS, resolveAccountRank } from "@/lib/product-terminology";
import { USERS_PAGE_CAPABILITIES } from "@/lib/users-page-capabilities";

describe("Developer outranks Primary (platform-wide)", () => {
  it("isPrivilegedAccount treats Developer without Primary as privileged", () => {
    expect(isPrivilegedAccount(["client"], true)).toBe(true);
    expect(isPrivilegedAccount(["client"], false)).toBe(false);
    expect(isPrivilegedAccount(["primary"], false)).toBe(true);
    expect(hasTenantPrimaryRole(["client"])).toBe(false);
  });

  it("nav exposes Primary-only tabs and Backups to Developer", () => {
    const items = visibleNavItems(["client"], [], true);
    const paths = items.map((i) => i.to);
    expect(paths).toContain("/app/users");
    expect(paths).toContain("/app/tenants");
    expect(paths).toContain("/app/terminal");
    expect(paths).toContain("/app/backups");
    expect(paths).toContain("/app/agent");
  });

  it("nav hides Backups from Primary-only accounts", () => {
    const items = visibleNavItems(["primary"], [], false);
    expect(items.map((i) => i.to)).not.toContain("/app/backups");
    expect(items.map((i) => i.to)).toContain("/app/users");
  });

  it("staff connection methods include Developer", () => {
    expect(isStaffRoles(["client"], true)).toBe(true);
    expect(isStaffRoles(["client"], false)).toBe(false);
  });

  it("resolveAccountRank puts Developer above Primary", () => {
    expect(resolveAccountRank({ roles: ["primary"], isPlatformAdmin: true })).toBe("developer");
    expect(ACCOUNT_RANKS[0]?.key).toBe("developer");
    expect(ACCOUNT_RANKS[0]?.blurb).toMatch(/above Primary|platform-wide/i);
  });

  it("Users capability copy states Developer is highest / platform-wide", () => {
    expect(USERS_PAGE_CAPABILITIES.developer.join(" ")).toMatch(/Highest rank|above Primary/);
    expect(USERS_PAGE_CAPABILITIES.developer.join(" ")).toMatch(/platform-wide|whole platform/);
  });

  it("UI pages gate privileged tools with isPrivilegedAccount + isPlatformAdmin", () => {
    for (const file of [
      "src/routes/_authenticated/app.scripts.tsx",
      "src/routes/_authenticated/app.terminal.tsx",
      "src/routes/_authenticated/app.audit.tsx",
      "src/routes/_authenticated/app.usage.tsx",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toContain("isPrivilegedAccount");
      expect(src, file).toContain("isPlatformAdmin");
    }
  });

  it("server terminal and remote method accept Developer", () => {
    const fleet = readFileSync("src/lib/fleet.functions.ts", "utf8");
    expect(fleet).toContain("isPrivilegedAccount");
    expect(fleet).toContain("isPlatformAdminUser");
    const routers = readFileSync("src/lib/routers.functions.ts", "utf8");
    expect(routers).toContain("isPrivilegedAccount");
    expect(routers).toMatch(/connectionMethod === ["']remote["']/);
  });
});
