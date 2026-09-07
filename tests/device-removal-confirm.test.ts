import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  assertRemoveDeviceConfirmation,
  assertTypedConfirmation,
  DELETE_SITE_PHRASE,
  matchesRemoveDeviceConfirmation,
  matchesTypedConfirmation,
  REMOVE_DEVICE_PHRASE,
  REMOVE_PLANS_PHRASE,
  routerNeedsTypedRemoval,
  siteNeedsTypedDeletion,
} from "@/lib/device-removal";

describe("routerNeedsTypedRemoval", () => {
  it("requires typing for Magic Hub or currently online routers", () => {
    expect(routerNeedsTypedRemoval({ connectionMode: "hub" })).toBe(true);
    expect(routerNeedsTypedRemoval({ connectionMode: "cloud" })).toBe(true);
    expect(routerNeedsTypedRemoval({ connectionMode: "direct", online: true })).toBe(true);
    expect(routerNeedsTypedRemoval({ cloudPeerId: "peer-1" })).toBe(true);
    expect(routerNeedsTypedRemoval({ connectionMode: "tunnel" })).toBe(false);
  });

  it("lets offline direct routers keep a simple confirm, and skips sandbox", () => {
    expect(routerNeedsTypedRemoval({ connectionMode: "direct", online: false })).toBe(false);
    expect(routerNeedsTypedRemoval({ connectionMode: "sandbox", online: true })).toBe(false);
  });
});

describe("CONFIRM REMOVING THE DEVICE", () => {
  it("accepts the exact phrase with extra spaces or lowercase", () => {
    expect(matchesRemoveDeviceConfirmation(REMOVE_DEVICE_PHRASE)).toBe(true);
    expect(matchesRemoveDeviceConfirmation("  confirm removing the device  ")).toBe(true);
    expect(() => assertRemoveDeviceConfirmation(REMOVE_DEVICE_PHRASE)).not.toThrow();
  });

  it("rejects a missing or partial phrase", () => {
    expect(matchesRemoveDeviceConfirmation("")).toBe(false);
    expect(matchesRemoveDeviceConfirmation("OK")).toBe(false);
    expect(() => assertRemoveDeviceConfirmation("CONFIRM REMOVE")).toThrow(/Type exactly/);
  });
});

describe("Routers UI wiring", () => {
  it("replaces Magic Hub window.confirm with the two-step typed dialog", () => {
    const cloud = readFileSync("src/components/CloudPanel.tsx", "utf8");
    expect(cloud).toMatch(/TypedConfirmDialog/);
    expect(cloud).toMatch(/REMOVE_DEVICE_PHRASE/);
    expect(cloud).not.toMatch(/\bconfirm\s*\(/);
  });

  it("gates replacing voucher plans on a router and deleting a bound site", () => {
    const plans = readFileSync("src/components/PlansPanel.tsx", "utf8");
    expect(plans).toMatch(/TypedConfirmDialog/);
    expect(plans).toMatch(/REMOVE_PLANS_PHRASE/);
    expect(plans).not.toMatch(/\bconfirm\s*\(/);

    const sites = readFileSync("src/routes/_authenticated/app.sites.tsx", "utf8");
    expect(sites).toMatch(/TypedConfirmDialog/);
    expect(sites).toMatch(/DELETE_SITE_PHRASE/);
    expect(sites).toMatch(/siteNeedsTypedDeletion/);
  });
});

describe("plans and site phrases", () => {
  it("accepts CONFIRM REMOVING THE PLANS and CONFIRM DELETING THE SITE", () => {
    expect(matchesTypedConfirmation("  confirm removing the plans ", REMOVE_PLANS_PHRASE)).toBe(
      true,
    );
    expect(matchesTypedConfirmation("confirm deleting the site", DELETE_SITE_PHRASE)).toBe(true);
    expect(() => assertTypedConfirmation("nope", REMOVE_PLANS_PHRASE)).toThrow(/Type exactly/);
  });

  it("requires typing only when a site already has devices", () => {
    expect(siteNeedsTypedDeletion(0)).toBe(false);
    expect(siteNeedsTypedDeletion(2)).toBe(true);
  });
});
