import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("tenant console access", () => {
  const tenantsFn = readFileSync("src/lib/tenants.functions.ts", "utf8");
  const tenantsUi = readFileSync("src/components/TenantsConsole.tsx", "utf8");
  const caps = readFileSync("src/lib/users-page-capabilities.ts", "utf8");

  it("lets Primary and Developer load tenant overview (scoped for Primary)", () => {
    expect(tenantsFn).toContain("assertTenantConsoleAccess");
    expect(tenantsFn).toContain("resolveAdminScope");
    expect(tenantsFn).toContain("tenantUserIdSet");
    expect(tenantsFn).not.toContain("requirePlatformAdmin");
  });

  it("TenantsConsole opens for Primary, not Developer-only", () => {
    expect(tenantsUi).toContain("canAccess");
    expect(tenantsUi).toContain("isPrimary");
    expect(tenantsUi).not.toMatch(/Tenant console is Developer-only/);
    expect(tenantsUi).not.toContain("enabled: isPlatformAdmin");
  });

  it("Users page exposes Tenants tab to Primary", () => {
    expect(caps).toMatch(
      /isPrimary \|\| actor\.isPlatformAdmin\).*return \["accounts", "tenants"\]/s,
    );
  });
});
