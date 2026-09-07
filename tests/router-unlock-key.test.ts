import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260826050000_router_unlock_key.sql", import.meta.url),
  "utf8",
);
const includedRouterMigration = readFileSync(
  new URL("../supabase/migrations/20260830132500_included_router_key_access.sql", import.meta.url),
  "utf8",
);

describe("Router unlock key 1003", () => {
  it("is account-bound and is only consumed by a committed router insert", () => {
    expect(migration).toContain("key_id integer NOT NULL DEFAULT 1003 CHECK (key_id = 1003)");
    expect(migration).toContain(
      "price_coins numeric(12,2) NOT NULL DEFAULT 30 CHECK (price_coins = 30)",
    );
    expect(migration).toContain("consumed_router_id uuid REFERENCES public.router_connections");
    expect(migration).toContain("FOR UPDATE SKIP LOCKED");
    expect(migration).toContain("consumed_router_id = NEW.id");
  });

  it("keeps the included router outside the paid-key expiry rule", () => {
    expect(migration).toContain("WHEN NOT EXISTS (");
    expect(migration).toContain("WHERE k.consumed_router_id = _router_id");
    expect(migration).toContain("BASIC_ROUTER_NOT_LOCKABLE");
    expect(includedRouterMigration).toContain(
      "ranked.physical_position <= COALESCE(da.routers, 1)",
    );
    expect(includedRouterMigration).toContain("ORDER BY r.created_at, r.id");
    expect(includedRouterMigration).toContain("r.connection_mode IS DISTINCT FROM 'sandbox'");
  });
});
