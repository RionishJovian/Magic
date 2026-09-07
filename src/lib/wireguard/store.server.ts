// Supabase-backed PeerStore for the WireGuard peer lifecycle service.
//
// Mapping onto router_connections:
//   peerId     -> cloud_peer_id
//   address    -> tunnel_address   (globally UNIQUE partial index)
//   publicKey  -> cloud_wg_public_key
//   status     -> active   = connection_mode 'hub' + peer id present
//                 disabled = peer id present, mode back to 'direct'
//                 removed  = every cloud/tunnel field cleared
//
// The taken-address set MUST be global (the hub pool is shared by all
// tenants), so that one read uses the admin client. Everything else stays on
// the caller's RLS-scoped client.

import type { DatabaseClient } from "../database.types";
import type { PeerRecord, PeerStore } from "./peers.server";

type Row = {
  owner_id: string;
  cloud_peer_id: string | null;
  tunnel_address: string | null;
  cloud_wg_public_key: string | null;
  connection_mode: string | null;
};

export async function globallyTakenAddresses(): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("router_connections")
    .select("tunnel_address")
    .not("tunnel_address", "is", null);
  if (error) throw new Error("The WireGuard address pool could not be read right now.");
  return (data ?? [])
    .map((r: { tunnel_address: string | null }) => r.tunnel_address ?? "")
    .filter(Boolean);
}

export function routerPeerStore(supabase: DatabaseClient, routerId: string): PeerStore {
  return {
    async findByRouter(id: string): Promise<PeerRecord | null> {
      const { data, error } = await supabase
        .from("router_connections")
        .select("owner_id, cloud_peer_id, tunnel_address, cloud_wg_public_key, connection_mode")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = data as Row | null;
      if (!row?.cloud_peer_id || !row.tunnel_address) return null;
      return {
        peerId: row.cloud_peer_id,
        routerId: id,
        tenantId: row.owner_id,
        address: row.tunnel_address,
        publicKey: row.cloud_wg_public_key ?? "",
        status: row.connection_mode === "hub" ? "active" : "disabled",
      };
    },

    // Global across every tenant — the hub subnet is shared.
    async addressTaken(address: string, exceptRouterId: string): Promise<boolean> {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("router_connections")
        .select("id")
        .eq("tunnel_address", address)
        .neq("id", exceptRouterId)
        .limit(1);
      if (error) throw new Error("The WireGuard address pool could not be read right now.");
      return (data ?? []).length > 0;
    },

    async save(peer: PeerRecord): Promise<void> {
      const { error } = await supabase
        .from("router_connections")
        .update({
          connection_mode: "hub",
          cloud_peer_id: peer.peerId,
          tunnel_address: peer.address,
          cloud_wg_address: peer.address,
          cloud_wg_public_key: peer.publicKey,
          cloud_status: "connecting",
          cloud_last_error: null,
        } as never)
        .eq("id", peer.routerId);
      if (error) {
        // Preserve the Postgres code so isAddressConflict() can classify a
        // unique-index collision and the service can retry allocation.
        const conflict = new Error(error.message) as Error & { code?: string };
        conflict.code = error.code;
        throw conflict;
      }
    },

    async setStatus(peerId: string, status: PeerRecord["status"]): Promise<void> {
      const patch =
        status === "removed"
          ? {
              connection_mode: "direct",
              cloud_peer_id: null,
              tunnel_address: null,
              cloud_wg_address: null,
              cloud_wg_public_key: null,
              cloud_wg_private_key_ciphertext: null,
              cloud_status: "pending",
              cloud_last_handshake_at: null,
              cloud_last_seen_at: null,
              cloud_last_error: null,
            }
          : status === "disabled"
            ? { connection_mode: "direct", cloud_status: "offline" }
            : { connection_mode: "hub", cloud_status: "connecting" };

      const { error } = await supabase
        .from("router_connections")
        .update(patch as never)
        .eq("id", routerId)
        .eq("cloud_peer_id", peerId);
      if (error) throw new Error(error.message);
    },
  };
}
