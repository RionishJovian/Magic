import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { accountDisplayName } from "@/lib/account-display";

describe("accountDisplayName", () => {
  it("prefers profile display_name over email local part", () => {
    expect(
      accountDisplayName({
        profile: { display_name: "Rionish" },
        email: "rionish@teammagic.io",
      }),
    ).toBe("Rionish");
  });

  it("falls back to email local part", () => {
    expect(accountDisplayName({ profile: null, email: "ops@cafe.com" })).toBe("ops");
  });
});

describe("Dev badge in app chrome", () => {
  const shell = readFileSync("src/routes/_authenticated/app.tsx", "utf8");
  const greeting = readFileSync("src/components/DashboardGreeting.tsx", "utf8");
  const home = readFileSync("src/routes/_authenticated/app.index.tsx", "utf8");

  it("shows Dev badge only for platform_admins (Developers), not tenant Owners", () => {
    expect(shell).toContain("isPlatformAdmin ? <DevBadge /> : null");
    expect(shell).not.toContain('roles?.includes("primary") && <DevBadge');
    expect(home).toContain("showDevBadge = me.data?.isPlatformAdmin");
  });

  it("shows Dev badge next to the home greeting display name", () => {
    expect(greeting).toContain("showDevBadge");
    expect(greeting).toContain("<DevBadge />");
  });

  it("defines dev-badge glow animation", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toContain(".dev-badge");
    expect(css).toContain("@keyframes dev-badge-glow");
  });
});
