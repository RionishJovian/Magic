import { describe, expect, it } from "vitest";
import {
  accountStatus,
  canPerformPrivilegedAction,
  computeActivation,
  offerFor,
  quotaFor,
  serviceCatalog,
  RENEWAL_ALLOWED_PATHS,
  BASE_DEVICE_QUOTA,
} from "@/lib/services/entitlements";
import { visibleNavItems } from "@/lib/nav/modes";

const PROMO = {
  active: true,
  monthly_promo_mmk: 20_000,
  monthly_standard_mmk: 30_000,
  annual_promo_mmk: 200_000,
  annual_standard_mmk: 300_000,
};

const NOW = Date.parse("2026-01-01T00:00:00.000Z");
const DAY = 86_400_000;

const BASE_QUOTA = BASE_DEVICE_QUOTA;

describe("service catalog", () => {
  it("lists only the active Monthly and Annual services", () => {
    expect(serviceCatalog(PROMO).map((o) => o.label)).toEqual(["Monthly", "Annual"]);
  });

  it("follows the promo table for active tiers", () => {
    expect(offerFor(PROMO, "monthly").price_mmk).toBe(20_000);
    expect(offerFor({ ...PROMO, active: false }, "annual").price_mmk).toBe(300_000);
  });

  it("describes Emerald and Sapphire base quota in tier entitlements", () => {
    expect(offerFor(PROMO, "monthly").entitlements.join(" ")).toMatch(
      /1 router, 3 sites and 15 optional AP integrations/,
    );
    expect(offerFor(PROMO, "annual").summary).toMatch(/Sapphire/);
  });
});

describe("expiration gating", () => {
  it("marks a non-owner past its expiry as expired", () => {
    const s = accountStatus({
      roles: ["client"],
      entitlement: { tier: "monthly", tier_expires_at: new Date(NOW - DAY).toISOString() },
      now: NOW,
    });
    expect(s.expired).toBe(true);
    expect(s.remaining_ms).toBe(0);
    expect(canPerformPrivilegedAction(s)).toBe(false);
  });

  it("keeps an in-window account active with a remaining label", () => {
    const s = accountStatus({
      roles: ["client"],
      entitlement: { tier: "annual", tier_expires_at: new Date(NOW + 5 * DAY).toISOString() },
      now: NOW,
    });
    expect(s.expired).toBe(false);
    expect(s.remaining_label).toBe("5 days left");
    expect(canPerformPrivilegedAction(s)).toBe(true);
  });

  it("marks only the original seven-day client window as Trial", () => {
    const createdAt = new Date(NOW).toISOString();
    expect(
      accountStatus({
        roles: ["client"],
        entitlement: { tier: "trial", tier_expires_at: new Date(NOW + 7 * DAY).toISOString() },
        created_at: createdAt,
        now: NOW,
      }).trial,
    ).toBe(true);
    expect(
      accountStatus({
        roles: ["client"],
        entitlement: { tier: "trial", tier_expires_at: new Date(NOW + 8 * DAY).toISOString() },
        created_at: createdAt,
        now: NOW,
      }).trial,
    ).toBe(false);
  });

  it("never expires the owner", () => {
    const s = accountStatus({
      roles: ["primary"],
      entitlement: { tier_expires_at: new Date(NOW - DAY).toISOString() },
      now: NOW,
    });
    expect(s.expired).toBe(false);
    expect(s.never_expires).toBe(true);
    expect(canPerformPrivilegedAction(s)).toBe(true);
  });

  it("still lets an expired account reach profile and Services to renew", () => {
    expect(RENEWAL_ALLOWED_PATHS.has("/app/services")).toBe(true);
    expect(RENEWAL_ALLOWED_PATHS.has("/app/profile")).toBe(true);
    expect(RENEWAL_ALLOWED_PATHS.has("/app/routers")).toBe(false);
  });
});

describe("entitlement activation", () => {
  const trial = { tier: "trial" as const, tier_expires_at: null, plus: false };

  it("monthly adds 30 days from now for a fresh account", () => {
    const a = computeActivation({ service: "monthly", current: trial, now: NOW });
    expect(a.tier).toBe("monthly");
    expect(Date.parse(a.tier_expires_at!)).toBe(NOW + 30 * DAY);
    expect(a.plus).toBe(false);
    expect(a.quota).toEqual(BASE_QUOTA);
  });

  it("annual adds 365 days with the same base quota as Emerald", () => {
    const a = computeActivation({ service: "annual", current: trial, now: NOW });
    expect(a.tier).toBe("annual");
    expect(Date.parse(a.tier_expires_at!)).toBe(NOW + 365 * DAY);
    expect(a.plus).toBe(false);
    expect(a.quota).toEqual(BASE_QUOTA);
  });

  it("renewals extend from the existing expiry, never losing paid days", () => {
    const a = computeActivation({
      service: "monthly",
      current: {
        tier: "monthly",
        tier_expires_at: new Date(NOW + 10 * DAY).toISOString(),
        plus: false,
      },
      now: NOW,
    });
    expect(Date.parse(a.tier_expires_at!)).toBe(NOW + 40 * DAY);
  });

  it("a tier renewal keeps an owner-approved higher allowance", () => {
    const a = computeActivation({
      service: "annual",
      current: { tier: "monthly", tier_expires_at: null, plus: true },
      now: NOW,
      currentQuota: { routers: 2, sites: 10, controllers: 35 },
    });
    expect(a.plus).toBe(false);
    expect(a.quota).toEqual({ routers: 2, sites: 10, controllers: 35 });
  });

  it("base quota is 1 router, 3 sites and 15 APs", () => {
    expect(quotaFor(false)).toEqual(BASE_QUOTA);
  });
});

describe("pending requests do not grant anything", () => {
  it("a pending purchase leaves tier, expiry and quota untouched", () => {
    const before = accountStatus({
      roles: ["client"],
      entitlement: { tier: "trial", tier_expires_at: new Date(NOW + DAY).toISOString() },
      now: NOW,
    });
    const after = accountStatus({
      roles: ["client"],
      entitlement: { tier: "trial", tier_expires_at: new Date(NOW + DAY).toISOString() },
      now: NOW,
    });
    expect(after).toEqual(before);
    expect(after.quota).toEqual(BASE_QUOTA);
    expect(after.plus).toBe(false);
  });
});

describe("Services navigation", () => {
  it("is available to buyers", () => {
    for (const role of ["client", "agent", "primary", "expired"]) {
      const items = visibleNavItems([role]).map((i) => i.to);
      expect(items).toContain("/app/services");
    }
  });

  it("keeps finance back office out of ordinary roles", () => {
    expect(visibleNavItems(["client"]).map((i) => i.to)).not.toContain("/app/orders");
    expect(visibleNavItems(["primary"]).map((i) => i.to)).toContain("/app/orders");
  });
});
