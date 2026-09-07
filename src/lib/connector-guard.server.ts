/**
 * Server-side safety rails for everything a local connector may ask for.
 *
 * Two invariants:
 *  - the authenticated bearer token alone decides connector_id / owner_id;
 *    request bodies never carry tenancy;
 *  - a connector job may only target a private LAN address over a supported
 *    method and scheme, with no credentials, redirects or dangerous headers.
 */

/** Headers a caller is never allowed to set on a device request. */
const FORBIDDEN_HEADERS = new Set([
  "host",
  "cookie",
  "set-cookie",
  "proxy-authorization",
  "x-forwarded-for",
  "x-forwarded-host",
  "forwarded",
  "transfer-encoding",
  "upgrade",
  "connection",
]);

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);

export const MAX_JOB_BODY_BYTES = 512_000;

export function isPrivateIPv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => n < 0 || n > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 127) return true;
  return false;
}

/**
 * Routers bound to a Local Connector must use a private LAN IPv4 — the agent
 * reaches them on-site; the cloud must never dial that address.
 */
export function assertConnectorLanEndpoint(
  host: string,
  port: unknown,
): {
  host: string;
  port: number;
} {
  const trimmed = String(host ?? "").trim();
  if (!isPrivateIPv4(trimmed)) {
    throw new Error(
      "Local Connector routers must use a private LAN IPv4 address (for example 192.168.88.1).",
    );
  }
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("The port must be between 1 and 65535.");
  }
  return { host: trimmed, port };
}

export type JobTargetInput = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
};

export type JobTargetResult =
  | { ok: true; url: string; method: string; headers: Record<string, string> }
  | { ok: false; error: string };

export function validateJobTarget(input: JobTargetInput): JobTargetResult {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return { ok: false, error: "Invalid target URL" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Only http and https targets are allowed" };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Credentials must not be embedded in the target URL" };
  }
  if (!isPrivateIPv4(url.hostname)) {
    return { ok: false, error: "Only private LAN IPv4 targets are allowed" };
  }

  const method = (input.method ?? "GET").toUpperCase();
  if (!ALLOWED_METHODS.has(method)) return { ok: false, error: `Unsupported method ${method}` };

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.headers ?? {})) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_HEADERS.has(lower)) return { ok: false, error: `Header ${lower} is not allowed` };
    if (value.length > 4096) return { ok: false, error: `Header ${lower} is too large` };
    headers[lower] = value;
  }

  if (input.body && Buffer.byteLength(input.body) > MAX_JOB_BODY_BYTES) {
    return { ok: false, error: "Request body exceeds the connector job size limit" };
  }

  return { ok: true, url: url.toString(), method, headers };
}

/** Atomic, cross-instance rate limit backed by connector_rate_limits. */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("connector_rate_hit", {
    _key: key,
    _limit: limit,
    _window_seconds: windowSeconds,
  });
  // Fail closed on an unexpected error, so a broken limiter cannot become a hole.
  if (error) return false;
  return data === true;
}

/** Structured, secret-free audit row for a connector action. */
export async function auditConnector(entry: {
  connectorId: string;
  ownerId: string;
  action: string;
  status?: string;
  discoveredRouterId?: string | null;
  detail?: Record<string, unknown>;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { redactDeep } = await import("./redact.server");
  await supabaseAdmin.from("connector_bootstrap_audit").insert({
    connector_id: entry.connectorId,
    owner_id: entry.ownerId,
    action: entry.action,
    status: entry.status ?? "ok",
    discovered_router_id: entry.discoveredRouterId ?? null,
    detail: JSON.parse(JSON.stringify(redactDeep(entry.detail ?? {}))),
  });
}
