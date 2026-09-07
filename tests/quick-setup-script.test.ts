import { describe, expect, it } from "vitest";
import {
  MAGIC_SETUP_CERT,
  MAGIC_SETUP_FW_COMMENT,
  buildQuickSetupRollbackScript,
  buildQuickSetupScript,
  buildQuickSetupSoftRollbackCommands,
} from "../src/lib/quick-setup-script";

const opts = {
  apiUser: "magic-api",
  apiPassword: "TestPass123!",
  identity: "site-alpha",
  backupTag: "pre-magic-20260815120000",
};

describe("Phase 2 quick-setup script", () => {
  const script = buildQuickSetupScript(opts);

  it("enables Cloud DDNS and waits for dns-name", () => {
    expect(script).toContain("/ip cloud set ddns-enabled=yes update-time=yes");
    expect(script).toContain(":while ($i < 30)");
    expect(script).toContain("Cloud DDNS has no dns-name yet");
    // Clock prep may use a short fixed delay; DDNS still polls with the while loop.
    expect(script).toContain("/system/ntp/client/set enabled=yes");
    expect(script).toContain("/system/ntp/client/servers/add address=pool.ntp.org");
    expect(script).toContain("time-zone-name=Asia/Yangon");
  });

  it("signs a TLS cert with DDNS common-name and waits for private-key", () => {
    expect(script).toContain(`name=${MAGIC_SETUP_CERT}`);
    expect(script).toContain("common-name=$dnsName");
    expect(script).toContain(`private-key=yes`);
    expect(script).toContain("certificate signing did not complete");
    expect(script).not.toContain("common-name=mikrotik-magic");
  });

  it("enables www-ssl on 443 and disables api-ssl (REST is www-ssl)", () => {
    expect(script).toContain(
      `/ip service set www-ssl certificate=${MAGIC_SETUP_CERT} disabled=no port=443 address=""`,
    );
    expect(script).toContain("/ip service set api-ssl disabled=yes");
    expect(script).toContain("/ip service set api disabled=yes");
    expect(script).toContain("/ip service set www disabled=yes");
    expect(script).not.toContain("/ip service set api-ssl disabled=no");
  });

  it("adds an idempotent WAN firewall accept for TCP 443", () => {
    expect(script).toContain(`comment="${MAGIC_SETUP_FW_COMMENT}"`);
    expect(script).toContain("dst-port=443 action=accept place-before=0");
  });

  it("creates the dedicated API user", () => {
    expect(script).toContain(`/user add name="${opts.apiUser}"`);
    expect(script).toContain(`password="${opts.apiPassword}"`);
  });
});

describe("Phase 2 quick-setup rollback", () => {
  it("rsc and soft commands remove firewall, cert, user, and disable www-ssl", () => {
    const rsc = buildQuickSetupRollbackScript({
      apiUser: opts.apiUser,
      backupTag: opts.backupTag,
    });
    const soft = buildQuickSetupSoftRollbackCommands(opts.apiUser);

    for (const body of [rsc, soft]) {
      expect(body).toContain(`comment="${MAGIC_SETUP_FW_COMMENT}"`);
      expect(body).toContain(`/certificate remove [find name="${MAGIC_SETUP_CERT}"]`);
      expect(body).toContain(`/user remove [find name="${opts.apiUser}"]`);
      expect(body).toContain('/ip service set www-ssl address="" disabled=yes');
    }
  });
});
