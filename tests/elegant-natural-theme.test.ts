import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ELEGANT_NATURAL_DAY,
  ELEGANT_NATURAL_NIGHT,
  THEME_COLOR_DARK,
  THEME_COLOR_LIGHT,
} from "@/lib/elegant-natural";

function contrastRatio(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const channels = hex
      .slice(1)
      .match(/.{2}/g)!
      .map((channel) => Number.parseInt(channel, 16) / 255)
      .map((channel) =>
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
      );
    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Elegant Natural theme", () => {
  it("exports day and night palette names", () => {
    expect(ELEGANT_NATURAL_DAY.name).toBe("Matte Candy Light Blue");
    expect(ELEGANT_NATURAL_NIGHT.name).toBe("Elegant Natural Night");
    expect(ELEGANT_NATURAL_DAY.lightStone).toBe("#D4EAF7");
    expect(ELEGANT_NATURAL_DAY.sage).toBe("#7EC8E3");
    expect(ELEGANT_NATURAL_NIGHT.ink).toBe("#051F20");
    expect(ELEGANT_NATURAL_NIGHT.mistSage).toBe("#DAF1DE");
  });

  it("uses stone day and ink night browser chrome colors", () => {
    expect(THEME_COLOR_LIGHT).toBe(ELEGANT_NATURAL_DAY.lightStone);
    expect(THEME_COLOR_DARK).toBe(ELEGANT_NATURAL_NIGHT.ink);
  });

  it("wires elegant natural tokens in styles.css", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/Matte Candy Light Blue/);
    expect(css).toMatch(/Elegant Natural Night/);
    expect(css).toMatch(/--natural-stone:\s*#d4eaf7/);
    expect(css).toMatch(/\.dark\s*\{[\s\S]*--canvas:\s*#051f20/);
    expect(css).toMatch(/--glass-blur:/);
    expect(css).toMatch(/--aurora-opacity:/);
    expect(css).toMatch(/@utility text-title/);
    expect(css).toMatch(/@utility text-kicker/);
    expect(css).toMatch(/@utility text-sub/);
    expect(css).not.toMatch(/@utility text-mark/);
    expect(css).not.toMatch(/--mark-fill:/);
    expect(css).not.toMatch(/--title-glow/);
    expect(css).not.toMatch(/text-shadow:\s*var\(--title-glow/);
  });

  it("keeps shared controls and status text readable in day mode", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/--primary:\s*#176f94/);
    expect(css).toMatch(/--color-input:\s*var\(--input\)/);
    expect(css).toMatch(/--color-popover:\s*var\(--popover\)/);
    expect(css).toMatch(/--color-sidebar-foreground:\s*var\(--sidebar-foreground\)/);
    expect(css).toMatch(/:root:not\(\.dark\)[\s\S]*\.text-amber-100/);
    expect(css).toMatch(/:root:not\(\.dark\)[\s\S]*\.text-amber-50/);
    expect(css).toMatch(/:root:not\(\.dark\)[\s\S]*\.text-emerald-200/);
    expect(css).toMatch(/:root:not\(\.dark\)[\s\S]*\.text-red-200/);

    for (const path of [
      "src/components/ui/input.tsx",
      "src/components/ui/textarea.tsx",
      "src/components/ui/select.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("bg-[color:var(--input-bg)]");
      expect(source).toContain("text-foreground");
      expect(source).toContain("ring-2");
    }
  });

  it("keeps essential day-mode text colors above WCAG AA contrast", () => {
    const paper = "#f5fbfe";
    const stone = "#d4eaf7";
    for (const foreground of ["#176f94", "#245a78", "#92400e", "#166534", "#b91c1c"]) {
      expect(contrastRatio(foreground, paper)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrastRatio("#176f94", stone)).toBeGreaterThanOrEqual(4.5);
  });

  it("hides aurora on day and shows floating glass tab dock", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toMatch(/opacity: var\(--aurora-opacity/);
    expect(css).toMatch(/\.app-tab-bar\s*\{[\s\S]*border-radius:\s*1\.75rem/);
    expect(css).toMatch(
      /\.app-tab-bar\s*\{[\s\S]*bottom:\s*calc\(0\.5rem \+ env\(safe-area-inset-bottom/,
    );
    expect(css).not.toMatch(/100lvh - 100svh/);
  });

  it("includes hotspot operator dashboard components", () => {
    expect(readFileSync("src/routes/_authenticated/app.index.tsx", "utf8")).toMatch(
      /HomeSiteTopology/,
    );
    expect(readFileSync("src/routes/_authenticated/app.index.tsx", "utf8")).not.toMatch(
      /LiveTelemetryDashboard/,
    );
    expect(readFileSync("src/routes/_authenticated/app.index.tsx", "utf8")).not.toMatch(
      /HotspotKpiStrip|AiInsightsPanel/,
    );
    expect(readFileSync("src/components/LiveTelemetryDashboard.tsx", "utf8")).toMatch(
      /routerTelemetry/,
    );
    expect(readFileSync("src/components/LiveTelemetryDashboard.tsx", "utf8")).toMatch(
      /showInterfaceList=\{false\}/,
    );
    expect(readFileSync("src/components/LiveTelemetryDashboard.tsx", "utf8")).toMatch(
      /function Stat[\s\S]*rounded-xl/,
    );
    expect(readFileSync("src/components/DashboardGreeting.tsx", "utf8")).toMatch(/useT\(\)/);
    expect(readFileSync("src/components/BusinessSummary.tsx", "utf8")).toMatch(/RevenueSparkline/);
    expect(readFileSync("src/routes/dev.ux-shell.tsx", "utf8")).toMatch(/Voucher revenue today/);
    expect(readFileSync("src/routes/dev.ux-shell.tsx", "utf8")).toMatch(/Live telemetry/);
  });

  it("exports seven-day revenue bucketing helper", () => {
    expect(readFileSync("src/lib/revenue-daily.ts", "utf8")).toMatch(/bucketVoucherRevenueByDay/);
    expect(readFileSync("src/lib/business.functions.ts", "utf8")).toMatch(/revenueDaily7/);
  });

  it("includes zh and my dashboard translations", () => {
    const zh = readFileSync("src/lib/i18n/locales/zh.ts", "utf8");
    const my = readFileSync("src/lib/i18n/locales/my.ts", "utf8");
    expect(zh).toMatch(/"Voucher revenue today": "今日代金券收入"/);
    expect(zh).toMatch(/"Live telemetry": "实时遥测"/);
    expect(my).toMatch(/"Voucher revenue today": "ယနေ့ voucher ဝင်ငွေ"/);
    expect(my).toMatch(/"MMK from hotspot voucher sales across your RouterBoard sites."/);
  });

  it("theme boot supports ?theme= query override", () => {
    const theme = readFileSync("src/lib/theme-core.ts", "utf8");
    expect(theme).toMatch(/THEME_COLOR_LIGHT/);
    expect(theme).toMatch(/location\.search\)\.get\("theme"\)/);
  });

  it("hides the Appearance card on Profile", () => {
    const src = readFileSync("src/routes/_authenticated/app.profile.tsx", "utf8");
    expect(src).not.toMatch(/title="Appearance"/);
    expect(src).not.toContain("ThemePreferencePicker");
  });
});
