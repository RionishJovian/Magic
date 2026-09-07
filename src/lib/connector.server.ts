// Local Connector (bridge) transport layer.
//
// The cloud never dials into the customer LAN. A small connector process runs
// on-site, opens an outbound HTTPS connection to /api/public/connector/*, picks
// up queued jobs and posts the results back. Everything here is server-only.

import { createHash, randomBytes } from "node:crypto";

/** A connector is considered online while it keeps heart-beating. */
export const CONNECTOR_ONLINE_WINDOW_MS = 90_000;
/** How long a cloud-side caller waits for the connector to answer a job. */
const JOB_TIMEOUT_MS = 25_000;
const POLL_INTERVAL_MS = 400;

export class ConnectorOfflineError extends Error {
  constructor(name?: string | null) {
    super(
      `Connector offline${name ? ` (${name})` : ""} — the local MikroTik Magic Connector is not connected, so this device cannot be reached right now.`,
    );
    this.name = "ConnectorOfflineError";
  }
}

export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Short, human-typeable one-time pairing code. */
export function newPairingCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
    if (i % 4 === 3 && i !== 11) out += "-";
  }
  return out;
}

export function newPublicId(): string {
  return `cn_${randomBytes(8).toString("hex")}`;
}

export type ConnectorRow = {
  id: string;
  owner_id: string;
  name: string;
  enabled: boolean;
  status: string;
  last_seen_at: string | null;
};

export function isConnectorOnline(row: {
  enabled?: boolean | null;
  status?: string | null;
  last_seen_at?: string | null;
}): boolean {
  if (!row.enabled) return false;
  if (row.status !== "online") return false;
  if (!row.last_seen_at) return false;
  return Date.now() - new Date(row.last_seen_at).getTime() < CONNECTOR_ONLINE_WINDOW_MS;
}

export type ConnectorHttpRequest = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
  /**
   * SHA-256 certificate fingerprint the operator confirmed during local setup.
   * A self-signed router certificate is accepted only when it matches exactly;
   * verification is never globally disabled.
   */
  tlsFingerprint?: string | null;
};

export type ConnectorHttpResponse = {
  status: number;
  statusText?: string;
  headers?: Record<string, string>;
  body?: string;
};

/**
 * Dispatch a single HTTP request to a device through a local connector and
 * return it as a normal Response, so callers keep their existing code shape.
 */
export async function connectorFetch(
  connectorId: string,
  req: ConnectorHttpRequest,
): Promise<Response> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { validateJobTarget } = await import("./connector-guard.server");

  const target = validateJobTarget(req);
  if (!target.ok) throw new Error(target.error);

  const { data: connector } = await supabaseAdmin
    .from("connectors")
    .select("id, owner_id, name, enabled, status, last_seen_at")
    .eq("id", connectorId)
    .maybeSingle();

  if (!connector) throw new ConnectorOfflineError();
  if (!isConnectorOnline(connector)) throw new ConnectorOfflineError(connector.name);

  // A RouterOS box normally serves a self-signed certificate. TLS verification
  // is never globally disabled; instead the connector pins the exact SHA-256
  // fingerprint the operator confirmed during local setup. Callers may pass it
  // explicitly; otherwise resolve it from the device this connector discovered
  // at the same LAN address, so proxied HTTPS keeps working end to end.
  let fingerprint = req.tlsFingerprint ?? null;
  if (!fingerprint && target.url.startsWith("https://")) {
    try {
      const host = new URL(target.url).hostname;
      const { data: discovered } = await supabaseAdmin
        .from("connector_discovered_routers")
        .select("tls_fingerprint")
        .eq("connector_id", connector.id)
        .eq("ip", host)
        .not("tls_fingerprint", "is", null)
        .limit(1)
        .maybeSingle();
      fingerprint = discovered?.tls_fingerprint ?? null;
    } catch {
      fingerprint = null;
    }
  }

  const { data: job, error } = await supabaseAdmin
    .from("connector_jobs")
    .insert({
      connector_id: connector.id,
      owner_id: connector.owner_id,
      kind: "http",
      request: JSON.parse(
        JSON.stringify({
          url: target.url,
          method: target.method,
          headers: target.headers,
          body: req.body ?? null,
          tlsFingerprint: fingerprint,
        }),
      ),
      expires_at: new Date(Date.now() + JOB_TIMEOUT_MS).toISOString(),
    })
    .select("id")
    .single();
  if (error || !job) throw new Error(error?.message ?? "Could not queue connector job");

  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const { data: row } = await supabaseAdmin
      .from("connector_jobs")
      .select("status, response, error")
      .eq("id", job.id)
      .maybeSingle();
    if (!row) break;
    if (row.status === "done") {
      const res = (row.response ?? {}) as ConnectorHttpResponse;
      return new Response(res.body ?? "", {
        status: res.status ?? 200,
        statusText: res.statusText ?? "",
        headers: res.headers ?? {},
      });
    }
    if (row.status === "failed") {
      throw new Error(row.error ?? "The local connector could not reach this device.");
    }
  }

  await supabaseAdmin
    .from("connector_jobs")
    .update({ status: "expired", error: "timed out waiting for the connector" })
    .eq("id", job.id);
  throw new Error(
    "The local connector did not answer in time. Check that it is running and can reach this device.",
  );
}

/** Resolve which connector (if any) a device row is bound to. */
export function connectorIdOf(row: { connector_id?: string | null }): string | null {
  return row.connector_id ?? null;
}
