import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { chromeForServiceKey } from "@/lib/gem-offer-chrome.data";

const read = (p: string) => readFileSync(p, "utf8");

describe("Services tier cards match Pricing gem look", () => {
  it("maps Monthly and Annual to Emerald/Sapphire chrome", () => {
    expect(chromeForServiceKey("monthly").gem).toBe("Emerald");
    expect(chromeForServiceKey("annual").featured).toBe(true);
  });

  it("Services offer grid uses feature-card + gem icon chrome", () => {
    const page = read("src/routes/_authenticated/app.services.tsx");
    expect(page).toContain("feature-card");
    expect(page).toContain("GemIcon");
    expect(page).toContain("chromeForServiceKey");
    expect(page).toContain("gradient-text");
    expect(page).not.toMatch(/glass-panel flex flex-col rounded-2xl p-5/);
  });

  it("keeps Magic Coins in the same three-column offer grid as the tier passes", () => {
    const page = read("src/routes/_authenticated/app.services.tsx");
    const offerGrid = page.slice(
      page.indexOf('<section className="grid gap-5 lg:grid-cols-3">'),
      page.indexOf("{checkout &&"),
    );
    expect(offerGrid).toContain("MagicCoinPurchaseCard");
    expect(offerGrid).not.toContain("</section>\n\n      <section");
  });
});
