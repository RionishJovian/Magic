// HTTP adapter for the restricted VPS WireGuard provisioner (Singapore Hub).
//
// Contract matches the live hub at hub.mikromagic.app:
//   HMAC-SHA256 (base64url) over
//   method\npath\ntimestamp\nrequestId\nscope\ntenantId\nrouterId\nrequestedBy\nrawBody
// with ISO-8601 timestamps and X-MM-*-Id style headers.

import { createHmac, randomUUID } from "node:crypto";
import { explainHubStatus } from "../error-message";

export const VPS_NOT_CONFIGURED =
  "WireGuard provisioning is not configured yet. The app owner must set the VPS provisioner URL and signing secret.";

/**
 * Hub rejected HMAC / key id. Live probes show this is usually hub-side verify
 * (wrong/rotated key on VPS, or old service.mjs), not a missing paste dialog.
 */
export const VPS_UNAUTHORIZED =
  "Magic Hub rejected the signed request (HMAC unauthorized). The live hub is not accepting this app’s signature — replace /opt/mikromagic-hub/service.mjs from deploy/mikromagic-hub/ and run hmac-selftest.mjs on the VPS (or align MM_HUB_SIGNING_KEY with Lovable VPS_ROUTER_API_SIGNING_SECRET). Republish alone will not fix a hub that rejects every signature.";

export type VpsConfig = { baseUrl: string; secret: string; keyId: string };

export function readVpsConfig(env: NodeJS.ProcessEnv = process.env): VpsConfig {
  const baseUrl = (env["VPS_ROUTER_API_URL"] ?? "").trim();
  const secret = (env["VPS_ROUTER_API_SIGNING_SECRET"] ?? "").trim();
  const keyId = (env["VPS_ROUTER_API_KEY_ID"] ?? "").trim();
  if (!baseUrl || !secret || !keyId) throw new Error(VPS_NOT_CONFIGURED);
  return { baseUrl: baseUrl.replace(/\/+$/, ""), secret, keyId };
}

export function isVpsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    (env["VPS_ROUTER_API_URL"] ?? "").trim() &&
    (env["VPS_ROUTER_API_SIGNING_SECRET"] ?? "").trim() &&
    (env["VPS_ROUTER_API_KEY_ID"] ?? "").trim(),
  );
}

/** Public origin used for the unsigned REST data-plane (/peers/{id}/rest). */
export function hubPublicOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const { baseUrl } = readVpsConfig(env);
  return baseUrl.replace(/\/internal\/provisioner\/?$/, "");
}

export type HubScope = "peers:create" | "peers:inspect" | "peers:disable" | "peers:remove";

export function canonicalString(parts: {
  method: string;
  path: string;
  timestamp: string;
  requestId: string;
  scope: string;
  tenantId: string;
  routerId: string;
  requestedBy: string;
  body: string;
}): string {
  return [
    parts.method.toUpperCase(),
    parts.path,
    parts.timestamp,
    parts.requestId,
    parts.scope,
    parts.tenantId,
    parts.routerId,
    parts.requestedBy,
    parts.body,
  ].join("\n");
}

/** Hub HMAC key material candidates (try in order until hub accepts). */
export function hmacKeyCandidates(secret: string): Array<string | Buffer> {
  const s = secret.trim();
  if (/^[0-9a-fA-F]{64}$/.test(s)) {
    // Prefer raw bytes (hub stores openssl-style hex); fall back to UTF-8 of the hex string.
    return [Buffer.from(s, "hex"), s];
  }
  return [s];
}

/** Hub HMAC key material. 64-char hex secrets prefer raw bytes (hub style). */
export function hmacKeyMaterial(secret: string): string | Buffer {
  return hmacKeyCandidates(secret)[0]!;
}

/** Hub signatures are base64url (no padding), not hex. */
export function signRequest(secret: string, canonical: string, key?: string | Buffer): string {
  return createHmac("sha256", key ?? hmacKeyMaterial(secret))
    .update(canonical)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type VpsCallInput = {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  scope: HubScope;
  tenantId: string;
  routerId: string;
  requestedBy: string;
  /** Included in the signed body when the hub requires it (create/disable/remove). */
  body?: unknown;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  requestId?: () => string;
};

export type VpsResult<T> =
  | { ok: true; status: number; data: T }
  | {
      ok: false;
      status: number;
      error: string;
    };

/**
 * One signed call. The response body is read EXACTLY once (`res.text()`), then
 * parsed from that string — never `res.json()` after `res.text()`.
 * For 64-char hex secrets, retries UTF-8 key material if raw-byte HMAC is rejected.
 */
export async function vpsCall<T = unknown>(input: VpsCallInput): Promise<VpsResult<T>> {
  const cfg = readVpsConfig(input.env ?? process.env);
  const doFetch = input.fetchImpl ?? fetch;
  const bodyText = input.body === undefined ? "" : JSON.stringify(input.body);
  const timestamp = new Date(input.now?.() ?? Date.now()).toISOString();
  const requestId = input.requestId?.() ?? randomUUID();
  const canonical = canonicalString({
    method: input.method,
    path: input.path,
    timestamp,
    requestId,
    scope: input.scope,
    tenantId: input.tenantId,
    routerId: input.routerId,
    requestedBy: input.requestedBy,
    body: bodyText,
  });
  const keys = hmacKeyCandidates(cfg.secret);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 12_000);

  try {
    let lastFail: VpsResult<T> | null = null;
    for (let i = 0; i < keys.length; i++) {
      const signature = signRequest(cfg.secret, canonical, keys[i]);
      const res = await doFetch(`${cfg.baseUrl}${input.path}`, {
        method: input.method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-MM-Key-Id": cfg.keyId,
          "X-MM-Timestamp": timestamp,
          "X-MM-Request-Id": requestId,
          "X-MM-Scope": input.scope,
          "X-MM-Tenant-Id": input.tenantId,
          "X-MM-Router-Id": input.routerId,
          "X-MM-Requested-By": input.requestedBy,
          "X-MM-Signature": signature,
        },
        body: bodyText === "" ? undefined : bodyText,
        signal: controller.signal,
      });
      const raw = await res.text();
      let parsed: unknown = undefined;
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = undefined;
        }
      }
      if (res.ok) {
        return { ok: true, status: res.status, data: parsed as T };
      }
      const fail: VpsResult<T> = {
        ok: false,
        status: res.status,
        error: sanitizeError(raw, res.statusText, res.status),
      };
      lastFail = fail;
      const authReject = res.status === 401 || res.status === 403;
      if (!authReject || i === keys.length - 1) return fail;
    }
    return lastFail ?? { ok: false, status: 0, error: VPS_UNAUTHORIZED };
  } catch (e) {
    const message =
      e instanceof Error && e.name === "AbortError"
        ? "The WireGuard provisioner did not respond in time."
        : "The WireGuard provisioner could not be reached.";
    return { ok: false, status: 0, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/** Keeps provisioner internals (and anything secret-shaped) out of the UI. */
export function sanitizeError(raw: string, fallback: string, status = 0): string {
  const text = (raw || fallback || "Request failed").slice(0, 200);
  const lower = text.toLowerCase();
  if (
    status === 401 ||
    status === 403 ||
    /"error"\s*:\s*"unauthorized"/i.test(text) ||
    /\bunauthorized\b/.test(lower) ||
    /\binvalid signature\b/.test(lower) ||
    /\binvalid key\b/.test(lower)
  ) {
    return VPS_UNAUTHORIZED;
  }
  return text
    .replace(/[A-Za-z0-9+/]{40,}={0,2}/g, "[redacted]")
    .replace(/(secret|key|token|signature)"?\s*[:=]\s*"?[^",}\s]+/gi, "$1: [redacted]");
}

export type HubSecretShape = "hex64" | "other" | "missing";

export function describeVpsSecretShape(secret: string): HubSecretShape {
  const s = secret.trim();
  if (!s) return "missing";
  if (/^[0-9a-fA-F]{64}$/.test(s)) return "hex64";
  return "other";
}

export type HubAuthProbe = {
  configured: boolean;
  baseHost: string | null;
  keyIdSet: boolean;
  secretShape: HubSecretShape;
  secretLen: number;
  hubStatus: number | null;
  hubBodyKind: "unauthorized" | "ok" | "nginx" | "other" | "unreachable";
  message: string;
};

/**
 * One throwaway signed PUT against the live hub using current Lovable env.
 * Never returns secret material — only shape + hub response class.
 */
export async function probeHubAuth(opts?: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<HubAuthProbe> {
  const env = opts?.env ?? process.env;
  if (!isVpsConfigured(env)) {
    return {
      configured: false,
      baseHost: null,
      keyIdSet: false,
      secretShape: "missing",
      secretLen: 0,
      hubStatus: null,
      hubBodyKind: "unreachable",
      message: VPS_NOT_CONFIGURED,
    };
  }
  const cfg = readVpsConfig(env);
  let baseHost: string | null = null;
  try {
    baseHost = new URL(cfg.baseUrl).host;
  } catch {
    baseHost = cfg.baseUrl.slice(0, 80);
  }
  const secretShape = describeVpsSecretShape(cfg.secret);
  const routerId = `probe-${randomUUID()}`;
  const res = await vpsCall({
    method: "PUT",
    path: `/v1/peers/by-router/${encodeURIComponent(routerId)}`,
    scope: "peers:create",
    tenantId: "probe-tenant",
    routerId,
    requestedBy: "probe",
    body: {
      tenantId: "probe-tenant",
      routerId,
      requestedBy: "probe",
      idempotencyKey: `wg-peer:${routerId}:create`,
      routerPublicKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      routerName: "probe",
      managementRestPort: 443,
    },
    timeoutMs: 8_000,
    ...(opts?.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    env,
    ...(opts?.now ? { now: opts.now } : {}),
  });
  if (res.ok) {
    return {
      configured: true,
      baseHost,
      keyIdSet: Boolean(cfg.keyId),
      secretShape,
      secretLen: cfg.secret.length,
      hubStatus: res.status,
      hubBodyKind: "ok",
      message: "Hub accepted a signed create — Connect via Hub should work.",
    };
  }
  const err = res.error || "";
  const nginx = /authorization required|nginx/i.test(err);
  const unauth = err === VPS_UNAUTHORIZED || /unauthorized/i.test(err);
  return {
    configured: true,
    baseHost,
    keyIdSet: Boolean(cfg.keyId),
    secretShape,
    secretLen: cfg.secret.length,
    hubStatus: res.status,
    hubBodyKind:
      res.status === 0 ? "unreachable" : nginx ? "nginx" : unauth ? "unauthorized" : "other",
    message: unauth ? VPS_UNAUTHORIZED : explainHubStatus(res.status, err),
  };
}
