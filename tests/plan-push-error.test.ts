import { describe, expect, it } from "vitest";
import { formatVoucherPlanPushError } from "@/lib/portal/plan-push-error";

describe("formatVoucherPlanPushError", () => {
  it("replaces Hotspot apply-trace wording with voucher-plan guidance", () => {
    const msg = formatVoucherPlanPushError(
      new Error(
        "RouterOS API 400: no such command. Update RouterOS 7.1+ if possible. Magical fallback may retry via CLI — open the apply trace for details.",
      ),
    );
    expect(msg).not.toMatch(/apply trace/i);
    expect(msg).toMatch(/Routers → Test/i);
  });
});
