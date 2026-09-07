import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("src/routes/_authenticated/app.routers.tsx", "utf8");

describe("captive portal security scan visibility", () => {
  const detailsStart = source.indexOf("{isOpen && (");
  const panel = "<CaptivePortalSecurityPanel routerId={r.id} />";

  it("does not mount the scan panel outside the expanded Details branch", () => {
    expect(detailsStart).toBeGreaterThanOrEqual(0);
    expect(source.slice(0, detailsStart)).not.toContain(panel);
    expect(source.slice(detailsStart)).toContain(panel);
  });

  it("uses the current router's Details state as the only scan gate", () => {
    expect(source).toContain("const isOpen = expanded.has(r.id);");
    expect(source).toContain("{isOpen && <CaptivePortalSecurityPanel routerId={r.id} />}");
  });

  it("does not introduce background or cross-router scanning", () => {
    expect(source).not.toContain("fetchHealth");
    expect(source.match(/CaptivePortalSecurityPanel/g)).toHaveLength(3);
  });
});
