// Wires the WireGuard peer lifecycle service to real infrastructure:
// Supabase peer store + globally shared address pool + signed VPS provisioner
// + the router operations audit log.
//
// The browser never supplies an address, hub URL or key material — everything
// here is derived server-side from the authorized router.

import type { DatabaseClient } from "../database.types";
import { recordRouterOp } from "../audit.server";
import { httpProvisioner, type PeerConfigMaterial } from "./provisioner.server";
import { routerPeerStore, globallyTakenAddresses } from "./store.server";
import { nextManagementAddress, DEFAULT_HUB_SUBNET } from "./pool";
import type { LifecycleDeps } from "./peers.server";

export function hubSubnet(env: NodeJS.ProcessEnv = process.env): string {
  return env["VPS_ROUTER_WG_SUBNET"] || DEFAULT_HUB_SUBNET;
}

export type PeerDeps = LifecycleDeps & {
  /** One-time router-side material captured from a successful provisioning. */
  config: PeerConfigMaterial;
};

/** Allocate the first free management /32 in the globally shared hub pool. */
export async function allocateManagementAddress(attempt = 0): Promise<string | null> {
  const taken = await globallyTakenAddresses();
  return nextManagementAddress(hubSubnet(), taken, attempt);
}

export function buildPeerDeps(input: {
  supabase: DatabaseClient;
  userId: string;
  ownerId: string;
  routerId: string;
  routerName?: string | null;
  routerPrivateKey?: string;
  routerPublicKey?: string;
  managementRestPort?: number;
}): PeerDeps {
  const config: PeerConfigMaterial = {};
  return {
    config,
    store: routerPeerStore(input.supabase, input.routerId),
    provisioner: httpProvisioner({
      requestedBy: input.userId,
      routerName: input.routerName ?? input.routerId,
      managementRestPort: input.managementRestPort ?? 443,
      ...(input.routerPrivateKey ? { routerPrivateKey: input.routerPrivateKey } : {}),
      ...(input.routerPublicKey ? { routerPublicKey: input.routerPublicKey } : {}),
      onPeerConfig: (c) => Object.assign(config, c),
    }),
    allocateAddress: (attempt) => allocateManagementAddress(attempt),
    audit: async (entry) =>
      recordRouterOp({
        userId: input.userId,
        ownerId: input.ownerId,
        routerId: input.routerId,
        routerName: input.routerName ?? null,
        action: entry.action,
        outcome: entry.outcome,
        detail: entry.detail ?? null,
      }),
  };
}
