import { describe, expect, it } from "vitest";
import {
  PRICING_PROMO_FALLBACK,
  applyPromoWindow,
  isPromoWindowLive,
} from "@/lib/pricing.functions";

/** Noon Yangon on a calendar day → stable appDayKey. */
const yangonNoon = (ymd: string) => new Date(`${ymd}T12:00:00+06:30`).getTime();

describe("grand opening promo window", () => {
  it("fallback dates are 23 Aug through 24 Sep 2026 with 30% off prices", () => {
    expect(PRICING_PROMO_FALLBACK.starts_on).toBe("2026-08-23");
    expect(PRICING_PROMO_FALLBACK.ends_on).toBe("2026-09-24");
    expect(PRICING_PROMO_FALLBACK.label).toMatch(/Grand opening/i);
    expect(PRICING_PROMO_FALLBACK.monthly_promo_mmk).toBe(
      Math.round(PRICING_PROMO_FALLBACK.monthly_standard_mmk * 0.7),
    );
    expect(PRICING_PROMO_FALLBACK.annual_promo_mmk).toBe(
      Math.round(PRICING_PROMO_FALLBACK.annual_standard_mmk * 0.7),
    );
  });

  it("is live on opening day and end day (inclusive, Asia/Yangon)", () => {
    const base = { ...PRICING_PROMO_FALLBACK, active: true };
    expect(isPromoWindowLive(base, yangonNoon("2026-08-23"))).toBe(true);
    expect(isPromoWindowLive(base, yangonNoon("2026-09-24"))).toBe(true);
    expect(isPromoWindowLive(base, yangonNoon("2026-09-01"))).toBe(true);
  });

  it("is not live before opening or after end day", () => {
    const base = { ...PRICING_PROMO_FALLBACK, active: true };
    expect(isPromoWindowLive(base, yangonNoon("2026-08-22"))).toBe(false);
    expect(isPromoWindowLive(base, yangonNoon("2026-09-25"))).toBe(false);
  });

  it("respects active kill switch even inside the window", () => {
    const off = { ...PRICING_PROMO_FALLBACK, active: false };
    expect(isPromoWindowLive(off, yangonNoon("2026-08-23"))).toBe(false);
    expect(applyPromoWindow(off, yangonNoon("2026-08-23")).active).toBe(false);
  });

  it("applyPromoWindow clears active outside the window", () => {
    const gated = applyPromoWindow(PRICING_PROMO_FALLBACK, yangonNoon("2026-08-21"));
    expect(gated.active).toBe(false);
    expect(gated.starts_on).toBe("2026-08-23");
  });
});
