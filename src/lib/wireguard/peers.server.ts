// Idempotent WireGuard peer lifecycle service (Phase 2/3 server foundation).
//
// One router = at most one peer = exactly one management /32 taken from a
// GLOBALLY shared hub address pool (the hub subnet is shared by every tenant,
// so uniqueness can never be tenant-scoped).
//
// The service is written against small ports (store + provisioner) so it stays
// testable and so no browser input can reach the VPS adapter.

import {
  assertManagementOnlyRoutes,
  assertExactManagementRoute,
  isManagementAddress,
  ROUTE_REJECTED,
} from "./routes";
import type { PeerRouteRequest } from "./routes";

export type PeerRecord = {
  peerId: string;
  routerId: string;
  tenantId: string;
  address: string; // always a /32
  publicKey: string;
  status: "active" | "disabled" | "removed";
};

export type PeerStore = {
  findByRouter(routerId: string): Promise<PeerRecord | null>;
  /** Globally unique across ALL tenants — the hub pool is shared. */
  addressTaken(address: string, routerId: string): Promise<boolean>;
  /**
   * Must be backed by a UNIQUE constraint on the address. Under concurrency it
   * throws; `isAddressConflict` classifies that throw so allocation retries.
   */
  save(peer: PeerRecord): Promise<void>;
  setStatus(peerId: string, status: PeerRecord["status"]): Promise<void>;
};

export type ProvisionedPeer = {
  peerId: string;
  publicKey: string;
  address: string;
  /** Mandatory: an unscoped provisioner response is never trusted. */
  tenantId: string;
  routerId: string;
  /** Mandatory: exactly one entry, equal to the allocated management /32. */
  allowedIps: string[];
};

export type Provisioner = {
  createPeer(input: {
    tenantId: string;
    routerId: string;
    address: string;
    idempotencyKey: string;
  }): Promise<ProvisionedPeer>;
  inspectPeer(input: { tenantId: string; routerId: string; peerId: string }): Promise<{
    status: "online" | "offline" | "disabled" | "unknown";
    lastHandshakeAt: string | null;
    tenantId: string;
    routerId: string;
  }>;
  disablePeer(input: { tenantId: string; routerId: string; peerId: string }): Promise<void>;
  removePeer(input: { tenantId: string; routerId: string; peerId: string }): Promise<void>;
};

export type PeerAuditAction =
  | "wg_peer_created"
  | "wg_peer_inspected"
  | "wg_peer_disabled"
  | "wg_peer_removed"
  | "wg_peer_validation_failed"
  | "wg_peer_persist_failed"
  | "wg_peer_compensated"
  | "wg_peer_mismatch";

export type LifecycleDeps = {
  store: PeerStore;
  provisioner: Provisioner;
  /**
   * Optional allocator used to retry when the globally shared pool hands out an
   * address that another tenant just claimed.
   */
  allocateAddress?: (attempt: number) => Promise<string | null> | string | null;
  audit?: (entry: {
    action: PeerAuditAction;
    outcome: "ok" | "failed" | "blocked";
    detail?: string;
  }) => Promise<void> | void;
};

export const ONE_PEER_PER_ROUTER =
  "This router already has a WireGuard peer. Remove the existing peer before creating another.";
export const ADDRESS_TAKEN = "That management address is already in use on the WireGuard hub.";
export const INVALID_PEER_RESPONSE =
  "The WireGuard provisioner returned an incomplete or mismatched peer.";
export const PEER_SCOPE_MISMATCH =
  "This WireGuard peer does not belong to the requested tenant and router.";

const MAX_ALLOCATION_ATTEMPTS = 3;

/** Deterministic idempotency key: the same router + address never double-provisions. */
export function peerIdempotencyKey(tenantId: string, routerId: string, address: string): string {
  return `wg:${tenantId}:${routerId}:${address}`;
}

/** True when a store write failed because the shared address pool collided. */
export function isAddressConflict(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const code = (e as { code?: string } | null)?.code;
  return code === "23505" || /duplicate key|unique constraint|already in use/i.test(msg);
}

/** Requirement 4: every field of a create response is validated before use. */
export function validateProvisionedPeer(
  peer: ProvisionedPeer | null | undefined,
  expected: { tenantId: string; routerId: string; address: string },
): asserts peer is ProvisionedPeer {
  if (!peer) throw new Error(INVALID_PEER_RESPONSE);
  if (typeof peer.peerId !== "string" || peer.peerId.trim() === "")
    throw new Error(INVALID_PEER_RESPONSE);
  if (typeof peer.publicKey !== "string" || peer.publicKey.trim() === "")
    throw new Error(INVALID_PEER_RESPONSE);
  if (typeof peer.tenantId !== "string" || peer.tenantId !== expected.tenantId)
    throw new Error(INVALID_PEER_RESPONSE);
  if (typeof peer.routerId !== "string" || peer.routerId !== expected.routerId)
    throw new Error(INVALID_PEER_RESPONSE);
  if (!Array.isArray(peer.allowedIps)) throw new Error(ROUTE_REJECTED);
  if (!isManagementAddress(peer.address)) throw new Error(ROUTE_REJECTED);
  assertExactManagementRoute(expected.address, peer.address, peer.allowedIps);
}

function assertPeerScope(
  peer: { tenantId: string; routerId: string },
  expected: { tenantId: string; routerId: string },
): void {
  if (peer.tenantId !== expected.tenantId || peer.routerId !== expected.routerId)
    throw new Error(PEER_SCOPE_MISMATCH);
}

export async function ensurePeer(
  deps: LifecycleDeps,
  input: { tenantId: string; routerId: string; routes: PeerRouteRequest },
): Promise<{ peer: PeerRecord; created: boolean }> {
  try {
    assertManagementOnlyRoutes(input.routes);
  } catch (e) {
    await deps.audit?.({ action: "wg_peer_created", outcome: "blocked", detail: ROUTE_REJECTED });
    throw e;
  }

  const existing = await deps.store.findByRouter(input.routerId);
  if (existing && existing.status !== "removed") {
    assertPeerScope(existing, input);
    // Retry-safe: one peer per router — return the stored peer as-is. The
    // Singapore Hub allocates the /32, so the caller may not know the address
    // on a reuse path.
    return { peer: existing, created: false };
  }

  let address = input.routes.address;
  let lastConflict: Error | null = null;

  for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      const next = await deps.allocateAddress?.(attempt);
      if (!next || !isManagementAddress(next)) break;
      address = next;
    }

    // Cheap pre-check; the UNIQUE constraint below is the real guarantee.
    // Skipped when the hub will allocate (createPeer may ignore `address`).
    if (await deps.store.addressTaken(address, input.routerId)) {
      lastConflict = new Error(ADDRESS_TAKEN);
      if (deps.allocateAddress) continue;
      break;
    }

    let created: ProvisionedPeer;
    try {
      created = await deps.provisioner.createPeer({
        tenantId: input.tenantId,
        routerId: input.routerId,
        address,
        idempotencyKey: peerIdempotencyKey(input.tenantId, input.routerId, address),
      });
    } catch (e) {
      await deps.audit?.({
        action: "wg_peer_created",
        outcome: "failed",
        detail: "provisioner_error",
      });
      throw e;
    }

    try {
      // Hub-allocated address wins over any placeholder the caller supplied.
      validateProvisionedPeer(created, {
        tenantId: input.tenantId,
        routerId: input.routerId,
        address: created.address,
      });
    } catch (e) {
      await deps.audit?.({
        action: "wg_peer_validation_failed",
        outcome: "blocked",
        detail: e instanceof Error ? e.message : "invalid_peer_response",
      });
      await compensate(deps, {
        tenantId: input.tenantId,
        routerId: input.routerId,
        peerId: typeof created?.peerId === "string" ? created.peerId : "",
      });
      throw e;
    }

    const peer: PeerRecord = {
      peerId: created.peerId,
      routerId: input.routerId,
      tenantId: input.tenantId,
      address: created.address,
      publicKey: created.publicKey,
      status: "active",
    };

    try {
      await deps.store.save(peer);
    } catch (e) {
      await deps.audit?.({
        action: "wg_peer_persist_failed",
        outcome: "failed",
        detail: isAddressConflict(e) ? "address_conflict" : "persist_error",
      });
      // Compensation: the peer exists on the hub but not in our records.
      await compensate(deps, {
        tenantId: input.tenantId,
        routerId: input.routerId,
        peerId: peer.peerId,
      });
      if (isAddressConflict(e) && deps.allocateAddress) {
        lastConflict = new Error(ADDRESS_TAKEN);
        continue;
      }
      throw e; // primary error is never masked
    }

    await deps.audit?.({ action: "wg_peer_created", outcome: "ok", detail: peer.address });
    return { peer, created: true };
  }

  throw lastConflict ?? new Error(ADDRESS_TAKEN);
}

/** Best-effort signed removal; its own failure never replaces the primary error. */
async function compensate(
  deps: LifecycleDeps,
  input: { tenantId: string; routerId: string; peerId: string },
): Promise<void> {
  if (!input.peerId) return;
  try {
    await deps.provisioner.removePeer(input);
    await deps.audit?.({ action: "wg_peer_compensated", outcome: "ok" });
  } catch {
    await deps.audit?.({
      action: "wg_peer_compensated",
      outcome: "failed",
      detail: "orphan_peer_needs_cleanup",
    });
  }
}

export async function inspectPeer(
  deps: LifecycleDeps,
  input: { tenantId: string; routerId: string },
) {
  const peer = await deps.store.findByRouter(input.routerId);
  if (!peer || peer.status === "removed") return { peer: null, status: "unknown" as const };
  try {
    assertPeerScope(peer, input);
  } catch (e) {
    await deps.audit?.({ action: "wg_peer_mismatch", outcome: "blocked", detail: "stored_scope" });
    throw e;
  }
  const status = await deps.provisioner.inspectPeer({
    tenantId: input.tenantId,
    routerId: input.routerId,
    peerId: peer.peerId,
  });
  if (
    typeof status.tenantId !== "string" ||
    status.tenantId !== input.tenantId ||
    typeof status.routerId !== "string" ||
    status.routerId !== input.routerId
  ) {
    await deps.audit?.({
      action: "wg_peer_mismatch",
      outcome: "blocked",
      detail: "response_scope",
    });
    throw new Error(PEER_SCOPE_MISMATCH);
  }
  await deps.audit?.({ action: "wg_peer_inspected", outcome: "ok", detail: status.status });
  return { peer, ...status };
}

export async function disablePeer(
  deps: LifecycleDeps,
  input: { tenantId: string; routerId: string },
): Promise<{ changed: boolean }> {
  const peer = await deps.store.findByRouter(input.routerId);
  if (!peer || peer.status !== "active") return { changed: false };
  try {
    assertPeerScope(peer, input);
  } catch (e) {
    await deps.audit?.({ action: "wg_peer_mismatch", outcome: "blocked", detail: "stored_scope" });
    throw e;
  }
  await deps.provisioner.disablePeer({
    tenantId: input.tenantId,
    routerId: input.routerId,
    peerId: peer.peerId,
  });
  await deps.store.setStatus(peer.peerId, "disabled");
  await deps.audit?.({ action: "wg_peer_disabled", outcome: "ok" });
  return { changed: true };
}

export async function removePeer(
  deps: LifecycleDeps,
  input: { tenantId: string; routerId: string },
): Promise<{ changed: boolean }> {
  const peer = await deps.store.findByRouter(input.routerId);
  if (!peer || peer.status === "removed") return { changed: false };
  try {
    assertPeerScope(peer, input);
  } catch (e) {
    await deps.audit?.({ action: "wg_peer_mismatch", outcome: "blocked", detail: "stored_scope" });
    throw e;
  }
  await deps.provisioner.removePeer({
    tenantId: input.tenantId,
    routerId: input.routerId,
    peerId: peer.peerId,
  });
  await deps.store.setStatus(peer.peerId, "removed");
  await deps.audit?.({ action: "wg_peer_removed", outcome: "ok" });
  return { changed: true };
}
