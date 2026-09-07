import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import { decideRouterTenantAccess, messageFor } from "@/lib/wireguard/authz.server";
import {
  assertManagementOnlyRoutes,
  assertExactManagementRoute,
  isManagementAddress,
  ROUTE_REJECTED,
} from "@/lib/wireguard/routes";
import {
  ensurePeer,
  inspectPeer,
  disablePeer,
  removePeer,
  peerIdempotencyKey,
  validateProvisionedPeer,
  ADDRESS_TAKEN,
  INVALID_PEER_RESPONSE,
  PEER_SCOPE_MISMATCH,
  type PeerRecord,
  type LifecycleDeps,
} from "@/lib/wireguard/peers.server";
import {
  vpsCall,
  sanitizeError,
  canonicalString,
  signRequest,
  VPS_NOT_CONFIGURED,
} from "@/lib/wireguard/vps.server";
import { httpProvisioner } from "@/lib/wireguard/provisioner.server";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const ROUTER = "33333333-3333-3333-3333-333333333333";

describe("router tenant authorization", () => {
  it("allows a non-expired member of the same tenant", () => {
    expect(
      decideRouterTenantAccess({
        roles: ["client"],
        expired: false,
        callerTenantId: TENANT,
        routerOwnerId: TENANT,
      }),
    ).toEqual({ allowed: true, reason: "same_tenant" });
  });

  it("denies cross-tenant access", () => {
    const d = decideRouterTenantAccess({
      roles: ["client"],
      expired: false,
      callerTenantId: OTHER,
      routerOwnerId: TENANT,
    });
    expect(d.allowed).toBe(false);
    expect(messageFor(d)).toMatch(/don't have access/i);
  });

  it("denies expired accounts inside their own tenant", () => {
    const d = decideRouterTenantAccess({
      roles: ["expired"],
      expired: true,
      callerTenantId: TENANT,
      routerOwnerId: TENANT,
    });
    expect(d).toEqual({ allowed: false, reason: "expired" });
    expect(messageFor(d)).toMatch(/expired/i);
  });

  it("denies Business Owners across tenants (not Dev / platform_admins)", () => {
    expect(
      decideRouterTenantAccess({
        roles: ["primary"],
        expired: false,
        callerTenantId: OTHER,
        routerOwnerId: TENANT,
        isPlatformAdmin: false,
      }),
    ).toEqual({ allowed: false, reason: "cross_tenant" });
  });

  it("keeps platform_admins oversight across tenants", () => {
    expect(
      decideRouterTenantAccess({
        roles: ["primary"],
        expired: true,
        callerTenantId: null,
        routerOwnerId: OTHER,
        isPlatformAdmin: true,
      }),
    ).toEqual({ allowed: true, reason: "platform_oversight" });
  });

  it("allows a non-expired café owner inside their own tenant", () => {
    expect(
      decideRouterTenantAccess({
        roles: ["primary"],
        expired: false,
        callerTenantId: TENANT,
        routerOwnerId: TENANT,
        isPlatformAdmin: false,
      }),
    ).toEqual({ allowed: true, reason: "same_tenant" });
  });

  it("denies an unknown router", () => {
    expect(
      decideRouterTenantAccess({
        roles: ["client"],
        expired: false,
        callerTenantId: TENANT,
        routerOwnerId: null,
      }),
    ).toEqual({ allowed: false, reason: "unknown_router" });
  });
});

describe("management-only routing", () => {
  it("accepts a single /32", () => {
    expect(isManagementAddress("10.90.0.7/32")).toBe(true);
    expect(() => assertManagementOnlyRoutes({ address: "10.90.0.7/32" })).not.toThrow();
  });

  it.each([
    { address: "0.0.0.0/0" },
    { address: "::/0" },
    { address: "10.90.0.0/24" },
    { address: "10.90.0.7" },
    { address: "10.90.0.7/32", nat: true },
    { address: "10.90.0.7/32", forwarding: true },
    { address: "10.90.0.7/32", defaultRoute: true },
    { address: "10.90.0.7/32", allowedIps: ["10.90.0.7/32", "0.0.0.0/0"] },
  ])("rejects %o", (req) => {
    expect(() => assertManagementOnlyRoutes(req)).toThrow(ROUTE_REJECTED);
  });
});

function makeDeps(initial: PeerRecord | null = null) {
  let peer = initial;
  const created: string[] = [];
  const deps: LifecycleDeps & { calls: string[] } = {
    calls: created,
    store: {
      findByRouter: async () => peer,
      addressTaken: async (addr) => addr === "10.90.0.99/32",
      save: async (p) => {
        peer = p;
      },
      setStatus: async (_id, status) => {
        if (peer) peer = { ...peer, status };
      },
    },
    provisioner: {
      createPeer: async ({ idempotencyKey, address, tenantId, routerId }) => {
        created.push(idempotencyKey);
        return {
          peerId: "peer-1",
          publicKey: "pub",
          address,
          tenantId,
          routerId,
          allowedIps: [address],
        };
      },
      inspectPeer: async ({ tenantId, routerId }) => ({
        status: "online" as const,
        lastHandshakeAt: "2026-08-14T00:00:00Z",
        tenantId,
        routerId,
      }),
      disablePeer: async () => created.push("disable"),
      removePeer: async () => created.push("remove"),
    },
  };
  return { deps, peerRef: () => peer };
}

describe("peer lifecycle", () => {
  it("creates, inspects, disables and removes", async () => {
    const { deps, peerRef } = makeDeps();
    const { peer, created } = await ensurePeer(deps, {
      tenantId: TENANT,
      routerId: ROUTER,
      routes: { address: "10.90.0.7/32" },
    });
    expect(created).toBe(true);
    expect(peer.address).toBe("10.90.0.7/32");

    const seen = await inspectPeer(deps, { tenantId: TENANT, routerId: ROUTER });
    expect(seen.status).toBe("online");

    expect(await disablePeer(deps, { tenantId: TENANT, routerId: ROUTER })).toEqual({
      changed: true,
    });
    expect(peerRef()?.status).toBe("disabled");

    expect(await removePeer(deps, { tenantId: TENANT, routerId: ROUTER })).toEqual({
      changed: true,
    });
    expect(peerRef()?.status).toBe("removed");
    expect(await removePeer(deps, { tenantId: TENANT, routerId: ROUTER })).toEqual({
      changed: false,
    });
  });

  it("is idempotent on retry and never provisions twice", async () => {
    const { deps } = makeDeps();
    const input = { tenantId: TENANT, routerId: ROUTER, routes: { address: "10.90.0.7/32" } };
    const first = await ensurePeer(deps, input);
    const second = await ensurePeer(deps, input);
    expect(second.created).toBe(false);
    expect(second.peer.peerId).toBe(first.peer.peerId);
    expect(deps.calls.filter((c) => c.startsWith("wg:"))).toHaveLength(1);
    expect(deps.calls[0]).toBe(peerIdempotencyKey(TENANT, ROUTER, "10.90.0.7/32"));
  });

  it("enforces one peer per router and one globally unique hub address", async () => {
    const existing: PeerRecord = {
      peerId: "peer-1",
      routerId: ROUTER,
      tenantId: TENANT,
      address: "10.90.0.7/32",
      publicKey: "pub",
      status: "active",
    };
    const { deps } = makeDeps(existing);
    // Reuse path: a second ensurePeer for the same router returns the stored peer
    // (Singapore Hub allocates the /32; callers may not know it on retry).
    const reused = await ensurePeer(deps, {
      tenantId: TENANT,
      routerId: ROUTER,
      routes: { address: "10.90.0.8/32" },
    });
    expect(reused.created).toBe(false);
    expect(reused.peer.address).toBe("10.90.0.7/32");

    const fresh = makeDeps();
    await expect(
      ensurePeer(fresh.deps, {
        tenantId: TENANT,
        routerId: ROUTER,
        routes: { address: "10.90.0.99/32" },
      }),
    ).rejects.toThrow(ADDRESS_TAKEN);
  });
});

describe("VPS adapter", () => {
  const env = {
    VPS_ROUTER_API_URL: "https://vps.example.com/",
    VPS_ROUTER_API_SIGNING_SECRET: "s3cr3t-signing-value",
    VPS_ROUTER_API_KEY_ID: "key-1",
  } as unknown as NodeJS.ProcessEnv;

  it("refuses to run without server configuration", async () => {
    await expect(
      vpsCall({
        method: "GET",
        path: "/v1/peers/p1",
        scope: "peers:inspect",
        tenantId: TENANT,
        routerId: ROUTER,
        requestedBy: "user-1",
        env: {} as NodeJS.ProcessEnv,
      }),
    ).rejects.toThrow(VPS_NOT_CONFIGURED);
  });

  it("signs, scopes and reads the body exactly once", async () => {
    let readCount = 0;
    let captured: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: unknown, init: unknown) => {
      captured = { url: String(url), init: init as RequestInit };
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => {
          readCount += 1;
          return JSON.stringify({ peerId: "p1" });
        },
        json: async () => {
          throw new Error("body must not be read twice");
        },
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const res = await vpsCall<{ peerId: string }>({
      method: "PUT",
      path: `/v1/peers/by-router/${ROUTER}`,
      scope: "peers:create",
      tenantId: TENANT,
      routerId: ROUTER,
      requestedBy: "user-1",
      body: { tenantId: TENANT, routerId: ROUTER },
      env,
      fetchImpl,
      now: () => 1_760_000_000_000,
      requestId: () => "req-1",
    });

    expect(res.ok && res.data.peerId).toBe("p1");
    expect(readCount).toBe(1);
    const headers = (captured!.init.headers ?? {}) as Record<string, string>;
    expect(captured!.url).toBe(`https://vps.example.com/v1/peers/by-router/${ROUTER}`);
    expect(headers["X-MM-Tenant-Id"]).toBe(TENANT);
    expect(headers["X-MM-Router-Id"]).toBe(ROUTER);
    expect(headers["X-MM-Requested-By"]).toBe("user-1");
    expect(headers["X-MM-Scope"]).toBe("peers:create");
    expect(headers["X-MM-Request-Id"]).toBe("req-1");
    // Signature only; the secret itself is never transmitted.
    expect(JSON.stringify(headers)).not.toContain("s3cr3t-signing-value");
    expect(String(captured!.init.body)).not.toContain("s3cr3t-signing-value");
    // Hub signatures are base64url (no padding), not hex.
    expect(headers["X-MM-Signature"]).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces a deterministic signature over the scoped canonical string", () => {
    const canonical = canonicalString({
      method: "PUT",
      path: "/v1/peers/by-router/r1",
      timestamp: "2026-01-01T00:00:00.000Z",
      requestId: "req-1",
      scope: "peers:create",
      tenantId: TENANT,
      routerId: ROUTER,
      requestedBy: "user-1",
      body: "{}",
    });
    expect(canonical.split("\n")).toHaveLength(9);
    expect(signRequest("k", canonical)).toBe(signRequest("k", canonical));
    expect(signRequest("k", canonical)).not.toBe(signRequest("k2", canonical));
  });

  it("never leaks secret-shaped values in errors", () => {
    const leaked = sanitizeError(
      '{"signing_secret":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',
      "Bad",
    );
    expect(leaked).not.toContain("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(leaked).toContain("[redacted]");
  });

  it("maps hub unauthorized JSON to an operator-facing secrets message", async () => {
    const { VPS_UNAUTHORIZED } = await import("@/lib/wireguard/vps.server");
    expect(sanitizeError('{"error":"unauthorized"}', "Unauthorized", 401)).toBe(VPS_UNAUTHORIZED);
    expect(sanitizeError("unauthorized", "Unauthorized", 401)).toBe(VPS_UNAUTHORIZED);
    expect(sanitizeError("Invalid signature", "Forbidden", 403)).toBe(VPS_UNAUTHORIZED);
  });

  it("treats 64-char hex signing secrets as raw key bytes", async () => {
    const { hmacKeyMaterial, hmacKeyCandidates, signRequest } =
      await import("@/lib/wireguard/vps.server");
    const hex = "7f64eceed6270af65df64b7827a2a7e490262e2407539009c7eb7bff6005296c";
    expect(Buffer.isBuffer(hmacKeyMaterial(hex))).toBe(true);
    expect(hmacKeyMaterial("plain-secret-string")).toBe("plain-secret-string");
    expect(hmacKeyCandidates(hex)).toHaveLength(2);
    // Hex-decoded key must not match UTF-8-of-hex-string HMAC.
    const utf8Sig = createHmac("sha256", hex).update("canon").digest("base64");
    const appSig = signRequest(hex, "canon");
    expect(appSig).not.toBe(utf8Sig.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
  });

  it("retries UTF-8 hex secret when raw-byte HMAC is unauthorized", async () => {
    const hex = "7f64eceed6270af65df64b7827a2a7e490262e2407539009c7eb7bff6005296c";
    let calls = 0;
    const fetchImpl = (async (_url: unknown, init: unknown) => {
      calls += 1;
      const headers = (init as RequestInit).headers as Record<string, string>;
      const sig = headers["X-MM-Signature"];
      const canonical = [
        "GET",
        "/v1/peers/p1",
        headers["X-MM-Timestamp"],
        headers["X-MM-Request-Id"],
        "peers:inspect",
        TENANT,
        ROUTER,
        "user-1",
        "",
      ].join("\n");
      const utf8Sig = signRequest(hex, canonical, hex);
      if (sig === utf8Sig) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => JSON.stringify({ peerId: "p1" }),
        } as unknown as Response;
      }
      return {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => '{"error":"unauthorized"}',
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const res = await vpsCall<{ peerId: string }>({
      method: "GET",
      path: "/v1/peers/p1",
      scope: "peers:inspect",
      tenantId: TENANT,
      routerId: ROUTER,
      requestedBy: "user-1",
      env: {
        VPS_ROUTER_API_URL: "https://hub.example/internal/provisioner",
        VPS_ROUTER_API_SIGNING_SECRET: hex,
        VPS_ROUTER_API_KEY_ID: "v1",
      } as unknown as NodeJS.ProcessEnv,
      fetchImpl,
      now: () => 1_760_000_000_000,
      requestId: () => "req-retry",
    });
    expect(res.ok && res.data.peerId).toBe("p1");
    expect(calls).toBe(2);
  });

  it("treats an already-removed peer as removed (retry-safe)", async () => {
    const fetchImpl = (async () =>
      ({
        ok: false,
        status: 404,
        statusText: "Not Found",
        text: async () => "missing",
      }) as unknown as Response) as unknown as typeof fetch;
    const keys = ["VPS_ROUTER_API_URL", "VPS_ROUTER_API_SIGNING_SECRET", "VPS_ROUTER_API_KEY_ID"];
    const saved: Record<string, string | undefined> = Object.fromEntries(
      keys.map((k) => [k, process.env[k]]),
    );
    for (const k of keys) process.env[k] = env[k] as string;
    try {
      await expect(
        httpProvisioner({ fetchImpl, requestedBy: "user-1" }).removePeer({
          tenantId: TENANT,
          routerId: ROUTER,
          peerId: "p1",
        }),
      ).resolves.toBeUndefined();
    } finally {
      for (const k of keys) {
        const v = saved[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});

describe("no browser-supplied tunnel material", () => {
  it("the peer service exposes no hub url / key inputs", () => {
    const src = String(ensurePeer) + String(httpProvisioner) + String(vi.fn());
    expect(src).not.toMatch(/hubUrl|hubPublicKey|signingSecret/);
  });

  it("keeps router key material out of the peer records and audit trail", () => {
    // The adapter may hand one-time router config to its caller, but the
    // lifecycle service itself never sees or stores a private key.
    expect(String(ensurePeer)).not.toMatch(/privateKey/);
  });
});

describe("fail-closed authorization details", () => {
  it("denies an unknown router even for Business Owner", () => {
    expect(
      decideRouterTenantAccess({
        roles: ["primary"],
        expired: false,
        callerTenantId: null,
        routerOwnerId: null,
      }),
    ).toEqual({ allowed: false, reason: "unknown_router" });
  });

  it("fails closed on a database/query error", () => {
    const d = decideRouterTenantAccess({
      roles: ["primary"],
      expired: false,
      callerTenantId: null,
      routerOwnerId: TENANT,
      lookupFailed: true,
    });
    expect(d).toEqual({ allowed: false, reason: "lookup_failed" });
    expect(messageFor(d)).toMatch(/could not be verified/i);
  });
});

describe("canonical IPv4 parsing", () => {
  it.each(["10.090.0.7/32", "010.90.0.7/32", "10.90.00.7/32", "10.90.0.07/32"])(
    "rejects leading-zero octets (%s)",
    (addr) => {
      expect(isManagementAddress(addr)).toBe(false);
    },
  );

  it("accepts a canonical zero octet", () => {
    expect(isManagementAddress("10.90.0.7/32")).toBe(true);
    expect(isManagementAddress("0.0.0.7/32")).toBe(true);
  });

  it("requires the returned route to equal the requested one exactly", () => {
    expect(() => assertExactManagementRoute("10.90.0.7/32", "10.90.0.8/32")).toThrow();
    expect(() =>
      assertExactManagementRoute("10.90.0.7/32", "10.90.0.7/32", ["10.90.0.7/32", "0.0.0.0/0"]),
    ).toThrow();
    expect(() =>
      assertExactManagementRoute("10.90.0.7/32", "10.90.0.7/32", ["10.90.0.7/32"]),
    ).not.toThrow();
  });
});

describe("create-response validation and compensation", () => {
  const expected = { tenantId: TENANT, routerId: ROUTER, address: "10.90.0.7/32" };

  it.each([
    { peerId: "", publicKey: "pub", address: "10.90.0.7/32" },
    { peerId: "p1", publicKey: "   ", address: "10.90.0.7/32" },
    { peerId: "p1", publicKey: "pub", address: "10.90.0.8/32" },
    { peerId: "p1", publicKey: "pub", address: "10.90.0.7/32", tenantId: OTHER },
    { peerId: "p1", publicKey: "pub", address: "10.90.0.7/32", routerId: OTHER },
  ])("rejects an invalid provisioner response %o", (peer) => {
    expect(() => validateProvisionedPeer(peer, expected)).toThrow();
  });

  it("compensates with a signed remove when persistence fails", async () => {
    const removed: string[] = [];
    const audits: string[] = [];
    const deps: LifecycleDeps = {
      store: {
        findByRouter: async () => null,
        addressTaken: async () => false,
        save: async () => {
          throw new Error("db is down");
        },
        setStatus: async () => {},
      },
      provisioner: {
        createPeer: async ({ address, tenantId, routerId }) => ({
          peerId: "peer-1",
          publicKey: "pub",
          address,
          tenantId,
          routerId,
          allowedIps: [address],
        }),
        inspectPeer: async ({ tenantId, routerId }) => ({
          status: "unknown" as const,
          lastHandshakeAt: null,
          tenantId,
          routerId,
        }),
        disablePeer: async () => {},
        removePeer: async ({ peerId }) => {
          removed.push(peerId);
        },
      },
      audit: (e) => {
        audits.push(`${e.action}:${e.outcome}`);
      },
    };

    // The primary persistence error is never masked by the compensation.
    await expect(
      ensurePeer(deps, { tenantId: TENANT, routerId: ROUTER, routes: { address: "10.90.0.7/32" } }),
    ).rejects.toThrow("db is down");
    expect(removed).toEqual(["peer-1"]);
    expect(audits).toContain("wg_peer_persist_failed:failed");
    expect(audits).toContain("wg_peer_compensated:ok");
  });
});

describe("globally unique hub addresses", () => {
  function poolDeps(taken: Set<string>, allocations: string[]) {
    let saved: PeerRecord | null = null;
    const i = 0;
    const deps: LifecycleDeps = {
      store: {
        findByRouter: async () => saved,
        // Global pool: no tenant argument at all.
        addressTaken: async (address) => taken.has(address),
        save: async (p) => {
          if (taken.has(p.address)) {
            const err = new Error("duplicate key value violates unique constraint");
            (err as unknown as { code: string }).code = "23505";
            throw err;
          }
          taken.add(p.address);
          saved = p;
        },
        setStatus: async () => {},
      },
      provisioner: {
        createPeer: async ({ address, tenantId, routerId }) => ({
          peerId: `peer-${address}`,
          publicKey: "pub",
          address,
          tenantId,
          routerId,
          allowedIps: [address],
        }),
        inspectPeer: async ({ tenantId, routerId }) => ({
          status: "unknown" as const,
          lastHandshakeAt: null,
          tenantId,
          routerId,
        }),
        disablePeer: async () => {},
        removePeer: async () => {},
      },
      allocateAddress: (attempt) => allocations[attempt - 1] ?? null,
    };
    return deps;
  }

  it("rejects an address already used by another tenant", async () => {
    const deps = poolDeps(new Set(["10.90.0.7/32"]), []);
    await expect(
      ensurePeer(deps, { tenantId: OTHER, routerId: ROUTER, routes: { address: "10.90.0.7/32" } }),
    ).rejects.toThrow(ADDRESS_TAKEN);
  });

  it("retries allocation when the shared pool collides", async () => {
    const deps = poolDeps(new Set(["10.90.0.7/32"]), ["10.90.0.8/32"]);
    const res = await ensurePeer(deps, {
      tenantId: OTHER,
      routerId: ROUTER,
      routes: { address: "10.90.0.7/32" },
    });
    expect(res.created).toBe(true);
    expect(res.peer.address).toBe("10.90.0.8/32");
  });
});

describe("lifecycle scope verification", () => {
  function scopedDeps(peer: PeerRecord, responseScope?: { tenantId?: string; routerId?: string }) {
    const deps: LifecycleDeps = {
      store: {
        findByRouter: async () => peer,
        addressTaken: async () => false,
        save: async () => {},
        setStatus: async () => {},
      },
      provisioner: {
        createPeer: async () => {
          throw new Error("not used");
        },
        inspectPeer: async ({ tenantId, routerId }) => ({
          status: "online" as const,
          lastHandshakeAt: null,
          tenantId: responseScope?.tenantId ?? tenantId,
          routerId: responseScope?.routerId ?? routerId,
        }),
        disablePeer: async () => {},
        removePeer: async () => {},
      },
    };
    return deps;
  }

  const base: PeerRecord = {
    peerId: "peer-1",
    routerId: ROUTER,
    tenantId: TENANT,
    address: "10.90.0.7/32",
    publicKey: "pub",
    status: "active",
  };

  it("refuses a stored peer belonging to another tenant", async () => {
    const deps = scopedDeps({ ...base, tenantId: OTHER });
    const input = { tenantId: TENANT, routerId: ROUTER };
    await expect(inspectPeer(deps, input)).rejects.toThrow(PEER_SCOPE_MISMATCH);
    await expect(disablePeer(deps, input)).rejects.toThrow(PEER_SCOPE_MISMATCH);
    await expect(removePeer(deps, input)).rejects.toThrow(PEER_SCOPE_MISMATCH);
  });

  it("refuses a provisioner response scoped to another router", async () => {
    const deps = scopedDeps(base, { routerId: OTHER });
    await expect(inspectPeer(deps, { tenantId: TENANT, routerId: ROUTER })).rejects.toThrow(
      PEER_SCOPE_MISMATCH,
    );
  });
});

describe("test environment hygiene", () => {
  it("restores every process.env value it alters", async () => {
    const keys = ["VPS_ROUTER_API_URL", "VPS_ROUTER_API_SIGNING_SECRET", "VPS_ROUTER_API_KEY_ID"];
    const before = keys.map((k) => process.env[k]);
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    try {
      for (const k of keys) process.env[k] = "temp-value";
    } finally {
      for (const k of keys) {
        const v = saved[k];
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
    expect(keys.map((k) => process.env[k])).toEqual(before);
  });
});

describe("mandatory provisioner response identity and routes", () => {
  function depsWith(peer: unknown, inspect?: unknown) {
    const audits: string[] = [];
    const deps: LifecycleDeps = {
      store: {
        findByRouter: async () => null,
        addressTaken: async () => false,
        save: async () => {},
        setStatus: async () => {},
      },
      provisioner: {
        createPeer: async () => peer as never,
        inspectPeer: async () => inspect as never,
        disablePeer: async () => {},
        removePeer: async () => {},
      },
      audit: (e) => {
        audits.push(`${e.action}:${e.outcome}`);
      },
    };
    return { deps, audits };
  }

  const ADDR = "10.90.0.7/32";
  const input = { tenantId: TENANT, routerId: ROUTER, routes: { address: ADDR } };

  it("fails closed when the create response omits tenantId", async () => {
    const { deps } = depsWith({
      peerId: "p",
      publicKey: "pub",
      address: ADDR,
      routerId: ROUTER,
      allowedIps: [ADDR],
    });
    await expect(ensurePeer(deps, input)).rejects.toThrow(INVALID_PEER_RESPONSE);
  });

  it("fails closed when the create response omits routerId", async () => {
    const { deps } = depsWith({
      peerId: "p",
      publicKey: "pub",
      address: ADDR,
      tenantId: TENANT,
      allowedIps: [ADDR],
    });
    await expect(ensurePeer(deps, input)).rejects.toThrow(INVALID_PEER_RESPONSE);
  });

  it("fails closed when the create response omits allowedIps", async () => {
    const { deps } = depsWith({
      peerId: "p",
      publicKey: "pub",
      address: ADDR,
      tenantId: TENANT,
      routerId: ROUTER,
    });
    await expect(ensurePeer(deps, input)).rejects.toThrow(ROUTE_REJECTED);
  });

  it("fails closed when allowedIps is not exactly the management /32", async () => {
    const { deps } = depsWith({
      peerId: "p",
      publicKey: "pub",
      address: ADDR,
      tenantId: TENANT,
      routerId: ROUTER,
      allowedIps: [ADDR, "0.0.0.0/0"],
    });
    await expect(ensurePeer(deps, input)).rejects.toThrow();
  });

  it("fails closed when an inspect response omits tenantId or routerId", async () => {
    const stored: PeerRecord = {
      peerId: "peer-1",
      routerId: ROUTER,
      tenantId: TENANT,
      address: ADDR,
      publicKey: "pub",
      status: "active",
    };
    for (const bad of [
      { status: "online", lastHandshakeAt: null, routerId: ROUTER },
      { status: "online", lastHandshakeAt: null, tenantId: TENANT },
    ]) {
      const { deps } = depsWith(null, bad);
      deps.store.findByRouter = async () => stored;
      await expect(inspectPeer(deps, { tenantId: TENANT, routerId: ROUTER })).rejects.toThrow(
        PEER_SCOPE_MISMATCH,
      );
    }
  });
});

describe("authorization migration contract", () => {
  const sql = readFileSync(
    "db/migrations/20260814103000_router_tenant_wireguard_authorization.sql",
    "utf8",
  );
  const fixSql = readFileSync(
    "supabase/migrations/20260822180000_fix_can_manage_router_tenant_platform_admin.sql",
    "utf8",
  );

  it("is recorded as applied and forward-only", () => {
    expect(sql).toMatch(/APPLIED 2026-08-14/);
  });

  it("declares the single tenant authorization helper", () => {
    expect(sql).toContain("public.can_manage_router_tenant");
  });

  it("enforces globally unique tunnel addresses with a duplicate preflight", () => {
    expect(sql).toMatch(/RAISE EXCEPTION/);
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS router_connections_tunnel_address_global_key[\s\S]*ON public\.router_connections \(tunnel_address\)[\s\S]*WHERE tunnel_address IS NOT NULL/,
    );
  });

  it("redefines can_manage_router_tenant around is_platform_admin", () => {
    expect(fixSql).toMatch(/private\.can_manage_router_tenant/);
    expect(fixSql).toMatch(/private\.is_platform_admin\(_user_id\)/);
    expect(fixSql).not.toMatch(/has_role\(_user_id, 'owner'/);
    expect(fixSql).not.toMatch(/has_role\(_user_id, 'admin'/);
  });
});
