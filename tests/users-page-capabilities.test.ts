import { describe, expect, it } from "vitest";
import {
  USERS_PAGE_CAPABILITIES,
  usersPageCanAssignPrimaryRole,
  usersPageCanCreatePrimary,
  usersPageCanManageAccount,
  usersPageCoerceView,
  usersPageViews,
} from "@/lib/users-page-capabilities";

const PRIMARY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_PRIMARY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("users page capabilities", () => {
  it("Primary and Developer both see accounts + tenants tabs", () => {
    expect(usersPageViews({ isPrimary: true, isPlatformAdmin: false })).toEqual([
      "accounts",
      "tenants",
    ]);
    expect(usersPageViews({ isPrimary: false, isPlatformAdmin: true })).toEqual([
      "accounts",
      "tenants",
    ]);
    expect(usersPageViews({ isPrimary: true, isPlatformAdmin: true })).toEqual([
      "accounts",
      "tenants",
    ]);
  });

  it("allows Primary to open tenants view", () => {
    expect(usersPageCoerceView({ isPrimary: true, isPlatformAdmin: false }, "tenants")).toBe(
      "tenants",
    );
    expect(usersPageCoerceView({ isPrimary: false, isPlatformAdmin: true }, "tenants")).toBe(
      "tenants",
    );
  });

  it("only Developer can create or assign Primary when none exists", () => {
    expect(usersPageCanCreatePrimary({ isPrimary: true, isPlatformAdmin: false }, 0)).toBe(false);
    expect(usersPageCanCreatePrimary({ isPrimary: false, isPlatformAdmin: true }, 0)).toBe(true);
    expect(usersPageCanCreatePrimary({ isPrimary: false, isPlatformAdmin: true }, 1)).toBe(false);
    expect(
      usersPageCanAssignPrimaryRole({ isPrimary: false, isPlatformAdmin: true }, 1, true),
    ).toBe(true);
  });

  it("Primary cannot manage another Primary account", () => {
    expect(
      usersPageCanManageAccount(
        { isPrimary: true, isPlatformAdmin: false },
        { id: OTHER_PRIMARY, roles: ["primary"] },
        PRIMARY_ID,
      ),
    ).toBe(false);
    expect(
      usersPageCanManageAccount(
        { isPrimary: false, isPlatformAdmin: true },
        { id: OTHER_PRIMARY, roles: ["primary"] },
        PRIMARY_ID,
      ),
    ).toBe(true);
  });

  it("documents self-own, one Primary, and agent Magic Coins referral", () => {
    expect(USERS_PAGE_CAPABILITIES.primary.join(" ")).toMatch(/One Primary/);
    expect(USERS_PAGE_CAPABILITIES.primary.join(" ")).toMatch(/owns itself|own themselves/i);
    expect(USERS_PAGE_CAPABILITIES.primary.join(" ")).toMatch(/café|Application owner/i);
    expect(USERS_PAGE_CAPABILITIES.developer.join(" ")).toMatch(/Magic Coins/);
    expect(USERS_PAGE_CAPABILITIES.developer.join(" ")).toMatch(/does not own a café/i);
    expect(USERS_PAGE_CAPABILITIES.userAgentIsolation.join(" ")).toMatch(
      /own voucher plans|platform defaults/i,
    );
  });
});
