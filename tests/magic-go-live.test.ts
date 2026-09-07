import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildMagicStep, scoreMagicSteps, MAGIC_STEP_IDS } from "@/lib/magic-go-live";

const read = (p: string) => readFileSync(p, "utf8");

describe("Magic go-live path", () => {
  it("scores ordered steps and picks the next incomplete one", () => {
    const steps = MAGIC_STEP_IDS.map((id, i) =>
      buildMagicStep(id, i < 3 ? "done" : i === 3 ? "todo" : "blocked"),
    );
    const scored = scoreMagicSteps(steps);
    expect(scored.doneCount).toBe(3);
    expect(scored.next?.id).toBe("hotspot");
    expect(scored.complete).toBe(false);
  });

  it("exposes getMagicGoLive and mounts the strip on Home + Sites", () => {
    expect(read("src/lib/magic-go-live.functions.ts")).toContain("export const getMagicGoLive");
    expect(read("src/routes/_authenticated/app.index.tsx")).toContain("MagicGoLiveStrip");
    expect(read("src/routes/_authenticated/app.sites.tsx")).toContain("MagicGoLiveStrip");
  });

  it("go-live meta teaches Site → Magic Hub connect → Hotspot on the router card", () => {
    const cafe = read("src/lib/magic-go-live.ts");
    expect(cafe).toContain("Add site");
    expect(cafe).toContain("Magic Hub");
    expect(cafe).not.toContain("Quick Setup");
    expect(cafe.indexOf("site:")).toBeLessThan(cafe.indexOf("hotspot:"));
  });

  it("plan push / issue / portal toasts claim board landing and refresh checklist", () => {
    const plans = read("src/components/PlansPanel.tsx");
    expect(plans).toMatch(/landed on the board|profile\(s\) on the board/);
    expect(plans).toContain('queryKey: ["magic-go-live"]');
    expect(plans).toContain("timezoneWarning");
    expect(plans).toContain("lastPushOutcome");
    expect(plans).toContain("planResults");

    const portal = read("src/routes/_authenticated/app.portal.tsx");
    expect(portal).toContain("Portal published to the board");
    expect(portal).toContain('queryKey: ["magic-go-live"]');
  });

  it("marks plans done only when managed profiles exist on the focus router", () => {
    const fn = read("src/lib/magic-go-live.functions.ts");
    expect(fn).toContain("isManagedVoucherProfile");
    expect(fn).toContain("Add to router");
    expect(fn).not.toMatch(/planCount \?\? 0\) > 0 \? "done"/);
  });
});
