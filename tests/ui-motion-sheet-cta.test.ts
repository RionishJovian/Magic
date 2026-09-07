import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("UI motion step 2 — chrome only", () => {
  it("notices exit via AnimatePresence", () => {
    const notice = readFileSync("src/components/InAppNotice.tsx", "utf8");
    expect(notice).toContain("AnimatePresence");
    expect(notice).toContain("springFluid");
    expect(notice).toContain("exit=");
  });

  it("More sheet uses AnimatePresence for open/close chrome", () => {
    const more = readFileSync("src/components/AppMoreSheet.tsx", "utf8");
    expect(more).toContain("AnimatePresence");
    expect(more).toContain("springFluid");
    expect(more).toContain("forceMount");
    // handlers preserved
    expect(more).toContain("onChooseMode");
    expect(more).toContain("setSelectedSite");
    expect(more).toContain("to={t.to}");
  });

  it("marketing CTAs are isolated from /app ops buttons", () => {
    const cta = readFileSync("src/components/MarketingCta.tsx", "utf8");
    expect(cta).toContain("Marketing-only");
    expect(cta).toContain("springSnappy");
    const index = readFileSync("src/routes/index.tsx", "utf8");
    expect(index).toContain("MarketingCtaLink");
    expect(index).toContain("TelegramCta");
  });
});
