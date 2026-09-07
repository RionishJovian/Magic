import { describe, expect, it } from "vitest";
import { bucketRevenueEntriesByDay, bucketVoucherRevenueByDay } from "@/lib/revenue-daily";

describe("bucketVoucherRevenueByDay", () => {
  const day = 86_400_000;
  const dayStarts = [0, day, day * 2, day * 3, day * 4, day * 5, day * 6];

  it("sums only Used voucher prices into ascending day buckets", () => {
    const buckets = bucketVoucherRevenueByDay(
      [
        {
          first_seen_at: new Date(day + 1).toISOString(),
          expires_at: new Date(day * 2).toISOString(),
          price_mmk: 1000,
        },
        {
          first_seen_at: new Date(day * 2 + 1).toISOString(),
          expires_at: new Date(day * 3).toISOString(),
          price_mmk: 2500,
        },
        {
          first_seen_at: new Date(day * 2 + 2).toISOString(),
          expires_at: new Date(day * 3 + 2).toISOString(),
          price_mmk: 500,
        },
      ],
      dayStarts,
      day * 7,
    );
    expect(buckets).toEqual([0, 0, 1000, 3000, 0, 0, 0]);
  });

  it("ignores vouchers without first_seen_at", () => {
    const buckets = bucketVoucherRevenueByDay(
      [{ first_seen_at: null, price_mmk: 9000 }],
      dayStarts,
      day * 7,
    );
    expect(buckets).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("ignores active access until it reaches Used status", () => {
    const buckets = bucketVoucherRevenueByDay(
      [
        {
          first_seen_at: new Date(day + 1).toISOString(),
          expires_at: new Date(day * 8).toISOString(),
          price_mmk: 9000,
        },
      ],
      dayStarts,
      day * 7,
    );
    expect(buckets).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("ignores cancelled voucher rows even when they were first used", () => {
    const buckets = bucketVoucherRevenueByDay(
      [
        {
          status: "cancelled",
          first_seen_at: new Date(day + 1).toISOString(),
          price_mmk: 9000,
        },
      ],
      dayStarts,
      day * 7,
    );
    expect(buckets).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
});

describe("bucketRevenueEntriesByDay", () => {
  it("keeps Home's daily chart on the same reconciled stream as Revenue", () => {
    const day = 86_400_000;
    const start = Date.UTC(2026, 7, 20);
    expect(
      bucketRevenueEntriesByDay(
        [
          { at: start + 10, amount: 500 },
          { at: start + day + 10, amount: 1_000 },
          { at: start + day + 20, amount: -250 },
        ],
        [start, start + day],
        start + 2 * day,
      ),
    ).toEqual([500, 750]);
  });
});
