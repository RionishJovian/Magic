import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("i18n workflow integrity", () => {
  it("fails CI for every missing or TODO translation, not a rounded percentage", () => {
    const core = read("scripts/i18n-core.mjs");
    const audit = read("scripts/i18n-audit.mjs");
    expect(core).toContain('rule: "missing"');
    expect(core).toContain('rule: "todo"');
    expect(core).toContain("Math.round((translated / total) * 10_000) / 100");
    expect(audit).toContain("if (r.missing.length) failed = true");
    expect(audit).toContain("if (r.todo.length) failed = true");
    expect(core).toContain("sourceHash");
    expect(audit).toContain("--check-report");
    expect(audit).toContain('flag("--report") || jsonPath');
    expect(audit).toContain("committed i18n report is stale");
  });

  it("routes new voucher and revenue presentation text through the translator", () => {
    const revenue = read("src/routes/_authenticated/app.revenue.tsx");
    const vouchers = read("src/routes/_authenticated/app.vouchers.tsx");
    expect(revenue).toContain('t.ui("Recent revenue activity")');
    expect(revenue).toContain('t.copy("No settled voucher payments yet.")');
    expect(vouchers).toContain('t.action("Mark handed out & print")');
    expect(vouchers).toContain("it does not record income");
  });

  it("keeps translated navigation and English-only actions as the documented policy", () => {
    const rules = read("src/content/i18n-rules.md");
    const profile = read("src/routes/_authenticated/app.profile.tsx");
    expect(rules).toContain("Translate feature, tab, navigation, and section names.");
    expect(rules).toContain("Do not translate action buttons");
    expect(profile).toContain("Navigation, section titles and explanatory text are translated.");
  });
});
