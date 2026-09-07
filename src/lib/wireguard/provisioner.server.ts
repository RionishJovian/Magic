// Binds the peer lifecycle service to the live Singapore Hub HTTP contract.
// Nothing here accepts browser input beyond tenant/router ids resolved by the
// server-side tenant guard.

import { vpsCall } from "./vps.server";
import type { Provisioner, ProvisionedPeer } from "./peers.server";
import { INVALID_PEER_RESPONSE, PEER_SCOPE_MISMATCH } from "./peers.server";
import { isManagementAddress, ROUTE_REJECTED } from "./routes";

/**
 * Router-side material. The hub never returns a private key — the app generates
 * the keypair and sends only the public key on create.
 */
export type PeerConfigMaterial = {
  privateKey?: string;
  serverPublicKey?: string;
  endpoint?: string;
  dns?: string | null;
  /** Hub AllowedIPs for the RouterOS peer (the hub /32). */
  allowedIps?: string;
};

type HubPeerBody = {
  peerId?: string;
  routerId?: string;
  tenantId?: string;
  routerPublicKey?: string;
  publicKey?: string;
  tunnelAddress?: string;
  address?: string;
  hubPublicKey?: string;
  serverPublicKey?: string;
  endpoint?: string;
  allowedIps?: string[];
  state?: string;
  lastHandshakeAt?: string | null;
  rxBytes?: number | null;
  txBytes?: number | null;
};

function mapHubPeer(raw: HubPeerBody | null | undefined) {
  if (!raw) return null;
  const address = (raw.tunnelAddress ?? raw.address ?? "").trim();
  const publicKey = (raw.routerPublicKey ?? raw.publicKey ?? "").trim();
  const peerId = (raw.peerId ?? "").trim();
  const tenantId = (raw.tenantId ?? "").trim();
  const routerId = (raw.routerId ?? "").trim();
  const allowedIps = Array.isArray(raw.allowedIps) ? raw.allowedIps : [];
  if (!peerId || !publicKey || !tenantId || !routerId || !isManagementAddress(address)) return null;
  return {
    peerId,
    publicKey,
    address,
    tenantId,
    routerId,
    allowedIps,
    serverPublicKey: raw.hubPublicKey ?? raw.serverPublicKey ?? undefined,
    endpoint: raw.endpoint ?? undefined,
  };
}

export function hubManagementRoute(env: NodeJS.ProcessEnv = process.env): string {
  return (env["VPS_ROUTER_HUB_ROUTE"] || "10.77.0.1/32").trim();
}

export function validateHubAllowedIps(allowedIps: string[], hubRoute: string): void {
  if (allowedIps.length !== 1) throw new Error(ROUTE_REJECTED);
  if (!isManagementAddress(allowedIps[0] ?? "")) throw new Error(ROUTE_REJECTED);
  if ((allowedIps[0] ?? "").trim() !== hubRoute.trim()) throw new Error(ROUTE_REJECTED);
}

export type HttpProvisionerOpts = {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  /** Operator principal — must match hub X-MM-Requested-By / body.requestedBy. */
  requestedBy: string;
  /** Locally generated private key for the RouterOS script (never sent to hub). */
  routerPrivateKey?: string;
  /** Public key sent to the hub on create. */
  routerPublicKey?: string;
  routerName?: string;
  managementRestPort?: number;
  onPeerConfig?: (config: PeerConfigMaterial) => void;
};

export function httpProvisioner(opts: HttpProvisionerOpts): Provisioner {
  const fetchImpl = opts.fetchImpl;
  const env = opts.env;
  const requestedBy = opts.requestedBy;

  return {
    async createPeer({ tenantId, routerId }): Promise<ProvisionedPeer> {
      if (!opts.routerPublicKey) throw new Error(INVALID_PEER_RESPONSE);
      const path = `/v1/peers/by-router/${encodeURIComponent(routerId)}`;
      const body = {
        tenantId,
        routerId,
        requestedBy,
        idempotencyKey: `wg-peer:${routerId}:create`,
        routerPublicKey: opts.routerPublicKey,
        routerName: opts.routerName ?? routerId,
        managementRestPort: opts.managementRestPort ?? 443,
      };
      const res = await vpsCall<HubPeerBody>({
        method: "PUT",
        path,
        scope: "peers:create",
        tenantId,
        routerId,
        requestedBy,
        body,
        ...(fetchImpl ? { fetchImpl } : {}),
        ...(env ? { env } : {}),
      });
      if (!res.ok) throw new Error(res.error);
      const mapped = mapHubPeer(res.data);
      if (!mapped) throw new Error(INVALID_PEER_RESPONSE);
      if (mapped.tenantId !== tenantId || mapped.routerId !== routerId)
        throw new Error(PEER_SCOPE_MISMATCH);
      const hubRoute = hubManagementRoute(env);
      validateHubAllowedIps(mapped.allowedIps, hubRoute);

      opts.onPeerConfig?.({
        ...(opts.routerPrivateKey ? { privateKey: opts.routerPrivateKey } : {}),
        ...(mapped.serverPublicKey ? { serverPublicKey: mapped.serverPublicKey } : {}),
        ...(mapped.endpoint ? { endpoint: mapped.endpoint } : {}),
        allowedIps: hubRoute,
      });

      // Lifecycle store expects allowedIps === address; keep hub route in config.
      return {
        peerId: mapped.peerId,
        publicKey: mapped.publicKey,
        address: mapped.address,
        tenantId: mapped.tenantId,
        routerId: mapped.routerId,
        allowedIps: [mapped.address],
      };
    },

    async inspectPeer({ tenantId, routerId, peerId }) {
      const res = await vpsCall<HubPeerBody>({
        method: "GET",
        path: `/v1/peers/${encodeURIComponent(peerId)}`,
        scope: "peers:inspect",
        tenantId,
        routerId,
        requestedBy,
        ...(fetchImpl ? { fetchImpl } : {}),
        ...(env ? { env } : {}),
      });
      if (!res.ok) throw new Error(res.error);
      const mapped = mapHubPeer(res.data);
      if (!mapped) throw new Error(INVALID_PEER_RESPONSE);
      if (mapped.tenantId !== tenantId || mapped.routerId !== routerId)
        throw new Error(PEER_SCOPE_MISMATCH);
      const state = String(res.data?.state ?? "");
      const status =
        state === "disabled"
          ? ("disabled" as const)
          : res.data?.lastHandshakeAt
            ? ("online" as const)
            : ("offline" as const);
      return {
        status,
        lastHandshakeAt: res.data?.lastHandshakeAt ?? null,
        tenantId: mapped.tenantId,
        routerId: mapped.routerId,
      };
    },

    async disablePeer({ tenantId, routerId, peerId }) {
      const res = await vpsCall({
        method: "POST",
        path: `/v1/peers/${encodeURIComponent(peerId)}/disable`,
        scope: "peers:disable",
        tenantId,
        routerId,
        requestedBy,
        body: {
          requestedBy,
          idempotencyKey: `wg-peer:${routerId}:disable`,
        },
        ...(fetchImpl ? { fetchImpl } : {}),
        ...(env ? { env } : {}),
      });
      if (!res.ok) throw new Error(res.error);
    },

    async removePeer({ tenantId, routerId, peerId }) {
      const res = await vpsCall({
        method: "DELETE",
        path: `/v1/peers/${encodeURIComponent(peerId)}`,
        scope: "peers:remove",
        tenantId,
        routerId,
        requestedBy,
        body: {
          requestedBy,
          idempotencyKey: `wg-peer:${routerId}:remove`,
        },
        ...(fetchImpl ? { fetchImpl } : {}),
        ...(env ? { env } : {}),
      });
      if (!res.ok && res.status !== 404) throw new Error(res.error);
    },
  };
}
