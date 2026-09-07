import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("one Primary per cloud", () => {
  const owner = readFileSync("src/lib/user-role-owner.ts", "utf8");
  const usersFn = readFileSync("src/lib/users.functions.ts", "utf8");
  const usersPage = readFileSync("src/routes/_authenticated/app.users.tsx", "utf8");
  const caps = readFileSync("src/lib/users-page-capabilities.ts", "utf8");

  it("blocks creating or granting a second Primary", () => {
    expect(owner).toContain("assertSingleCafePrimary");
    expect(owner).toMatch(/already has a Primary \(app owner\)/);
    expect(usersFn).toContain("assertSingleCafePrimary");
    expect(usersFn).toMatch(/createAppUser[\s\S]*assertSingleCafePrimary\(\)/);
    expect(usersFn).toMatch(/setAppUserRole[\s\S]*assertSingleCafePrimary\(data\.user_id\)/);
  });

  it("Users UI hides Primary create when one already exists", () => {
    expect(usersPage).toContain("canCreatePrimary");
    expect(usersPage).toMatch(/canCreatePrimary \? <option value="primary">Primary<\/option>/);
    expect(usersPage).toMatch(
      /One Primary per cloud|creating or granting another Primary is blocked/,
    );
    expect(caps).toMatch(/One Primary \(app owner\) per cloud/);
  });
});
