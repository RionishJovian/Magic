// Focused tests for the pieces that wire the WireGuard peer engine to real
// infrastructure: the globally shared address pool and the Supabase peer store.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextManagementAddress, parseSubnet, DEFAULT_HUB_SUBNET } from "../src/lib/wireguard/pool";
import { isManagementAddress } from "../src/lib/wireguard/routes";
import { hubSubnet } from "../src/lib/wireguard/service.server";

describe("shared hub address pool", () => {
  it("skips the network and hub addresses", () => {
    expect(nextManagementAddress("10.90.0.0/24", [])).toBe("10.90.0.2/32");
  });

  it("hands out only canonical management /32 routes", () => {
    const addr = nextManagementAddress(DEFAULT_HUB_SUBNET, []);
    expect(addr).not.toBeNull();
    expect(isManagementAddress(addr as string)).toBe(true);
  });

  it("treats the taken set as global, not per tenant", () => {
    const taken = ["10.90.0.2/32", "10.90.0.3", "10.90.0.4/32"];
    expect(nextManagementAddress("10.90.0.0/24", taken)).toBe("10.90.0.5/32");
  });

  it("skips further on retry attempts after a concurrent claim", () => {
    expect(nextManagementAddress("10.90.0.0/24", [], 1)).toBe("10.90.0.3/32");
    expect(nextManagementAddress("10.90.0.0/24", [], 2)).toBe("10.90.0.4/32");
  });

  it("returns null when the pool is exhausted", () => {
    // /30 → exactly one usable host (x.x.x.2).
    expect(nextManagementAddress("10.90.0.0/30", ["10.90.0.2/32"])).toBeNull();
  });

  it("rejects malformed, over-wide and over-narrow subnets", () => {
    expect(parseSubnet("not-a-subnet")).toBeNull();
    expect(parseSubnet("10.0.0.0/8")).toBeNull();
    expect(parseSubnet("10.90.0.0/31")).toBeNull();
    expect(nextManagementAddress("10.90.0.0/8", [])).toBeNull();
  });

  it("never allocates a default route", () => {
    expect(nextManagementAddress("0.0.0.0/24", [])).toBe("0.0.0.2/32");
    expect(isManagementAddress("0.0.0.0/0")).toBe(false);
  });
});

describe("hub subnet configuration", () => {
  const original = process.env["VPS_ROUTER_WG_SUBNET"];

  beforeEach(() => {
    delete process.env["VPS_ROUTER_WG_SUBNET"];
  });

  afterEach(() => {
    if (original === undefined) delete process.env["VPS_ROUTER_WG_SUBNET"];
    else process.env["VPS_ROUTER_WG_SUBNET"] = original;
  });

  it("falls back to the default pool", () => {
    expect(hubSubnet({} as NodeJS.ProcessEnv)).toBe("10.77.0.0/24");
    expect(DEFAULT_HUB_SUBNET).toBe("10.77.0.0/24");
  });

  it("uses the server-configured pool when present", () => {
    expect(hubSubnet({ VPS_ROUTER_WG_SUBNET: "10.77.0.0/24" } as NodeJS.ProcessEnv)).toBe(
      "10.77.0.0/24",
    );
  });
});

// --- Supabase peer store -------------------------------------------------

type Update = { patch: Record<string, unknown>; filters: Record<string, string> };

function fakeSupabase(row: Record<string, unknown> | null, updates: Update[], error?: unknown) {
  return {
    from() {
      const filters: Record<string, string> = {};
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: string) => {
          filters[col] = val;
          return builder;
        },
        neq: () => builder,
        not: () => builder,
        limit: () => Promise.resolve({ data: [], error: null }),
        maybeSingle: () => Promise.resolve({ data: row, error: null }),
        update: (patch: Record<string, unknown>) => {
          const upd: Record<string, unknown> = {
            eq: (col: string, val: string) => {
              filters[col] = val;
              return upd;
            },
            then: (resolve: (v: unknown) => unknown) => {
              updates.push({ patch, filters });
              return Promise.resolve(resolve({ error: error ?? null }));
            },
          };
          return upd;
        },
      };
      return builder;
    },
  };
}

async function store(row: Record<string, unknown> | null, updates: Update[], error?: unknown) {
  const { routerPeerStore } = await import("../src/lib/wireguard/store.server");
  return routerPeerStore(
    fakeSupabase(row, updates, error) as never,
    (row?.["id"] as string) ?? "r1",
  );
}

describe("router peer store", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns null when the router has no peer", async () => {
    const s = await store({ id: "r1", owner_id: "t1", cloud_peer_id: null }, []);
    expect(await s.findByRouter("r1")).toBeNull();
  });

  it("maps cloud mode to an active peer", async () => {
    const s = await store(
      {
        id: "r1",
        owner_id: "t1",
        cloud_peer_id: "p1",
        tunnel_address: "10.90.0.2/32",
        cloud_wg_public_key: "pub",
        connection_mode: "hub",
      },
      [],
    );
    expect(await s.findByRouter("r1")).toEqual({
      peerId: "p1",
      routerId: "r1",
      tenantId: "t1",
      address: "10.90.0.2/32",
      publicKey: "pub",
      status: "active",
    });
  });

  it("maps a peer that is no longer in cloud mode to disabled", async () => {
    const s = await store(
      {
        id: "r1",
        owner_id: "t1",
        cloud_peer_id: "p1",
        tunnel_address: "10.90.0.2/32",
        cloud_wg_public_key: "pub",
        connection_mode: "direct",
      },
      [],
    );
    expect((await s.findByRouter("r1"))?.status).toBe("disabled");
  });

  it("persists the peer with its globally unique management address", async () => {
    const updates: Update[] = [];
    const s = await store({ id: "r1" }, updates);
    await s.save({
      peerId: "p1",
      routerId: "r1",
      tenantId: "t1",
      address: "10.90.0.5/32",
      publicKey: "pub",
      status: "active",
    });
    expect(updates[0]?.patch).toMatchObject({
      connection_mode: "hub",
      cloud_peer_id: "p1",
      tunnel_address: "10.90.0.5/32",
      cloud_wg_public_key: "pub",
    });
  });

  it("keeps the Postgres code so a unique collision can be classified", async () => {
    const { isAddressConflict } = await import("../src/lib/wireguard/peers.server");
    const s = await store({ id: "r1" }, [], { message: "duplicate", code: "23505" });
    const err = await s
      .save({
        peerId: "p1",
        routerId: "r1",
        tenantId: "t1",
        address: "10.90.0.5/32",
        publicKey: "pub",
        status: "active",
      })
      .catch((e: unknown) => e);
    expect(isAddressConflict(err)).toBe(true);
  });

  it("clears every tunnel field when the peer is removed", async () => {
    const updates: Update[] = [];
    const s = await store({ id: "r1" }, updates);
    await s.setStatus("p1", "removed");
    expect(updates[0]?.patch).toMatchObject({
      connection_mode: "direct",
      cloud_peer_id: null,
      tunnel_address: null,
      cloud_wg_private_key_ciphertext: null,
    });
    // Scoped to this router AND this peer id.
    expect(updates[0]?.filters).toMatchObject({ id: "r1", cloud_peer_id: "p1" });
  });

  it("keeps a disabled peer's record but leaves cloud mode", async () => {
    const updates: Update[] = [];
    const s = await store({ id: "r1" }, updates);
    await s.setStatus("p1", "disabled");
    expect(updates[0]?.patch).toEqual({ connection_mode: "direct", cloud_status: "offline" });
  });
});
