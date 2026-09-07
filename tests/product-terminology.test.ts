import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ACCOUNT_RANKS,
  ROLE_LABEL,
  isBusinessOwner,
  isTenantOwner,
  isTenantUser,
  isTrialAccount,
  resolveAccountRank,
} from "@/lib/product-terminology";
import { isPrivileged } from "@/lib/guards.server";

describe("product terminology", () => {
  const now = Date.parse("2026-08-26T00:00:00.000Z");
  const createdAt = "2026-08-26T00:00:00.000Z";

  it("defines canonical role labels and six account ranks", () => {
    expect(ROLE_LABEL.dev).toBe("Developer");
    expect(ROLE_LABEL.primary).toBe("Primary");
    expect(ROLE_LABEL.user).toBe("User");
    expect(ROLE_LABEL.agent).toBe("MikroMagic Agent");
    expect(ROLE_LABEL.expired).toBe("Expired");
    expect(ROLE_LABEL.trial).toBe("Trial");
    expect(ROLE_LABEL.guest).toBe("Guest");
    expect(ROLE_LABEL).not.toHaveProperty("businessOwner");
    expect(ROLE_LABEL).not.toHaveProperty("admin");
    expect(ACCOUNT_RANKS.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ACCOUNT_RANKS.map((r) => r.key)).toEqual([
      "developer",
      "primary",
      "user",
      "agent",
      "expired",
      "trial",
    ]);
  });

  it("keeps Primary and User as distinct ranks", () => {
    expect(resolveAccountRank({ roles: ["primary"] })).toBe("primary");
    expect(resolveAccountRank({ roles: ["client"], tier: "monthly", expired: false })).toBe("user");
    expect(isTenantOwner(["primary"])).toBe(true);
    expect(isBusinessOwner(["primary"])).toBe(true);
    expect(isTenantOwner(["client"])).toBe(false);
    expect(isTenantUser(["client"])).toBe(true);
    expect(isTenantUser(["primary"])).toBe(false);
  });

  it("resolves Developer, Agent, Expired, and Trial ranks", () => {
    expect(resolveAccountRank({ roles: ["client"], isPlatformAdmin: true })).toBe("developer");
    expect(resolveAccountRank({ roles: ["agent"] })).toBe("agent");
    expect(resolveAccountRank({ roles: ["expired"], expired: true })).toBe("expired");
    expect(
      resolveAccountRank({
        roles: ["client"],
        tier: "trial",
        expired: false,
        never_expires: false,
        created_at: createdAt,
        expires_at: "2026-09-02T00:00:00.000Z",
        now,
      }),
    ).toBe("trial");
    expect(
      isTrialAccount({
        roles: ["client"],
        tier: "trial",
        created_at: createdAt,
        expires_at: "2026-09-02T00:00:00.000Z",
        now,
      }),
    ).toBe(true);
    expect(isTrialAccount({ roles: ["primary"], tier: "trial" })).toBe(false);
  });

  it("treats a client access window longer than seven days as User", () => {
    expect(
      resolveAccountRank({
        roles: ["client"],
        tier: "trial",
        created_at: createdAt,
        expires_at: "2026-09-03T00:00:00.000Z",
        now,
      }),
    ).toBe("user");
  });

  it("treats only primary as privileged tenant role", () => {
    expect(isPrivileged(["primary"])).toBe(true);
    expect(isPrivileged(["admin"])).toBe(false);
    expect(isPrivileged(["client"])).toBe(false);
    expect(isBusinessOwner(["primary"])).toBe(true);
  });

  it("shows Developer on profile for platform admins", () => {
    const profile = readFileSync("src/routes/_authenticated/app.profile.tsx", "utf8");
    const profileFn = readFileSync("src/lib/profile.functions.ts", "utf8");
    expect(profile).toContain("resolveAccountRank");
    expect(profile).toContain("ROLE_LABEL.primary");
    expect(profile).toContain("ROLE_LABEL.user");
    expect(profile).not.toContain("ROLE_LABEL.businessOwner");
    expect(profileFn).toContain("isPlatformAdmin");
  });

  it("removes admin from profile and guards", () => {
    const profile = readFileSync("src/routes/_authenticated/app.profile.tsx", "utf8");
    expect(profile).not.toMatch(/admin:\s*\{/);
    expect(profile).not.toContain('r === "admin"');

    const guards = readFileSync("src/lib/guards.server.ts", "utf8");
    expect(guards).not.toContain('"admin"');
  });
});
