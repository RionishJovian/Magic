import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("notification visual system", () => {
  it("renders notifications above the mobile dock with a compact stack", () => {
    const sonner = read("src/components/ui/sonner.tsx");
    expect(sonner).toContain('position="bottom-center"');
    expect(sonner).toContain("visibleToasts={3}");
    expect(sonner).toContain("safe-area-inset-bottom) + 6.5rem");
  });

  it("uses crisp surfaces and distinct status treatments", () => {
    const sonner = read("src/components/ui/sonner.tsx");
    expect(sonner).toContain("!shadow-2xl !shadow-black/45");
    expect(sonner).toContain("!backdrop-blur-2xl");
    expect(sonner).toContain("!border-l-emerald-400");
    expect(sonner).toContain("!border-l-red-400");
    expect(sonner).toContain("!border-l-amber-400");
    expect(sonner).toContain("!border-l-sky-400");
  });
});
