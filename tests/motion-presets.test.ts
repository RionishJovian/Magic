import { describe, expect, it } from "vitest";
import { pressScale, pressScaleMobile, springFluid, springSnappy } from "@/lib/motion-presets";

describe("motion presets", () => {
  it("exposes snappy and fluid spring recipes for UI chrome", () => {
    expect(springSnappy).toMatchObject({ type: "spring", stiffness: 400, damping: 25 });
    expect(springFluid).toMatchObject({ type: "spring", stiffness: 200, damping: 20 });
    expect(pressScale).toBe(0.98);
    expect(pressScaleMobile).toBe(0.96);
    expect(pressScaleMobile).toBeLessThan(pressScale);
  });

  it("does not live under router/hub server modules", () => {
    expect(typeof springSnappy).toBe("object");
  });
});
