import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("owner operations trigger security", () => {
  it("keeps the SECURITY DEFINER trigger out of the API execution surface", () => {
    const sql = readFileSync(
      "supabase/migrations/20260824224500_harden_owner_operations_trigger.sql",
      "utf8",
    );
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.validate_reseller_assignment_owner()");
    expect(sql).toContain("PUBLIC, anon, authenticated");
  });
});
