import { describe, expect, it } from "vitest";
import { voucherPlanLabel } from "@/lib/voucher-display";

describe("voucherPlanLabel", () => {
  it("uses the human plan label before the RouterOS profile", () => {
    expect(
      voucherPlanLabel({ plan_label: "WC500", plan_key: "custom-mtb6c83z" }, "mm-custom-mtb6c83z"),
    ).toBe("WC500");
  });

  it("falls back safely when an older ledger row has no label", () => {
    expect(
      voucherPlanLabel({ plan_label: "  ", plan_key: "custom-mtb6c83z" }, "mm-technical"),
    ).toBe("custom-mtb6c83z");
    expect(voucherPlanLabel({}, null)).toBe("—");
  });
});
