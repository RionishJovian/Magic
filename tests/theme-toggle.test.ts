import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

describe("ThemeToggle header control", () => {
  it("uses a circular icon button on mobile and pill switch on md+", () => {
    const src = read("src/components/ThemeToggle.tsx");
    expect(src).toMatch(/rounded-full border border-\[color:var\(--glass-border\)\]/);
    expect(src).toContain("md:hidden");
    expect(src).toContain("hidden h-7 shrink-0 md:flex");
    expect(src).not.toMatch(/touch-icon h-7 shrink-0/);
  });
});
