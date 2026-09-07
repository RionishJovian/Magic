// Magic Hub connection method for MikroTik routers.
//
// Every function here authenticates the user (requireSupabaseAuth) and then
// verifies the router belongs to them (RLS-scoped read) BEFORE touching the
// VPS Router Manager API. Secrets, WireGuard private keys and RouterOS
// credentials never cross the RPC boundary.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { DatabaseClient } from "./database.types";
import { cloudPeerStatusFromHandshake } from "./cloud-peer-status";

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export type CloudStatus = "pending" | "connecting" | "online" | "offline" | "incomplete" | "error";

/** Required to safely inspect a router before any guided configuration change. */
export const MAGIC_HUB_REQUIRED_READ_PATHS = [
  "/interface/bridge",
  "/interface/bridge/port",
  "/ip/route",
  "/ip/dhcp-server",
  "/ip/firewall/nat",
  "/ip/firewall/filter",
] as const;

export async function verifyMagicHubRequiredReads(
  supabase: DatabaseClient,
  routerId: string,
): Promise<string[]> {
  const { loadRouterConn } = await import("./router-conn.server");
  const { routerAPI } = await import("./mikrotik.server");
  const connection = await loadRouterConn(supabase, routerId);
  const results = await Promise.all(
    MAGIC_HUB_REQUIRED_READ_PATHS.map(async (path) => {
      try {
        await routerAPI.raw(connection, path);
        return null;
      } catch {
        return path;
      }
    }),
  );
  return results.filter(
    (path): path is (typeof MAGIC_HUB_REQUIRED_READ_PATHS)[number] => path !== null,
  );
}

export type CloudRouterState = {
  configured: boolean;
  mode: string;
  status: CloudStatus;
  address: string | null;
  publicKey: string | null;
  lastHandshakeAt: string | null;
  lastSeenAt: string | null;
  error: string | null;
};

const idSchema = z.object({ routerId: z.string().uuid() });
const provisionSchema = idSchema.extend({
  /** When true, rotate the hub peer if needed so a fresh paste script is always returned. */
  reissueScript: z.boolean().optional(),
});
const disableSchema = idSchema.extend({
  confirmation: z.string().min(1).max(80),
});

/** RLS-scoped ownership check: throws unless the caller owns this router. */
async function ownedRouter(supabase: DatabaseClient, routerId: string) {
  const { data, error } = await supabase
    .from("router_connections")
    .select(
      "id, owner_id, name, port, connection_mode, tunnel_address, cloud_peer_id, cloud_wg_address, cloud_wg_public_key, cloud_wg_private_key_ciphertext, cloud_status, cloud_last_handshake_at, cloud_last_seen_at, cloud_last_error",
    )
    .eq("id", routerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Router not found, or you do not have access to it.");
  return data;
}

/**
 * Fail-closed tenant authorization for every peer lifecycle call, with the
 * denial written to the router operations audit log.
 */
async function authorizeRouter(supabase: DatabaseClient, userId: string, routerId: string) {
  const { requireRouterTenantAccess } = await import("./wireguard/authz.server");
  const { recordRouterOp } = await import("./audit.server");
  return requireRouterTenantAccess(supabase, userId, routerId, (entry) =>
    recordRouterOp({
      userId,
      routerId: entry.routerId,
      action: entry.action,
      outcome: entry.outcome,
      detail: entry.reason,
    }),
  );
}

function toState(row: Awaited<ReturnType<typeof ownedRouter>>): CloudRouterState {
  const storedStatus = ((row["cloud_status"] as CloudStatus) ?? "pending") as CloudStatus;
  const lastHandshakeAt = (row["cloud_last_handshake_at"] as string) ?? null;
  const status =
    storedStatus === "error" || storedStatus === "incomplete" || storedStatus === "pending"
      ? storedStatus
      : cloudPeerStatusFromHandshake("enabled", lastHandshakeAt);
  return {
    configured: Boolean(row["cloud_peer_id"]),
    mode: (row["connection_mode"] as string) ?? "direct",
    status,
    address: (row["cloud_wg_address"] as string) ?? null,
    publicKey: (row["cloud_wg_public_key"] as string) ?? null,
    lastHandshakeAt,
    lastSeenAt: (row["cloud_last_seen_at"] as string) ?? null,
    error: (row["cloud_last_error"] as string) ?? null,
  };
}

/** Current stored state — no VPS call, safe to poll cheaply. */
export const cloudRouterState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const row = await ownedRouter(context.supabase, data.routerId);
    return toState(row);
  });

export type CloudProvisionResult = {
  address: string;
  publicKey: string;
  serverPublicKey: string | null;
  endpoint: string | null;
  /** Null when the peer already existed — key material is only issued once. */
  routerScript: string | null;
  rollbackScript: string;
  reused: boolean;
};

export async function runProvisionHubPeer(
  supabase: DatabaseClient,
  userId: string,
  routerId: string,
  opts: { reissueScript?: boolean } = {},
): Promise<CloudProvisionResult> {
  const ctx = await authorizeRouter(supabase, userId, routerId);
  let row = await ownedRouter(supabase, routerId);
  const { assertNotVirtualRouter } = await import("./test-router");
  assertNotVirtualRouter({ connection_mode: row["connection_mode"] as string }, "use Magic Hub");

  const { isVpsConfigured } = await import("./wireguard/vps.server");
  if (!isVpsConfigured()) {
    throw new Error(
      "Magic Hub is not configured for this deployment. The app owner must set VPS_ROUTER_* secrets and republish.",
    );
  }

  const { buildPeerDeps, allocateManagementAddress, hubSubnet } =
    await import("./wireguard/service.server");
  const { ensurePeer, removePeer } = await import("./wireguard/peers.server");
  const vps = await import("./cloud-vps.server");
  const { encryptSecret, decryptSecret } = await import("./crypto.server");
  const { generateWireguardKeys } = await import("./wireguard/keys.server");
  const { hubManagementRoute } = await import("./wireguard/provisioner.server");

  const buildScript = (input: {
    privateKey: string;
    serverPublicKey: string;
    endpoint: string;
    address: string;
    publicKey: string;
    peerId: string;
    allowedIps: string;
    restPort: number;
  }): CloudProvisionResult => ({
    address: input.address,
    publicKey: input.publicKey,
    serverPublicKey: input.serverPublicKey,
    endpoint: input.endpoint,
    routerScript: vps.buildCloudRouterScript({
      routerName: row["name"] as string,
      peer: {
        peerId: input.peerId,
        address: input.address,
        publicKey: input.publicKey,
        privateKey: input.privateKey,
        serverPublicKey: input.serverPublicKey,
        endpoint: input.endpoint,
        allowedIps: input.allowedIps,
        dns: null,
      },
      restPort: input.restPort,
    }),
    rollbackScript: vps.buildCloudRollbackScript(),
    reused: false,
  });

  // Re-issue: drop existing peer so Connect via Hub always returns a paste script.
  if (opts.reissueScript && row["cloud_peer_id"]) {
    const teardownDeps = buildPeerDeps({
      supabase,
      userId,
      ownerId: ctx.ownerId,
      routerId,
      routerName: ctx.routerName,
    });
    await removePeer(teardownDeps, { tenantId: ctx.ownerId, routerId });
    row = await ownedRouter(supabase, routerId);
  }

  const keys = generateWireguardKeys();
  const restPort = (row["port"] as number) ?? 443;

  const deps = buildPeerDeps({
    supabase,
    userId,
    ownerId: ctx.ownerId,
    routerId,
    routerName: ctx.routerName,
    routerPrivateKey: keys.privateKey,
    routerPublicKey: keys.publicKey,
    managementRestPort: restPort,
  });

  const placeholder =
    (row["tunnel_address"] as string | null) ??
    (await allocateManagementAddress()) ??
    `${hubSubnet().replace(/\.0\/24$/, ".2")}/32`;

  const { peer, created } = await ensurePeer(deps, {
    tenantId: ctx.ownerId,
    routerId,
    routes: { address: placeholder, allowedIps: [placeholder] },
  });

  const cfg = deps.config;
  const rollbackScript = vps.buildCloudRollbackScript();
  const hubAllowed = cfg.allowedIps ?? hubManagementRoute();

  await supabase
    .from("router_connections")
    .update({
      connection_mode: "hub",
      cloud_peer_id: peer.peerId,
      tunnel_address: peer.address,
      cloud_wg_address: peer.address,
      cloud_wg_public_key: peer.publicKey,
      cloud_status: created ? "pending" : ((row["cloud_status"] as string) ?? "pending"),
      connector_id: null,
      ...(created && cfg.privateKey
        ? { cloud_wg_private_key_ciphertext: encryptSecret(cfg.privateKey) }
        : {}),
    } as never)
    .eq("id", routerId);

  if (created && cfg.privateKey && cfg.serverPublicKey && cfg.endpoint) {
    return buildScript({
      privateKey: cfg.privateKey,
      serverPublicKey: cfg.serverPublicKey,
      endpoint: cfg.endpoint,
      address: peer.address,
      publicKey: peer.publicKey,
      peerId: peer.peerId,
      allowedIps: hubAllowed,
      restPort,
    });
  }

  // Peer already existed — rebuild paste script from stored private key when possible.
  const cipher = row["cloud_wg_private_key_ciphertext"] as string | null;
  if (cipher && cfg.serverPublicKey && cfg.endpoint) {
    try {
      const privateKey = decryptSecret(cipher);
      return {
        ...buildScript({
          privateKey,
          serverPublicKey: cfg.serverPublicKey,
          endpoint: cfg.endpoint,
          address: peer.address,
          publicKey: peer.publicKey,
          peerId: peer.peerId,
          allowedIps: hubAllowed,
          restPort,
        }),
        reused: true,
      };
    } catch {
      /* fall through */
    }
  }

  // Fetch hub material for an existing peer (create path did not run).
  if (cipher) {
    try {
      const privateKey = decryptSecret(cipher);
      const hub = await vps.vpsRequest<{
        hubPublicKey?: string;
        serverPublicKey?: string;
        endpoint?: string;
      }>({ tenantId: ctx.ownerId, routerId }, `/v1/peers/${encodeURIComponent(peer.peerId)}`, {
        method: "GET",
        scopeName: "peers:inspect",
        requestedBy: userId,
      });
      const serverPublicKey = (hub.hubPublicKey ?? hub.serverPublicKey ?? "").trim();
      const endpoint = (hub.endpoint ?? "").trim();
      if (serverPublicKey && endpoint) {
        return {
          ...buildScript({
            privateKey,
            serverPublicKey,
            endpoint,
            address: peer.address,
            publicKey: peer.publicKey,
            peerId: peer.peerId,
            allowedIps: hubAllowed,
            restPort,
          }),
          reused: true,
        };
      }
    } catch {
      /* fall through */
    }
  }

  return {
    address: peer.address,
    publicKey: peer.publicKey,
    serverPublicKey: cfg.serverPublicKey ?? null,
    endpoint: cfg.endpoint ?? null,
    routerScript: null,
    rollbackScript,
    reused: !created,
  };
}

export async function runTeardownHubPeer(
  supabase: DatabaseClient,
  userId: string,
  routerId: string,
): Promise<void> {
  const ctx = await authorizeRouter(supabase, userId, routerId);
  const { buildPeerDeps } = await import("./wireguard/service.server");
  const { removePeer } = await import("./wireguard/peers.server");
  const deps = buildPeerDeps({
    supabase,
    userId,
    ownerId: ctx.ownerId,
    routerId,
    routerName: ctx.routerName,
  });
  await removePeer(deps, { tenantId: ctx.ownerId, routerId });
}

/**
 * Provision the router's single WireGuard management peer through the hardened
 * lifecycle engine: fail-closed tenant authorization, one peer per router, one
 * globally unique /32 management route (no default route, NAT or forwarding),
 * idempotent retries, compensation on persistence failure and a full audit
 * trail. The private key is returned exactly once, inside the RouterOS script.
 */
export const provisionCloudRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => provisionSchema.parse(d))
  .handler(
    async ({ data, context }): Promise<CloudProvisionResult> =>
      runProvisionHubPeer(context.supabase, context.userId, data.routerId, {
        reissueScript: data.reissueScript === true,
      }),
  );
/** Ask the hub for live peer state (scope-checked both ways) and persist it. */
export const checkCloudRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }): Promise<CloudRouterState> => {
    const ctx = await authorizeRouter(context.supabase, context.userId, data.routerId);
    const row = await ownedRouter(context.supabase, data.routerId);
    if (!row["cloud_peer_id"]) return toState(row);

    const { buildPeerDeps } = await import("./wireguard/service.server");
    const { inspectPeer } = await import("./wireguard/peers.server");
    const deps = buildPeerDeps({
      supabase: context.supabase,
      userId: context.userId,
      ownerId: ctx.ownerId,
      routerId: data.routerId,
      routerName: ctx.routerName,
    });

    let patch: Record<string, unknown>;
    try {
      const s = await inspectPeer(deps, { tenantId: ctx.ownerId, routerId: data.routerId });
      const lastHandshakeAt = "lastHandshakeAt" in s ? (s.lastHandshakeAt ?? null) : null;
      const handshakeAge = lastHandshakeAt
        ? Date.now() - new Date(lastHandshakeAt).getTime()
        : null;
      let status: CloudStatus =
        s.status === "disabled"
          ? "offline"
          : handshakeAge === null
            ? "connecting"
            : handshakeAge < 180_000
              ? "online"
              : "offline";
      const failedReads =
        status === "online"
          ? await verifyMagicHubRequiredReads(context.supabase, data.routerId)
          : [];
      if (failedReads.length) status = "incomplete";
      patch = {
        cloud_status: status,
        cloud_last_handshake_at: lastHandshakeAt,
        cloud_last_seen_at:
          status === "online" ? new Date().toISOString() : (row["cloud_last_seen_at"] ?? null),
        cloud_last_error: failedReads.length
          ? `Magic Hub is connected, but the RouterOS account cannot read: ${failedReads.join(", ")}.`
          : null,
      };
    } catch (e) {
      patch = {
        cloud_status: "error",
        cloud_last_error: e instanceof Error ? e.message : String(e),
      };
    }
    await context.supabase
      .from("router_connections")
      .update(patch as never)
      .eq("id", data.routerId);
    return toState({ ...row, ...patch });
  });

/** Revoke the peer on the hub and put the router back in direct mode. */
export const disableCloudRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => disableSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { assertRemoveDeviceConfirmation } = await import("./device-removal");
    assertRemoveDeviceConfirmation(data.confirmation);

    await runTeardownHubPeer(context.supabase, context.userId, data.routerId);

    return {
      ok: true,

      rollbackScript: (await import("./cloud-vps.server")).buildCloudRollbackScript(),
    };
  });

const opSchema = z.object({
  routerId: z.string().uuid(),
  op: z.enum([
    "router_status",
    "system_resource",
    "interfaces",
    "hotspot_active",
    "hotspot_users",
    "hotspot_user_create",
    "hotspot_user_enable",
    "hotspot_user_disable",
    "hotspot_user_remove",
    "hotspot_kick",
  ]),
  params: z.record(z.string(), z.string().max(200)).default({}),
});

/**
 * The only way the frontend can reach a cloud router: a fixed set of named
 * operations. Arbitrary RouterOS paths are not accepted here.
 */
export const cloudRouterOperation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => opSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { requireNotExpired } = await import("./guards.server");
    await requireNotExpired(context.supabase, context.userId);
    const row = await ownedRouter(context.supabase, data.routerId);
    const peerId = row["cloud_peer_id"] as string | null;
    if (!peerId) throw new Error("This router is not connected through Magic Hub yet.");

    const { runCloudOp, CLOUD_OPS } = await import("./cloud-vps.server");
    // Mutating hotspot operations stay available to any owner of the router,
    // but never as free-form commands.
    void CLOUD_OPS;
    try {
      const result = await runCloudOp(
        { tenantId: row["owner_id"] as string, routerId: data.routerId },
        peerId,
        data.op,
        data.params,
      );
      await context.supabase
        .from("router_connections")
        .update({
          cloud_status: "online",
          cloud_last_seen_at: new Date().toISOString(),
          cloud_last_error: null,
        } as never)
        .eq("id", data.routerId);
      return { ok: true as const, data: (result ?? null) as Json };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await context.supabase
        .from("router_connections")
        .update({ cloud_status: "error", cloud_last_error: message } as never)
        .eq("id", data.routerId);
      throw new Error(message);
    }
  });

const rawSchema = z.object({
  routerId: z.string().uuid(),
  method: z.enum(["GET", "POST", "PATCH", "DELETE"]).default("GET"),
  path: z.string().min(1).max(300).regex(/^\//, "Path must start with /"),
  body: z.string().max(4000).optional(),
});

/**
 * Escape hatch for raw RouterOS REST paths over the cloud tunnel.
 * Owner/admin only — every other role is rejected server-side.
 */
export const cloudRouterRaw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rawSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { requirePrivileged } = await import("./guards.server");
    await requirePrivileged(context.supabase, context.userId);
    const row = await ownedRouter(context.supabase, data.routerId);
    const peerId = row["cloud_peer_id"] as string | null;
    if (!peerId) throw new Error("This router is not connected through Magic Hub yet.");
    const { vpsRequest } = await import("./cloud-vps.server");
    return (
      (await vpsRequest<Json>(
        { tenantId: row["owner_id"] as string, routerId: data.routerId },
        `/peers/${encodeURIComponent(peerId)}/rest${data.path}`,
        {
          method: data.method,
          body: data.body ? JSON.parse(data.body) : undefined,
        },
      )) ?? null
    );
  });
