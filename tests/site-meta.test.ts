import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OG_IMAGE_DEFAULT, OG_IMAGE_PRICING, SITE_ORIGIN } from "@/lib/site-meta";

describe("site social preview metadata", () => {
  it("uses mikromagic.app origin for OG image URLs", () => {
    expect(SITE_ORIGIN).toBe("https://mikromagic.app");
    expect(OG_IMAGE_DEFAULT).toBe("https://mikromagic.app/og-mikromagic.png");
    expect(OG_IMAGE_PRICING).toBe("https://mikromagic.app/og-pricing.png");
  });

  it("ships branded OG images in public/", () => {
    expect(() => readFileSync("public/og-mikromagic.png")).not.toThrow();
    expect(() => readFileSync("public/og-pricing.png")).not.toThrow();
  });

  it("removes stale Lovable OG image from root and pricing routes", () => {
    const root = readFileSync("src/routes/__root.tsx", "utf8");
    const pricing = readFileSync("src/routes/pricing.tsx", "utf8");
    const landing = readFileSync("src/routes/index.tsx", "utf8");
    expect(root).not.toMatch(/gpt-engineer-file-uploads/);
    expect(pricing).toMatch(/OG_IMAGE_PRICING/);
    expect(pricing).toMatch(/SITE_ORIGIN.*\/pricing/);
    expect(landing).not.toMatch(/lovable\.app/);
    expect(landing).toMatch(/SITE_ORIGIN/);
    expect(root).toMatch(/OG_IMAGE_DEFAULT/);
  });
});
