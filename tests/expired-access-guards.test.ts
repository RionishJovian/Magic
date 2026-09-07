import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EXPIRED_ALLOWED, canAccessPath } from "@/lib/nav/modes";
import { RENEWAL_ALLOWED_PATHS } from "@/lib/services/entitlements";
import { resolveRouteGate } from "@/lib/nav/route-gate";

describe("expired accounts — renew path only", () => {
  it("matches the renewal allow-list (no Live / Portal)", () => {
    expect([...EXPIRED_ALLOWED].sort()).toEqual([...RENEWAL_ALLOWED_PATHS].sort());
    expect(EXPIRED_ALLOWED.has("/app/live")).toBe(false);
    expect(EXPIRED_ALLOWED.has("/app/portal")).toBe(false);
    expect(EXPIRED_ALLOWED.has("/app/services")).toBe(true);
  });

  it("blocks Live and Portal navigation for expired", () => {
    const roles = ["expired", "client"];
    expect(canAccessPath(roles, "/app/live")).toBe(false);
    expect(canAccessPath(roles, "/app/portal")).toBe(false);
    expect(resolveRouteGate(roles, "/app/live").allowed).toBe(false);
    expect(resolveRouteGate(roles, "/app/portal").allowed).toBe(false);
    expect(resolveRouteGate(roles, "/app/services").allowed).toBe(true);
  });
});

describe("expired/pending mutation guards", () => {
  it("guards Live session mutators with requireNotExpired", () => {
    const src = readFileSync("src/lib/mikrotik.functions.ts", "utf8");
    for (const name of ["kickUser", "banMac", "unbanMac", "setUserRate", "removeBinding"]) {
      const slice = src.slice(src.indexOf(`export const ${name}`));
      const handler = slice.slice(
        0,
        slice.indexOf("export const", 1) === -1 ? 2500 : slice.indexOf("export const", 1),
      );
      expect(handler, name).toContain("requireNotExpired");
    }
  });

  it("blocks portal settings save when expired", () => {
    const src = readFileSync("src/lib/portal.functions.ts", "utf8");
    const save = src.slice(src.indexOf("export const savePortalSettings"));
    expect(save.slice(0, 800)).toContain("requireNotExpired");
  });

  it("never tears down hub peers just because the account expired", () => {
    const guards = readFileSync("src/lib/guards.server.ts", "utf8");
    expect(guards).toContain("requireNotExpired");
    expect(guards).not.toMatch(/removePeer|deprovision/);
    expect(guards).toMatch(/RouterBoard hotspot keeps serving guests/);
  });
});
