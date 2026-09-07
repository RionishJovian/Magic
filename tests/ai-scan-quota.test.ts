import { describe, expect, it } from "vitest";
import {
  DEFAULT_MONTHLY_AI_SCAN_LIMIT,
  PLUS_MONTHLY_AI_SCAN_LIMIT,
  computeAiScanQuota,
} from "@/lib/ai-scan-quota";
import { PRICING_PROMO_FALLBACK } from "@/lib/pricing.functions";
import { appMonthIndex, appStartOfYear } from "@/lib/time";

describe("Sapphire annual pricing", () => {
  it("lists the annual pass at 1,045,000 MMK / year with a 731,500 MMK launch promo", () => {
    expect(PRICING_PROMO_FALLBACK.annual_standard_mmk).toBe(1_045_000);
    expect(PRICING_PROMO_FALLBACK.annual_promo_mmk).toBe(731_500);
    expect(PRICING_PROMO_FALLBACK.starts_on).toBe("2026-08-23");
    expect(PRICING_PROMO_FALLBACK.ends_on).toBe("2026-09-24");
    expect(PRICING_PROMO_FALLBACK.annual_promo_mmk).toBeLessThanOrEqual(
      PRICING_PROMO_FALLBACK.annual_standard_mmk,
    );
  });
});

describe("AI scan quota — Plus carry / annual reset", () => {
  it("keeps a hard monthly cap for standard plans", () => {
    const q = computeAiScanQuota({
      plus: false,
      monthlyGrant: DEFAULT_MONTHLY_AI_SCAN_LIMIT,
      used: 12,
      monthIndex: 8,
    });
    expect(q.carry).toBe(false);
    expect(q.limit).toBe(30);
    expect(q.remaining).toBe(18);
  });

  it("accrues 50 scans per month for Plus and carries unused", () => {
    // August (month 8): 8 × 50 = 400 bank, 37 used → 363 left
    const q = computeAiScanQuota({
      plus: true,
      monthlyGrant: PLUS_MONTHLY_AI_SCAN_LIMIT,
      used: 37,
      monthIndex: 8,
    });
    expect(q.carry).toBe(true);
    expect(q.monthlyGrant).toBe(50);
    expect(q.limit).toBe(400);
    expect(q.remaining).toBe(363);
  });

  it("starts the Plus bank at 50 in January and resets the year window", () => {
    const jan = computeAiScanQuota({
      plus: true,
      monthlyGrant: 50,
      used: 0,
      monthIndex: 1,
    });
    expect(jan.limit).toBe(50);
    expect(jan.remaining).toBe(50);

    const exhausted = computeAiScanQuota({
      plus: true,
      monthlyGrant: 50,
      used: 50,
      monthIndex: 1,
    });
    expect(exhausted.remaining).toBe(0);
  });

  it("caps accrual at twelve months", () => {
    const q = computeAiScanQuota({
      plus: true,
      monthlyGrant: 50,
      used: 0,
      monthIndex: 12,
    });
    expect(q.limit).toBe(600);
  });
});

describe("app year helpers", () => {
  it("anchors the year at 1 January in app time", () => {
    const start = appStartOfYear("2026-08-15T12:00:00.000Z");
    expect(new Date(start).toISOString()).toBe("2025-12-31T17:30:00.000Z");
    expect(appMonthIndex("2026-08-15T12:00:00.000Z")).toBe(8);
  });
});
