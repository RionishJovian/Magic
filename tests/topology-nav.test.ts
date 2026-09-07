import { describe, expect, it } from "vitest";
import { canAccessPath, visibleNavItems } from "@/lib/nav/modes";

describe("platform-admin topology nav", () => {
  it("hides Site topology from tenant Owners", () => {
    expect(visibleNavItems(["primary"], undefined, false).map((i) => i.to)).not.toContain(
      "/app/topology",
    );
    expect(canAccessPath(["primary"], "/app/topology", undefined, false)).toBe(false);
  });

  it("shows Site topology for platform administrators", () => {
    expect(visibleNavItems(["primary"], undefined, true).map((i) => i.to)).toContain(
      "/app/topology",
    );
    expect(canAccessPath(["primary"], "/app/topology", undefined, true)).toBe(true);
  });
});
