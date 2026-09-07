import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_DATA_QUOTA_PLAN_KEYS,
  DEFAULT_DATA_QUOTA_PLANS,
  missingDefaultDataQuotaPlans,
  quotaBytesFromMb,
  quotaOnLoginScript,
} from "@/lib/portal/default-plans";
import { hotspotUserCreateBody, planProfileBody } from "@/lib/portal/plan-profile";
import { hotspotProfileName } from "@/lib/portal/profile-name";

const SQL_PATH = resolve("supabase/migrations/20260818220000_default_data_quota_voucher_plans.sql");

describe("default data-quota voucher plans", () => {
  it("ships 500MB through 10GB as editable defaults", () => {
    expect(DEFAULT_DATA_QUOTA_PLAN_KEYS).toEqual([
      "500mb",
      "1gb",
      "2gb",
      "3gb",
      "5gb",
      "7gb",
      "10gb",
    ]);
    expect(DEFAULT_DATA_QUOTA_PLANS.map((p) => p.data_quota_mb)).toEqual([
      500, 1000, 2000, 3000, 5000, 7000, 10000,
    ]);
    for (const p of DEFAULT_DATA_QUOTA_PLANS) {
      expect(p.duration_minutes).toBeNull();
      expect(p.is_vip).toBe(false);
      expect(p.device_limit).toBe(1);
      expect(p.validity_days).toBe(30);
      expect(p.status).toBe("active");
    }
  });

  it("only fills plan keys the tenant does not already have", () => {
    expect(missingDefaultDataQuotaPlans(["1d", "vip", "1gb"]).map((p) => p.plan_key)).toEqual([
      "500mb",
      "2gb",
      "3gb",
      "5gb",
      "7gb",
      "10gb",
    ]);
    expect(missingDefaultDataQuotaPlans(DEFAULT_DATA_QUOTA_PLAN_KEYS)).toEqual([]);
  });

  it("maps megabytes to RouterOS limit-bytes-total", () => {
    expect(quotaBytesFromMb(500)).toBe(524_288_000);
    expect(quotaBytesFromMb(1000)).toBe(1_048_576_000);
    expect(quotaOnLoginScript(500)).toContain("limit-bytes-total=524288000");
  });

  it("pushes data plans without a session clock and with a byte cap on login", () => {
    const body = planProfileBody({
      plan_key: "1gb",
      duration_minutes: null,
      device_limit: 1,
      rate_limit: "5M/5M",
      data_quota_mb: 1000,
    });
    expect(body.name).toBe(hotspotProfileName("1gb"));
    expect(body["session-timeout"]).toBeUndefined();
    expect(body["rate-limit"]).toBe("5M/5M");
    expect(body["on-login"]).toBe(quotaOnLoginScript(1000));
  });

  it("uses unlimited shared-users when a VIP plan has no device cap", () => {
    const body = planProfileBody({
      plan_key: "vip",
      is_vip: true,
      device_limit: 0,
    });
    expect(body.name).toBe(hotspotProfileName("vip"));
    expect(body["shared-users"]).toBe("unlimited");
    expect(body["session-timeout"]).toBeUndefined();
    expect(body["on-login"]).toBeUndefined();
  });

  it("stamps limit-bytes-total onto issued hotspot users", () => {
    const body = hotspotUserCreateBody({
      name: "ABC12345",
      password: "ABC12345",
      profile: "mm-500mb",
      comment: "mm-plan:500mb",
      dataQuotaMb: 500,
    });
    expect(body["limit-bytes-total"]).toBe("524288000");
    expect(body.profile).toBe("mm-500mb");
  });

  it("keeps SQL seed/backfill in lockstep with the TypeScript catalog", () => {
    const sql = readFileSync(SQL_PATH, "utf8");
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.seed_owner_defaults/);
    expect(sql).toMatch(/FOR r IN/);
    for (const p of DEFAULT_DATA_QUOTA_PLANS) {
      expect(sql).toContain(`'${p.plan_key}'`);
      expect(sql).toContain(`'${p.label}'`);
      expect(sql).toMatch(new RegExp(`'${p.plan_key}'[\\s\\S]{0,80}${p.data_quota_mb}`));
    }
  });

  it("adds the same data-quota profiles to the factory hotspot script", () => {
    const script = readFileSync(resolve("src/data/scripts.ts"), "utf8");
    for (const key of DEFAULT_DATA_QUOTA_PLAN_KEYS) {
      expect(script).toContain(`name=voucher-${key}`);
    }
  });
});
