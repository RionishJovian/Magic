import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function plpgsqlBody(sql: string): string {
  // Strip line comments so explanatory notes do not trip the contract check.
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

describe("device quota trigger is safe on sites inserts", () => {
  it("never reads NEW.connection_mode directly (sites have no such column)", () => {
    const sandphase = plpgsqlBody(
      readFileSync(
        resolve("supabase/migrations/20260815143000_sandphase1_virtual_router.sql"),
        "utf8",
      ),
    );
    const fix = plpgsqlBody(
      readFileSync(
        resolve("supabase/migrations/20260816071000_fix_quota_trigger_sites_connection_mode.sql"),
        "utf8",
      ),
    );

    expect(sandphase).not.toMatch(/NEW\.connection_mode/);
    expect(fix).not.toMatch(/NEW\.connection_mode/);
    expect(fix).toMatch(/to_jsonb\(NEW\)->>'connection_mode'/);
    expect(fix).toMatch(/CREATE OR REPLACE FUNCTION public\.enforce_device_quota_trigger/);
  });
});
