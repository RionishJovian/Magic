import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveUserRoleOwnerId } from "@/lib/user-role-owner";

const PRIMARY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENT_A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AGENT_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("direct parent account hierarchy", () => {
  it("assigns Primary-created child accounts to the Primary", () => {
    expect(
      resolveUserRoleOwnerId({
        role: "client",
        subjectUserId: USER,
        scope: { tenantId: PRIMARY, isPlatformAdmin: false },
      }),
    ).toBe(PRIMARY);
  });

  it("assigns an Agent-created child account to that Agent", () => {
    expect(
      resolveUserRoleOwnerId({
        role: "client",
        subjectUserId: USER,
        scope: { tenantId: AGENT_A, isPlatformAdmin: false },
      }),
    ).toBe(AGENT_A);
  });

  it("keeps the account hierarchy separate from operational authority", () => {
    const migration = readFileSync(
      "supabase/migrations/20260829150000_direct_parent_account_hierarchy.sql",
      "utf8",
    );
    expect(migration).toContain("role::text IN ('client', 'agent', 'expired', 'pending')");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.effective_owner");
    expect(AGENT_B).not.toBe(AGENT_A);
  });

  it("preserves separate Agent referral attribution", () => {
    const agentCreate = readFileSync("src/lib/agents.functions.ts", "utf8");
    expect(agentCreate).toContain("owner_id: context.userId");
    expect(agentCreate).toContain("account_referrals");
    expect(agentCreate).toContain("agent_id: context.userId");
  });

  it("blocks the retired global tenant consolidation scripts", () => {
    const paths = [".lovable/sql/consolidate-single-cafe-primary-nish.sql"];

    for (const path of paths) {
      const sql = readFileSync(path, "utf8");
      expect(sql).toContain("global tenant consolidation is blocked");
      expect(sql).not.toMatch(/update\s+public\.(user_roles|router_connections|sites)/i);
      expect(sql).not.toMatch(/delete\s+from\s+public\./i);
    }
  });

  it("blocks obsolete account-specific and global ownership repairs", () => {
    const paths = [
      ".lovable/sql/repair-all-cafe-users-from-nish-self-own.sql",
      ".lovable/sql/repair-kyaw-cafe-router-self-own.sql",
      ".lovable/sql/repair-kyaw-ccr2004-access.sql",
      ".lovable/sql/repair-user-role-owner.sql",
      ".lovable/sql/repair-user-role-owner-2-attach.sql",
      ".lovable/sql/fix-trigger-and-restore-kyaw.sql",
      ".lovable/sql/self-own-user-agent-owner-id.sql",
    ];

    for (const path of paths) {
      const sql = readFileSync(path, "utf8");
      expect(sql).toContain("unsafe historical account repair is blocked");
      expect(sql).not.toMatch(/(?:update|delete\s+from|insert\s+into)\s+public\./i);
    }
  });
});
