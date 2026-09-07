import { describe, expect, it } from "vitest";
import {
  applyTenantFilter,
  canReadReceipt,
  canReviewPurchase,
  tenantFilterFor,
  type TenantScope,
} from "@/lib/tenant-scope";
import {
  isPrivileged,
  requireVoucherOperator,
  requirePrivileged,
  VOUCHER_OPERATOR_DENIED,
} from "@/lib/guards.server";
import { describeDb, sql } from "./helpers/db";

const TENANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const staffA: TenantScope = { userId: "staff-a", tenantId: TENANT_A, isPlatformAdmin: false };
const staffB: TenantScope = { userId: "staff-b", tenantId: TENANT_B, isPlatformAdmin: false };
const platform: TenantScope = { userId: "root", tenantId: TENANT_A, isPlatformAdmin: true };

/** Records every `.eq()` a server function adds to a service-role query. */
type Row = Record<string, string>;
function recordingQuery(rows: Row[]) {
  const filters: Array<[string, string]> = [];
  const q = {
    filters,
    eq(column: string, value: string) {
      filters.push([column, value]);
      return q;
    },
    /** What the database would actually return for the recorded filters. */
    result() {
      return rows.filter((r) => filters.every(([c, v]) => r[c] === v));
    },
  };
  return q;
}

describe("Magic Coins ledger is tenant-scoped under the service role", () => {
  const points = [
    { id: "p1", owner_id: TENANT_A, agent_id: "agent-1" },
    { id: "p2", owner_id: TENANT_B, agent_id: "agent-2" },
  ];

  it("shows tenant A staff only tenant A points", () => {
    const q = applyTenantFilter(recordingQuery(points), staffA);
    expect(q.filters).toEqual([["owner_id", TENANT_A]]);
    expect(q.result().map((r) => r.id)).toEqual(["p1"]);
  });

  it("shows tenant B staff only tenant B points", () => {
    const q = applyTenantFilter(recordingQuery(points), staffB);
    expect(q.result().map((r) => r.id)).toEqual(["p2"]);
  });

  it("keeps the platform-administrator exception cross-tenant", () => {
    const q = applyTenantFilter(recordingQuery(points), platform);
    expect(q.filters).toEqual([]);
    expect(q.result()).toHaveLength(2);
    expect(tenantFilterFor(platform)).toBeNull();
  });
});

describe("Tier Pass purchases are tenant-scoped", () => {
  const purchases = [
    { id: "s1", owner_id: TENANT_A, user_id: "buyer-a", status: "pending" },
    { id: "s2", owner_id: TENANT_B, user_id: "buyer-b", status: "pending" },
  ];

  it("lists only the caller's own tenant", () => {
    expect(
      applyTenantFilter(recordingQuery(purchases), staffA)
        .result()
        .map((r) => r.id),
    ).toEqual(["s1"]);
    expect(
      applyTenantFilter(recordingQuery(purchases), staffB)
        .result()
        .map((r) => r.id),
    ).toEqual(["s2"]);
  });

  it("cannot approve or reject another tenant's request", () => {
    // approve/reject claim the row with the same tenant filter, so a
    // cross-tenant purchase_id simply matches no rows.
    const claim = applyTenantFilter(recordingQuery(purchases), staffB).eq("id", "s1");
    expect(claim.result()).toHaveLength(0);
    expect(canReviewPurchase(staffB, { owner_id: TENANT_A })).toBe(false);
    expect(canReviewPurchase(staffA, { owner_id: TENANT_A })).toBe(true);
    expect(canReviewPurchase(platform, { owner_id: TENANT_B })).toBe(true);
  });

  it("guards receipt access: buyer yes, other tenant no", () => {
    const row = { user_id: "buyer-a", owner_id: TENANT_A };
    expect(canReadReceipt({ ...staffA, userId: "buyer-a" }, row)).toBe(true);
    expect(canReadReceipt(staffA, row)).toBe(true);
    expect(canReadReceipt(staffB, row)).toBe(false);
    expect(canReadReceipt({ ...staffB, userId: "buyer-b" }, row)).toBe(false);
    expect(canReadReceipt(platform, row)).toBe(true);
  });
});

/** Minimal Supabase stub: the guards only read `user_roles`. */
function fakeSupabase(roles: string[]) {
  const query = {
    eq: () => query,
    not: () => query,
    limit: () => query,
    maybeSingle: async () => ({ data: null }),
    then: <TResult1 = { data: Array<{ role: string }> }>(
      onfulfilled?:
        ((value: { data: Array<{ role: string }> }) => TResult1 | PromiseLike<TResult1>) | null,
    ) => Promise.resolve({ data: roles.map((role) => ({ role })) }).then(onfulfilled),
  };
  return {
    rpc: async () => ({ data: false, error: null }),
    from: () => ({ select: () => query }),
  } as never;
}

describe("voucher operations are on for every active role", () => {
  it("lets client, agent and other active roles manage vouchers without a Users grant", async () => {
    for (const roles of [["agent"], ["read_only"], ["client"]]) {
      expect(isPrivileged(roles)).toBe(false);
      await expect(requireVoucherOperator(fakeSupabase(roles), "u1")).resolves.toBeUndefined();
    }
  });

  it("still denies an account with no role", async () => {
    await expect(requireVoucherOperator(fakeSupabase([]), "u1")).rejects.toThrow(
      VOUCHER_OPERATOR_DENIED,
    );
  });

  it("blocks pending and expired accounts before voucher checks", async () => {
    await expect(requireVoucherOperator(fakeSupabase(["pending"]), "u1")).rejects.toThrow(
      /not activated yet/i,
    );
    await expect(requireVoucherOperator(fakeSupabase(["expired"]), "u1")).rejects.toThrow(
      /account has expired/i,
    );
    await expect(requireVoucherOperator(fakeSupabase(["client", "expired"]), "u1")).rejects.toThrow(
      /account has expired/i,
    );
  });

  it("allows owner and admin", async () => {
    await expect(requireVoucherOperator(fakeSupabase(["primary"]), "u1")).resolves.toBeUndefined();
    await expect(requireVoucherOperator(fakeSupabase(["primary"]), "u1")).resolves.toBeUndefined();
    await expect(requirePrivileged(fakeSupabase(["primary"]), "u1")).resolves.toBeUndefined();
  });
});

describeDb("database policies match the same boundary", () => {
  it("scopes agent_points, purchases and the purchase audit to the tenant", async () => {
    const out = await sql(
      `select tablename || '|' || policyname || '|' || coalesce(qual,'')
         from pg_policies
        where schemaname = 'public'
          and tablename in ('agent_points','service_purchases','service_purchase_audit')
        order by tablename, policyname`,
    );
    expect(out).toContain("has_tenant_role");
    expect(out).toContain("is_platform_admin");
    // The old unscoped "any owner/admin sees everything" policies are gone.
    expect(out).not.toContain("Owners read all points");
    expect(out).not.toContain("Owners and admins read the purchase audit trail");
  });

  it("lets any non-expired tenant member write voucher plans and codes", async () => {
    const out = await sql(
      `select tablename || '|' || coalesce(with_check,'')
         from pg_policies
        where schemaname = 'public'
          and tablename in ('portal_plans','voucher_codes')
          and cmd = 'ALL'`,
    );
    for (const line of out.split("\n").filter(Boolean)) {
      expect(line).toContain("effective_owner(auth.uid())");
      expect(line).toContain("is_expired");
      expect(line).not.toContain("'owner'::app_role");
    }
  });

  it("stamps a tenant on every existing Magic Coins row", async () => {
    const orphans = await sql(`select count(*) from public.agent_points where owner_id is null`);
    expect(orphans).toBe("0");
  });
});
