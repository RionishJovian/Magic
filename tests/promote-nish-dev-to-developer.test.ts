import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("promote nish@dev to Developer", () => {
  const sql = readFileSync(".lovable/sql/promote-nish-dev-to-developer.sql", "utf8");

  it("ships paste SQL that grants platform_admins for username nish@dev", () => {
    expect(sql).toContain("lower(p.username) = 'nish@dev'");
    expect(sql).toContain("platform_admins");
    expect(sql).toContain("is_developer");
    expect(sql).not.toContain("'developer'::public.app_role");
  });
});
