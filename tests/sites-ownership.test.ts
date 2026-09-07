import { describe, expect, it } from "vitest";
import {
  SITE_NOT_ON_ACCOUNT,
  assertSiteOwnedByTenant,
  resolveOwnedSiteId,
} from "@/lib/sites-ownership.server";

type FakeRow = { id: string; owner_id: string };

function fakeClient(rows: FakeRow[]) {
  return {
    from(_table: string) {
      const filters: Record<string, string> = {};
      const api = {
        select() {
          return api;
        },
        eq(col: string, val: string) {
          filters[col] = val;
          return api;
        },
        async maybeSingle() {
          const hit = rows.find(
            (r) =>
              (!filters.id || r.id === filters.id) &&
              (!filters.owner_id || r.owner_id === filters.owner_id),
          );
          return { data: hit ? { id: hit.id } : null, error: null };
        },
      };
      return api;
    },
  };
}

describe("sites ownership helpers", () => {
  const rows: FakeRow[] = [
    { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", owner_id: "owner-a" },
    { id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", owner_id: "owner-b" },
  ];

  it("assertSiteOwnedByTenant allows own site and null", async () => {
    const sb = fakeClient(rows) as never;
    await expect(
      assertSiteOwnedByTenant(sb, "owner-a", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
    ).resolves.toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    await expect(assertSiteOwnedByTenant(sb, "owner-a", null)).resolves.toBeNull();
    await expect(assertSiteOwnedByTenant(sb, "owner-a", "")).resolves.toBeNull();
  });

  it("assertSiteOwnedByTenant rejects another tenant's site", async () => {
    const sb = fakeClient(rows) as never;
    await expect(
      assertSiteOwnedByTenant(sb, "owner-a", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
    ).rejects.toThrow(SITE_NOT_ON_ACCOUNT);
  });

  it("resolveOwnedSiteId soft-nulls foreign sites (unblocks saveRouter)", async () => {
    const sb = fakeClient(rows) as never;
    await expect(
      resolveOwnedSiteId(sb, "owner-a", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
    ).resolves.toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    await expect(
      resolveOwnedSiteId(sb, "owner-a", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
    ).resolves.toBeNull();
  });
});
