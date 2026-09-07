import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Users page — editable account expiry", () => {
  const usersFn = readFileSync("src/lib/users.functions.ts", "utf8");
  const usersPage = readFileSync("src/routes/_authenticated/app.users.tsx", "utf8");

  it("exposes setAppUserExpires for Primary/Developer", () => {
    expect(usersFn).toContain("export const setAppUserExpires");
    expect(usersFn).toContain('role: "expired"');
    expect(usersFn).toContain('role: "client"');
    expect(usersFn).toMatch(/Primary accounts do not expire/);
  });

  it("Users table edits expiry instead of AI scan limits", () => {
    expect(usersPage).toContain("ExpiresCell");
    expect(usersPage).toContain("setAppUserExpires");
    expect(usersPage).toContain('type="date"');
    expect(usersPage).toContain("+30d");
    expect(usersPage).not.toContain("ScanLimitCell");
    expect(usersPage).not.toMatch(/AI scans \/ month/);
    expect(usersPage).not.toContain("setAppUserScanLimit");
  });
});
