import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("developer tenant read-only view", () => {
  const server = readFileSync("src/lib/developer-tenant-view.functions.ts", "utf8");
  const panel = readFileSync("src/components/DeveloperTenantReadOnlyPanel.tsx", "utf8");

  it("requires a platform administrator and queries the selected owner only", () => {
    expect(server).toContain("requirePlatformAdmin(context)");
    expect(server).toContain('.eq("owner_id", data.tenantId)');
    expect(server).toContain('.eq("id", data.tenantId)');
  });

  it("does not return router credentials, endpoints, or cryptographic material", () => {
    expect(server).not.toContain("password_ciphertext");
    expect(server).not.toContain("tunnel_private_key_ciphertext");
    expect(server).not.toContain("cloud_wg_private_key_ciphertext");
    expect(server).not.toContain('"host"');
    expect(server).not.toContain('"username"');
  });

  it("uses no tenant mutation functions and audits every read-only view", () => {
    expect(server).not.toContain(".insert(");
    expect(server).not.toContain(".update(");
    expect(server).not.toContain(".delete(");
    expect(server).toContain('action: "developer_tenant_viewed"');
    expect(server).toContain("Developer opened read-only tenant configuration");
  });

  it("labels the tenant switcher as read-only and is mounted only in the platform panel", () => {
    expect(panel).toContain("Viewing {snapshot.data.tenant.displayName} — Read-only");
    expect(panel).toContain("does not impersonate the tenant");
    const platform = readFileSync("src/components/PlatformActiveSitesPanel.tsx", "utf8");
    expect(platform).toContain("DeveloperTenantReadOnlyPanel");
  });
});
