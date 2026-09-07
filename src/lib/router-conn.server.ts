// Shared helper: load a router connection row and return the decrypted
// RouterConn shape used by mikrotik.server. Kept server-only (.server.ts) so
// the crypto/admin imports never leak into the client bundle.
import type { RouterConn } from "./mikrotik.server";
import type { DatabaseClient } from "./database.types";
import { isHubMode } from "./connection-mode";

const SELECT =
  "id, owner_id, host, port, username, password_ciphertext, use_tls, allow_insecure_tls, connection_mode, connector_id, cloud_peer_id, is_virtual";

type UnlockCheck = (supabase: DatabaseClient, routerId: string) => Promise<void>;

export async function loadRouterConn(
  supabase: DatabaseClient,
  routerId: string,
  accessClient: DatabaseClient = supabase,
  unlockCheck?: UnlockCheck,
): Promise<RouterConn> {
  const { data, error } = await supabase
    .from("router_connections")
    .select(SELECT)
    .eq("id", routerId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Router not found");
  if (unlockCheck) {
    await unlockCheck(accessClient, routerId);
  } else {
    const { assertRouterUnlockActive } = await import("./router-unlock-key.server");
    await assertRouterUnlockActive(accessClient, routerId);
  }
  const { isVirtualRouter, SANDBOX_REMOVED_MESSAGE } = await import("./test-router");
  if (
    isVirtualRouter({
      is_virtual: (data as { is_virtual?: boolean | null }).is_virtual,
      connection_mode: data.connection_mode as string | null,
    })
  ) {
    throw new Error(SANDBOX_REMOVED_MESSAGE);
  }
  const { decryptSecret } = await import("./crypto.server");

  // Magic Hub wins over a leftover connector_id: the stored host is a label
  // (often CGNAT) and must never be dialled. Legacy rows used mode "cloud".
  if (isHubMode(data.connection_mode as string | null)) {
    if (!data.cloud_peer_id) {
      throw new Error(
        "Connect via Hub first — this board has no WireGuard peer yet, so the cloud will not dial its hostname.",
      );
    }
    const { cloudRestBase } = await import("./cloud-vps.server");
    return {
      host: data.host,
      port: data.port,
      username: data.username,
      password: decryptSecret(data.password_ciphertext),
      useTls: data.use_tls,
      allowInsecureTls: data.allow_insecure_tls === true,
      baseUrlOverride: cloudRestBase(data.cloud_peer_id as string),
    };
  }

  // Local connector: the agent sits on the LAN, so the device is reached at
  // its local address. Direct Cloud Remote does not apply.
  if (data.connector_id) {
    // Pin the SHA-256 fingerprint discovered for this LAN IP so the agent can
    // accept MikroTik's self-signed cert without disabling verification.
    let tlsFingerprint: string | null = null;
    try {
      const { data: discovered } = await supabase
        .from("connector_discovered_routers")
        .select("tls_fingerprint")
        .eq("connector_id", data.connector_id)
        .eq("ip", data.host)
        .not("tls_fingerprint", "is", null)
        .limit(1)
        .maybeSingle();
      tlsFingerprint = discovered?.tls_fingerprint ?? null;
    } catch {
      tlsFingerprint = null;
    }
    return {
      host: data.host,
      port: data.port,
      username: data.username,
      password: decryptSecret(data.password_ciphertext),
      useTls: data.use_tls,
      allowInsecureTls: data.allow_insecure_tls === true,
      connectorId: data.connector_id as string,
      tlsFingerprint,
    };
  }

  return {
    host: data.host,
    port: data.port,
    username: data.username,
    password: decryptSecret(data.password_ciphertext),
    useTls: data.use_tls,
    allowInsecureTls: data.allow_insecure_tls === true,
  };
}

/** Load with the service-role row reader and an owner-scoped scheduled check. */
export async function loadRouterConnForOwner(
  supabase: DatabaseClient,
  routerId: string,
  ownerId: string,
): Promise<RouterConn> {
  const { assertRouterUnlockActiveForOwner } = await import("./router-unlock-key.server");
  return loadRouterConn(
    supabase,
    routerId,
    supabase,
    (accessClient, id) => assertRouterUnlockActiveForOwner(accessClient, id, ownerId),
  );
}
