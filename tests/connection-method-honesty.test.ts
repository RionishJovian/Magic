import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CONNECTION_METHODS,
  connectionMethodsForRole,
  isStaffRoles,
} from "@/lib/connection-methods";

describe("connection method honesty — one list, one count", () => {
  it("shared list: Clients get Hub + Connector; staff also get Public IP", () => {
    expect(CONNECTION_METHODS.map((m) => m.id)).toEqual(["hub", "connector", "remote"]);
    expect(connectionMethodsForRole(false).map((m) => m.id)).toEqual(["hub", "connector"]);
    expect(connectionMethodsForRole(true).map((m) => m.id)).toEqual(["hub", "connector", "remote"]);
    expect(CONNECTION_METHODS.find((m) => m.id === "remote")?.staffOnly).toBe(true);
    expect(isStaffRoles(["client"])).toBe(false);
    expect(isStaffRoles(["primary"])).toBe(true);
  });

  it("RemoteAccessChooser and Routers form both import the shared list", () => {
    const chooser = readFileSync("src/components/RemoteAccessChooser.tsx", "utf8");
    const routers = readFileSync("src/routes/_authenticated/app.routers.tsx", "utf8");
    expect(chooser).toContain("connectionMethodsForRole");
    expect(chooser).toContain("isStaffRoles");
    expect(routers).toContain("connectionMethodsForRole");
    expect(routers).toContain("isStaffRoles");
    expect(routers).toContain("methodOptions.map");
  });

  it("Routers page does not double-stack the nav chooser above Connection method", () => {
    const routers = readFileSync("src/routes/_authenticated/app.routers.tsx", "utf8");
    expect(routers).not.toContain("RemoteAccessChooser");
    expect(routers).toContain('t.label("Connection method")');
  });

  it("saveRouter rejects remote method for non-privileged accounts", () => {
    const src = readFileSync("src/lib/routers.functions.ts", "utf8");
    const save = src.slice(src.indexOf("export const saveRouter"));
    expect(save.slice(0, 1200)).toContain('connectionMethod === "remote"');
    expect(save.slice(0, 1200)).toContain("isPrivileged");
    expect(save.slice(0, 1200)).toMatch(/Public IP \/ DDNS is not available/);
  });
});
