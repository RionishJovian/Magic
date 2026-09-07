import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260829120000_permanent_included_router_allowance.sql",
    import.meta.url,
  ),
  "utf8",
);
const routersFunctions = readFileSync(
  new URL("../src/lib/routers.functions.ts", import.meta.url),
  "utf8",
);
const setupAccessMigration = readFileSync(
  new URL("../supabase/migrations/20260831182244_active_router_setup_access.sql", import.meta.url),
  "utf8",
);

describe("permanent included router allowance", () => {
  it("stores one durable router identity and backfills existing owners", () => {
    expect(migration).toContain("included_router_id uuid");
    expect(migration).toContain("SET routers = GREATEST(routers, 1)");
    expect(migration).toContain("DISTINCT ON (owner_id)");
    expect(migration).toContain("connection_mode IS DISTINCT FROM 'sandbox'");
    expect(migration).toContain("ORDER BY owner_id, created_at NULLS FIRST, id");
  });

  it("ignores historical paid-key expiry only for the current included router", () => {
    expect(migration).toContain("da.included_router_id = _router_id");
    expect(migration).toContain("da.owner_id = public.effective_owner(auth.uid())");
    expect(migration).toContain("BASIC_ROUTER_NOT_LOCKABLE");
  });

  it("releases paid and included bindings atomically before router deletion", () => {
    expect(migration).toContain("SET consumed_router_id = NULL,");
    expect(migration).toContain("consumed_at = NULL");
    expect(migration).toContain("SET included_router_id = NULL");
    expect(migration).toContain("BEFORE DELETE ON public.router_connections");
    expect(routersFunctions).toContain("consumed_router_id: null, consumed_at: null");
  });

  it("assigns the included slot under the owner transaction lock", () => {
    expect(migration).toContain(
      "pg_advisory_xact_lock(hashtext(NEW.owner_id::text || ':' || _kind))",
    );
    expect(migration).toContain("IF _used = 1 AND v_included IS NULL THEN");
    expect(migration).toContain("ON CONFLICT (owner_id) DO UPDATE");
  });

  it("keeps additional routers on the existing paid-key path", () => {
    expect(migration).toContain("WHERE user_id = _uid AND owner_id = NEW.owner_id");
    expect(migration).toContain("consumed_router_id = NEW.id");
    expect(migration).toContain("DEVICE_QUOTA_EXCEEDED");
  });

  it("does not let sandbox routers consume the included slot", () => {
    expect(migration).toContain("IF _connection_mode = 'sandbox' THEN RETURN NEW;");
    expect(migration).toContain("connection_mode IS DISTINCT FROM 'sandbox'");
  });

  it("reasserts one usable setup router even when allowance data is stale", () => {
    expect(setupAccessMigration).toContain("SET routers = GREATEST(COALESCE(routers, 1), 1)");
    expect(setupAccessMigration).toContain("target.owner_id = public.effective_owner(auth.uid())");
    expect(setupAccessMigration).toContain(
      "ranked.physical_position <= GREATEST(COALESCE(da.routers, 1), 1)",
    );
    expect(setupAccessMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.router_unlock_key_accessible(uuid)",
    );
  });
});
