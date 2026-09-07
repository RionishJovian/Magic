import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("overlay visual system", () => {
  it("keeps modal surfaces above the overlay with a crisp, opaque treatment", () => {
    for (const path of ["src/components/ui/dialog.tsx", "src/components/ui/alert-dialog.tsx"]) {
      const source = read(path);
      expect(source).toContain("z-[80] bg-slate-950/65");
      expect(source).toContain("z-[90] grid");
      expect(source).toContain("shadow-2xl shadow-black/45");
      expect(source).toContain("backdrop-blur-2xl");
    }
  });

  it("keeps floating menus inside mobile viewport edges and above app navigation", () => {
    const popover = read("src/components/ui/popover.tsx");
    const dropdown = read("src/components/ui/dropdown-menu.tsx");
    expect(popover).toContain("collisionPadding = 16");
    expect(popover).toContain("max-w-[calc(100vw-2rem)]");
    expect(popover).toContain("z-[90]");
    expect(dropdown).toContain("collisionPadding = 16");
    expect(dropdown).toContain("z-[90]");
  });

  it("opens the live-user bandwidth chooser above its trigger on compact screens", () => {
    const liveUsers = read("src/routes/_authenticated/app.live.tsx");
    expect(liveUsers).toContain(
      '<PopoverContent side="top" align="start" className="w-64 p-3 sm:w-56">',
    );
    expect(liveUsers).toContain("min-h-10 rounded-lg");
  });
});
