import { describe, expect, it } from "vitest";
import { resolveUserRoleOwnerId } from "@/lib/user-role-owner";

const PRIMARY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DEV = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const USER = "uuuuuuuu-uuuu-4uuu-8uuu-uuuuuuuuuuuu";
const AGENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("resolveUserRoleOwnerId — direct parent Users/Agents", () => {
  it("makes Primary accounts self-owned", () => {
    expect(
      resolveUserRoleOwnerId({
        role: "primary",
        subjectUserId: PRIMARY,
        scope: { tenantId: PRIMARY, isPlatformAdmin: true },
      }),
    ).toBe(PRIMARY);
  });

  it("assigns a Primary-created User to the Primary parent", () => {
    expect(
      resolveUserRoleOwnerId({
        role: "client",
        subjectUserId: USER,
        scope: { tenantId: PRIMARY, isPlatformAdmin: false },
      }),
    ).toBe(PRIMARY);
  });

  it("assigns a Primary-created Agent to the Primary parent", () => {
    expect(
      resolveUserRoleOwnerId({
        role: "agent",
        subjectUserId: AGENT,
        scope: { tenantId: PRIMARY, isPlatformAdmin: false },
      }),
    ).toBe(PRIMARY);
  });

  it("Developer-created Users point to the Developer caller", () => {
    expect(
      resolveUserRoleOwnerId({
        role: "client",
        subjectUserId: USER,
        scope: { tenantId: DEV, isPlatformAdmin: true },
      }),
    ).toBe(DEV);
  });

  it("ignores legacy tenantPrimaryId / existingOwnerId and uses the caller", () => {
    expect(
      resolveUserRoleOwnerId({
        role: "client",
        subjectUserId: USER,
        scope: { tenantId: DEV, isPlatformAdmin: true },
        tenantPrimaryId: PRIMARY,
        existingOwnerId: PRIMARY,
      }),
    ).toBe(DEV);
  });
});
