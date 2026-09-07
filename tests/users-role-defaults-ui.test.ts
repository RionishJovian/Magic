import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const route = readFileSync("src/routes/_authenticated/app.users.tsx", "utf8");
const panel = readFileSync("src/components/OperatorFeatureGrantsAdmin.tsx", "utf8");
const featureAuth = readFileSync("src/lib/operator-grants.functions.ts", "utf8");
const portalAuth = readFileSync("src/lib/portal-grants.functions.ts", "utf8");

describe("User Management role-default exposure", () => {
  it("disables global role defaults on the normal User Management page", () => {
    expect(route).toContain(
      "<OperatorFeatureGrantsAdmin users={users.data ?? []} showRoleDefaults={false} />",
    );
    expect(route).not.toContain("Role defaults (platform-wide)");
  });

  it("keeps the global editor guarded for any explicitly enabled surface", () => {
    expect(panel).toContain("showRoleDefaults && isPlatformAdmin");
    expect(panel).toContain("Role defaults (platform-wide)");
    expect(panel).toContain("Per-user extras");
  });

  it("preserves server-side authorization for role-default writes", () => {
    expect(featureAuth).toContain("requirePlatformAdmin");
    expect(portalAuth).toContain("requirePlatformAdmin");
    expect(panel).toContain("setOperatorFeatureUserGrants");
    expect(panel).toContain("setPortalModeUserGrants");
  });
});
