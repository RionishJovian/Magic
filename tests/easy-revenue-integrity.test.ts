import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const business = readFileSync("src/lib/business.functions.ts", "utf8");
const easyHome = readFileSync("src/routes/_authenticated/app.easy.tsx", "utf8");

describe("Easy Mode live/revenue continuity", () => {
  it("reads active guests from RouterOS instead of the voucher-count summary", () => {
    expect(business).toContain("routerAPI.activeUsers(connection)");
    expect(business).toContain("activeSessions");
    expect(easyHome).toContain("snapshot?.activeSessions");
    expect(easyHome).not.toContain("overview?.activeSessions");
  });

  it("keeps physical-router filtering and live failures distinguishable", () => {
    expect(business).toContain('router.connection_mode !== "sandbox"');
    expect(business).toContain("Promise.allSettled");
    expect(business).toContain("activeSessions = successfulReads.reduce");
  });
});
