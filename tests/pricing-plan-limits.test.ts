import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BASE_DEVICE_QUOTA, quotaFor } from "@/lib/services/entitlements";

describe("Emerald / Sapphire pricing copy", () => {
  it("names the annual card Sapphire and documents base limits", () => {
    const pricing = readFileSync("src/routes/pricing.tsx", "utf8");
    expect(pricing).toMatch(/gem: "Sapphire"/);
    expect(pricing).not.toMatch(/gem: "Sapphire Plus"/);
    expect(pricing).toMatch(/1 router \/ 3 sites \/ 15 optional AP integrations/);
    expect(pricing).not.toMatch(/Plus Tier Pass/);
    expect(pricing).not.toMatch(/Emerald Plus —/);
    expect(pricing).not.toMatch(/Sapphire Plus —/);
  });

  it("keeps the retired add-on out of entitlement quota calculation", () => {
    expect(quotaFor(false)).toEqual(BASE_DEVICE_QUOTA);
    expect(quotaFor(true)).toEqual(BASE_DEVICE_QUOTA);
  });
});
