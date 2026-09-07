import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveUserRoleOwnerId } from "@/lib/user-role-owner";

const PRIMARY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER = "uuuuuuuu-uuuu-4uuu-8uuu-uuuuuuuuuuuu";

describe("User Management workflow — direct parent + agent referral", () => {
  const agentsFn = readFileSync("src/lib/agents.functions.ts", "utf8");
  const usersFn = readFileSync("src/lib/users.functions.ts", "utf8");
  const owner = readFileSync("src/lib/user-role-owner.ts", "utf8");
  const usersPage = readFileSync("src/routes/_authenticated/app.users.tsx", "utf8");
  const caps = readFileSync("src/lib/users-page-capabilities.ts", "utf8");

  const createSlice = () =>
    agentsFn.slice(
      agentsFn.indexOf("export const agentCreateUser"),
      agentsFn.indexOf("export const listMyReferrals"),
    );

  it("agentCreateUser assigns the Agent as direct parent and tags referral separately", () => {
    const create = createSlice();
    expect(create).toContain("owner_id: context.userId");
    expect(create).toContain("account_referrals");
    expect(create).toContain("agent_id: context.userId");
    expect(create).toMatch(/Magic Coins/);
    expect(create).not.toContain("owner_id: primaryId");
  });

  it("Users create path uses resolveUserRoleOwnerId (direct parent + 7-day trial)", () => {
    expect(usersFn).toContain("resolveUserRoleOwnerId");
    expect(usersFn).toContain("assertSingleCafePrimary");
    expect(usersFn).toMatch(/7 \* 24 \* 60 \* 60 \* 1000/);
  });

  it("product rules document direct parentage, isolated operational data, and agent referral", () => {
    expect(owner).toMatch(/direct parent\/creator/);
    expect(owner).toMatch(/operational tenancy|operational data remains self-scoped/);
    expect(owner).toMatch(/café shop owner|Application owner/i);
    expect(owner).toContain("assertSingleCafePrimary");
    expect(owner).toMatch(/Magic Coins/);
    expect(caps).toMatch(/own themselves|owns itself|self-own/i);
    expect(caps).toMatch(/Magic Coins/);
    expect(caps).toMatch(/café|Application owner/i);
  });

  it("Users UI does not require Attach under Primary for Users/Agents", () => {
    expect(usersPage).not.toContain("Attach under Primary");
    expect(usersPage).not.toContain("tenantPrimaryId");
    expect(usersPage).toContain("canCreatePrimary");
  });

  it("resolveUserRoleOwnerId maps child accounts to the caller's direct parent", () => {
    expect(
      resolveUserRoleOwnerId({
        role: "agent",
        subjectUserId: AGENT,
        scope: { tenantId: PRIMARY, isPlatformAdmin: false },
      }),
    ).toBe(PRIMARY);
    expect(
      resolveUserRoleOwnerId({
        role: "client",
        subjectUserId: USER,
        scope: { tenantId: PRIMARY, isPlatformAdmin: false },
      }),
    ).toBe(PRIMARY);
  });
});
