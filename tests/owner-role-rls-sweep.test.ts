import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SWEEP = resolve("supabase/migrations/20260830050000_sweep_owner_app_role_casts.sql");
const LOVABLE = resolve(".lovable/sql/fix-owner-app-role-rls-sweep.sql");
const UPDATED_PASTE_SCRIPTS = [
  ".lovable/sql/go-live-run2-quota-trigger.sql",
  ".lovable/sql/list-features-live-grants.sql",
  ".lovable/sql/operator-feature-grants.sql",
  ".lovable/sql/portal-modes-run1-grants.sql",
  ".lovable/sql/rename-owner-role-to-primary.sql",
  ".lovable/sql/security-run2-definer-grants.sql",
  ".lovable/sql/voucher-portal-deploy-features.sql",
];

describe("owner→primary RLS sweep", () => {
  it("ships a migration that rewrites leftover 'owner'::app_role casts", () => {
    const sql = readFileSync(SWEEP, "utf8");
    expect(sql).toContain("ALTER TYPE public.app_role RENAME VALUE 'owner' TO 'primary'");
    expect(sql).toContain("rewrite_owner_app_role_expr");
    expect(sql).toContain("FROM pg_policies");
    expect(sql).toContain("pg_get_functiondef");
    expect(sql).toContain("'primary'::public.app_role");
    // The migration itself must not CREATE policies that cast the dead label.
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*'owner'::public\.app_role/);
  });

  it("mirrors the same SQL under .lovable/sql for Cloud paste", () => {
    const a = readFileSync(SWEEP, "utf8")
      .replace(/^--.*\n/gm, "")
      .trim();
    const b = readFileSync(LOVABLE, "utf8")
      .replace(/^--.*\n/gm, "")
      .trim();
    // Body after comment headers should match (allow different header comments).
    expect(b.length).toBeGreaterThan(500);
    expect(b).toContain("rewrite_owner_app_role_expr");
    expect(a).toContain("rewrite_owner_app_role_expr");
  });

  it("does not let maintained paste scripts reintroduce the dead enum cast", () => {
    for (const file of UPDATED_PASTE_SCRIPTS) {
      const sql = readFileSync(resolve(file), "utf8");
      expect(sql, file).not.toMatch(/'owner'::(?:public\.)?app_role/);
    }
  });
});
