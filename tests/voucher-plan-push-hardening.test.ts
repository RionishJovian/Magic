import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

describe("voucher plan push hardening", () => {
  it("blocks unusable Hotspot states before writing profiles", () => {
    const portal = read("src/lib/portal.functions.ts");
    expect(portal).toContain("assertHotspotReadyForPlanPush");
    expect(read("src/lib/portal/push-plans-preflight.server.ts")).toContain(
      "assessHotspotGuestReady",
    );
    expect(read("src/lib/portal/push-plans-preflight.server.ts")).toContain(
      'ready.level === "block"',
    );
  });

  it("returns per-plan push results for the Vouchers panel", () => {
    const portal = read("src/lib/portal.functions.ts");
    expect(portal).toContain("PlanPushPlanResult");
    expect(portal).toContain("planResults");
    expect(read("src/components/PlansPanel.tsx")).toContain("lastPushOutcome");
  });
});
