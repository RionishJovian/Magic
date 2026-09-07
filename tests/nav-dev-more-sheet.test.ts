import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { navItemsForMode } from "@/lib/nav/modes";

describe("Developer More sheet Advanced nav", () => {
  it("shows Users when isPlatformAdmin is true (even without primary role)", () => {
    const without = navItemsForMode(["client"], "advanced", [], false).map((i) => i.to);
    const withDev = navItemsForMode(["client"], "advanced", [], true).map((i) => i.to);
    expect(without).not.toContain("/app/users");
    expect(withDev).toContain("/app/users");
    expect(withDev).toContain("/app/terminal");
  });

  it("More sheet and bottom nav pass isPlatformAdmin into navItemsForMode", () => {
    const more = readFileSync("src/components/AppMoreSheet.tsx", "utf8");
    const bottom = readFileSync("src/components/AppBottomNav.tsx", "utf8");
    const shell = readFileSync("src/routes/_authenticated/app.tsx", "utf8");
    expect(more).toMatch(
      /navItemsForMode\(\s*roles,\s*activeMode,\s*features,\s*isPlatformAdmin,\s*hasActivePlus,\s*isTrial,/,
    );
    expect(bottom).toContain("isPlatformAdmin={isPlatformAdmin}");
    expect(shell).toContain("isPlatformAdmin={isPlatformAdmin}");
  });
});
