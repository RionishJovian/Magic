import { describe, expect, it } from "vitest";
import { hasPositiveRouterUptime, voucherHasBeenUsed } from "@/lib/voucher-activation";

describe("voucher first-use detection", () => {
  it.each(["", "0", "0s", "none", "never", "00:00:00", "0:00:00"])(
    "does not treat zero uptime %j as usage",
    (uptime) => {
      expect(hasPositiveRouterUptime(uptime)).toBe(false);
      expect(voucherHasBeenUsed({ user: { uptime } })).toBe(false);
    },
  );

  it.each(["00:00:01", "1m", "2h3m", "1d00:00:00"])(
    "recognizes positive uptime %j",
    (uptime) => expect(hasPositiveRouterUptime(uptime)).toBe(true),
  );

  it("still recognizes an active session or positive byte counter", () => {
    expect(voucherHasBeenUsed({ active: { user: "VCH-1" } })).toBe(true);
    expect(voucherHasBeenUsed({ user: { "bytes-in": "1", uptime: "0s" } })).toBe(true);
  });
});
