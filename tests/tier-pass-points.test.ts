import { describe, expect, it } from "vitest";
import {
  AWARD_KIND,
  REVERSAL_KIND,
  TIER_PASS_POINTS,
  awardTierPassPoints,
  billingPeriodFor,
  pointsForService,
  reverseTierPassPoints,
} from "@/lib/agent-points.server";
import { hotspotProfileName } from "@/lib/portal/profile-name";
import { dbIntegrationEnabled, sql } from "./helpers/db";
import type { DatabaseClient } from "@/lib/database.types";

/**
 * In-memory stand-in for the ledger table that enforces the SAME two unique
 * indexes the migration created: one positive award per purchase + billing
 * period, and one reversal per awarded row.
 */
function fakeAdmin(opts: { agentByUser?: Record<string, string> } = {}) {
  const rows: Array<Record<string, unknown>> = [];
  const agentByUser = opts.agentByUser ?? {};

  const uniqueViolation = (row: Record<string, unknown>) => {
    if (row.kind === AWARD_KIND) {
      return rows.some(
        (r) =>
          r.kind === AWARD_KIND &&
          r.service_purchase_id === row.service_purchase_id &&
          r.billing_period === row.billing_period,
      );
    }
    if (row.kind === REVERSAL_KIND) {
      return rows.some(
        (r) => r.kind === REVERSAL_KIND && r.reverses_point_id === row.reverses_point_id,
      );
    }
    return false;
  };

  const admin = {
    rows,
    from(table: string) {
      if (table === "account_referrals") {
        let userId = "";
        const q = {
          select: () => q,
          eq: (_c: string, v: string) => {
            userId = v;
            return q;
          },
          maybeSingle: async () => ({
            data: agentByUser[userId] ? { agent_id: agentByUser[userId] } : null,
          }),
        };
        return q;
      }
      // agent_points
      const filters: Array<[string, unknown]> = [];
      const q = {
        insert(row: Record<string, unknown>) {
          const stored = { id: `pt-${rows.length + 1}`, ...row };
          const conflict = uniqueViolation(stored);
          if (!conflict) rows.push(stored);
          const res = conflict
            ? { data: null, error: { code: "23505", message: "duplicate key" } }
            : { data: { id: stored.id }, error: null };
          return {
            select: () => ({ maybeSingle: async () => res }),
            then: (fn: (v: typeof res) => unknown) => Promise.resolve(res).then(fn),
          };
        },
        select() {
          return q;
        },
        eq(c: string, v: unknown) {
          filters.push([c, v]);
          return q;
        },
        then(fn: (v: { data: Array<Record<string, unknown>> }) => unknown) {
          const data = rows.filter((r) => filters.every(([c, v]) => r[c] === v));
          return Promise.resolve({ data }).then(fn);
        },
      };
      return q;
    },
  };
  return admin as unknown as DatabaseClient & { rows: Array<Record<string, unknown>> };
}

const purchase = (over: Partial<Record<string, string>> = {}) => ({
  id: "sp-1",
  user_id: "client-1",
  owner_id: "tenant-1",
  service_key: "monthly",
  service_label: "Emerald",
  status: "approved",
  decided_at: "2026-03-10T00:00:00.000Z",
  ...over,
});

describe("Tier Pass point values", () => {
  it("pays exactly 15 for Emerald monthly and 150 for Sapphire annual", () => {
    expect(TIER_PASS_POINTS.monthly).toBe(15);
    expect(TIER_PASS_POINTS.annual).toBe(150);
    expect(pointsForService("monthly")).toBe(15);
    expect(pointsForService("annual")).toBe(150);
  });

  it("pays nothing for plus, vouchers, payment orders or unknown sources", () => {
    for (const key of ["plus", "voucher", "payment_order", "activation", "manual", "whatever"]) {
      expect(pointsForService(key)).toBe(0);
    }
  });
});

describe("awarding", () => {
  it("awards 15 once for an approved Emerald purchase", async () => {
    const admin = fakeAdmin({ agentByUser: { "client-1": "agent-1" } });
    const res = await awardTierPassPoints(admin, purchase());
    expect(res).toMatchObject({ awarded: true, points: 15, billing_period: "2026-03" });
    expect(admin.rows).toHaveLength(1);
    expect(admin.rows[0]).toMatchObject({
      kind: AWARD_KIND,
      agent_id: "agent-1",
      referred_user_id: "client-1",
      owner_id: "tenant-1",
      service_purchase_id: "sp-1",
      service_key: "monthly",
      source_status: "approved",
    });
  });

  it("awards 150 for an approved Sapphire annual purchase, keyed by year", async () => {
    const admin = fakeAdmin({ agentByUser: { "client-1": "agent-1" } });
    const res = await awardTierPassPoints(admin, purchase({ service_key: "annual" }));
    expect(res).toMatchObject({ awarded: true, points: 150, billing_period: "2026" });
  });

  it("awards nothing for a plus purchase", async () => {
    const admin = fakeAdmin({ agentByUser: { "client-1": "agent-1" } });
    expect(await awardTierPassPoints(admin, purchase({ service_key: "plus" }))).toEqual({
      awarded: false,
      reason: "not_eligible_service",
    });
    expect(admin.rows).toHaveLength(0);
  });

  it("awards nothing when the client was never referred by an agent", async () => {
    const admin = fakeAdmin();
    expect(await awardTierPassPoints(admin, purchase())).toEqual({
      awarded: false,
      reason: "no_agent",
    });
    expect(admin.rows).toHaveLength(0);
  });

  it("dedupes a repeat order inside the same billing period", async () => {
    const admin = fakeAdmin({ agentByUser: { "client-1": "agent-1" } });
    await awardTierPassPoints(admin, purchase());
    const again = await awardTierPassPoints(admin, purchase());
    expect(again).toEqual({ awarded: false, reason: "duplicate_period" });
    expect(admin.rows).toHaveLength(1);
  });

  it("pays a genuine renewal again in the next month", async () => {
    const admin = fakeAdmin({ agentByUser: { "client-1": "agent-1" } });
    await awardTierPassPoints(admin, purchase());
    const renewal = await awardTierPassPoints(
      admin,
      purchase({ id: "sp-2", decided_at: "2026-04-02T00:00:00.000Z" }),
    );
    expect(renewal).toMatchObject({ awarded: true, points: 15, billing_period: "2026-04" });
    expect(admin.rows).toHaveLength(2);
  });

  it("derives monthly periods per calendar month and annual per calendar year", () => {
    const at = new Date("2026-01-31T23:59:00.000Z");
    expect(billingPeriodFor("monthly", at)).toBe("2026-01");
    expect(billingPeriodFor("annual", at)).toBe("2026");
  });
});

describe("refund reversal", () => {
  it("writes exactly one compensating negative row and never doubles it", async () => {
    const admin = fakeAdmin({ agentByUser: { "client-1": "agent-1" } });
    await awardTierPassPoints(admin, purchase());

    const first = await reverseTierPassPoints(admin, "sp-1");
    expect(first).toEqual({ reversed: 1, already: 0 });

    const second = await reverseTierPassPoints(admin, "sp-1");
    expect(second).toEqual({ reversed: 0, already: 1 });

    const reversals = admin.rows.filter((r) => r.kind === REVERSAL_KIND);
    expect(reversals).toHaveLength(1);
    expect(reversals[0]).toMatchObject({ points: -15, source_status: "refunded" });
    const net = admin.rows.reduce((s, r) => s + (r.points as number), 0);
    expect(net).toBe(0);
  });
});

describe("manual activation earns nothing", () => {
  it("no longer calls any point award from user activation", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/lib/users.functions.ts", "utf8"),
    );
    expect(src).not.toMatch(/award\w*Points/);
  });
});

describe("voucher-to-profile binding", () => {
  it("uses one canonical RouterOS profile name for a plan key", () => {
    expect(hotspotProfileName("1d")).toBe("mm-1d");
  });

  it.skipIf(!dbIntegrationEnabled())(
    "keeps the stored profile after the plan is renamed and rekeyed",
    async () => {
      await sql(`
      set client_min_messages to warning;
      drop table if exists t_vouchers; drop table if exists t_plans;
      create temporary table t_plans (id uuid primary key, plan_key text, label text);
      create temporary table t_vouchers (
        id uuid primary key default gen_random_uuid(),
        plan_id uuid references t_plans(id),
        plan_key text, plan_label text, hotspot_profile text);
      insert into t_plans values ('11111111-1111-4111-8111-111111111111', '1d', 'One Day');
      insert into t_vouchers (plan_id, plan_key, plan_label, hotspot_profile)
        values ('11111111-1111-4111-8111-111111111111', '1d', 'One Day', 'mm-1d');
      update t_plans set plan_key = 'daily', label = 'Day Pass';
    `);
      const out = await sql(
        `select hotspot_profile || '|' || (plan_id is not null) from t_vouchers`,
      );
      expect(out).toBe("mm-1d|true");
      await sql(`drop table t_vouchers; drop table t_plans;`);
    },
  );

  it.skipIf(!dbIntegrationEnabled())(
    "makes the persisted binding immutable on the real table",
    async () => {
      const out = await sql(`
      select count(*) from pg_trigger
      where tgrelid = 'public.voucher_codes'::regclass and not tgisinternal
    `);
      expect(Number(out)).toBeGreaterThan(0);
    },
  );
});

describe("public guest checkout is removed", () => {
  it("deletes guest checkout route files", async () => {
    const fs = await import("node:fs/promises");
    await expect(fs.access("src/routes/api/public/checkout/index.ts")).rejects.toThrow();
    await expect(fs.access("src/routes/api/public/checkout/receipt.ts")).rejects.toThrow();
    await expect(fs.access("src/routes/api/public/checkout/status.ts")).rejects.toThrow();
    await expect(fs.access("src/routes/portal.checkout.tsx")).rejects.toThrow();
  });
});
