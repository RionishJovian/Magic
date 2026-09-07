import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260826060000_retire_plus_tier_pass.sql", import.meta.url),
  "utf8",
);

describe("retired Plus Tier Pass", () => {
  it("cancels pending requests, preserves historical rows, and rejects new checkout rows", () => {
    expect(migration).toContain("WHERE service_key = 'plus' AND status = 'pending'");
    expect(migration).toContain("PLUS_TIER_PASS_RETIRED");
    expect(migration).toContain("BEFORE INSERT OR UPDATE OF service_key");
  });
});
