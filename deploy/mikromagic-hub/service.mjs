#!/usr/bin/env node
/**
 * MikroTik Magic — Singapore hub peer control plane (drop-in).
 *
 * Matches app signer in src/lib/wireguard/vps.server.ts exactly:
 *   HMAC-SHA256 base64url over
 *   method\npath\ntimestamp\nrequestId\nscope\ntenantId\nrouterId\nrequestedBy\nrawBody
 * 64-char hex MM_HUB_SIGNING_KEY → raw key bytes (UTF-8 of hex also accepted).
 *
 * Install on the VPS (as root / with sudo):
 *   install -m 755 deploy/mikromagic-hub/service.mjs /opt/mikromagic-hub/service.mjs
 *   systemctl restart mikromagic-hub-peer
 *   node /opt/mikromagic-hub/hmac-selftest.mjs
 *
 * Env (/etc/mikromagic-hub/env):
 *   MM_HUB_SIGNING_KEY_ID=v1
 *   MM_HUB_SIGNING_KEY=<64 hex or passphrase>
 *   MM_HUB_LISTEN=127.0.0.1:8787
 *   MM_HUB_WG_INTERFACE=wg0
 *   MM_HUB_ENDPOINT=hub.mikromagic.app:51820
 *   MM_HUB_PUBLIC_KEY=<optional; else `wg show iface public-key`>
 *   MM_HUB_PEERS_PATH=/var/lib/mikromagic-hub/peers.json
 *   MM_HUB_SUBNET=10.77.0.0/24
 *   MM_HUB_SKEW_MS=300000
 */

import http from "node:http";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** systemd EnvironmentFile often leaves quotes; bash `. env` strips them. */
export function cleanEnvValue(value) {
  let v = String(value ?? "").trim();
  if (
    (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
    (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

const env = process.env;
const KEY_ID = cleanEnvValue(env.MM_HUB_SIGNING_KEY_ID || "v1") || "v1";
const SECRET = cleanEnvValue(env.MM_HUB_SIGNING_KEY || "");
const LISTEN = cleanEnvValue(env.MM_HUB_LISTEN || "127.0.0.1:8787") || "127.0.0.1:8787";
const WG_IFACE = cleanEnvValue(env.MM_HUB_WG_INTERFACE || "wg0") || "wg0";
const ENDPOINT =
  cleanEnvValue(env.MM_HUB_ENDPOINT || "hub.mikromagic.app:51820") || "hub.mikromagic.app:51820";
const PEERS_PATH =
  cleanEnvValue(env.MM_HUB_PEERS_PATH || "/var/lib/mikromagic-hub/peers.json") ||
  "/var/lib/mikromagic-hub/peers.json";
const SUBNET = cleanEnvValue(env.MM_HUB_SUBNET || "10.77.0.0/24") || "10.77.0.0/24";
const SKEW_MS = Number(cleanEnvValue(env.MM_HUB_SKEW_MS || "") || 300_000);
const HUB_ROUTE = SUBNET.replace(/\.0\/24$/, ".1/32");
const WEBFIG_LAUNCH_MAX_MS = Number(
  cleanEnvValue(env.MM_HUB_WEBFIG_LAUNCH_MAX_MS || "") || 120_000,
);
const WEBFIG_SESSION_MS = Number(cleanEnvValue(env.MM_HUB_WEBFIG_SESSION_MS || "") || 1_800_000);

function hmacKeyCandidates(secret) {
  const s = secret.trim();
  if (/^[0-9a-fA-F]{64}$/.test(s)) return [Buffer.from(s, "hex"), s];
  return [s];
}

function signCanonical(key, canonical) {
  return createHmac("sha256", key)
    .update(canonical)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function safeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function canonicalString(parts) {
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

export function webfigTokenCanonical(scope, peerId, expiresAt) {
  return [scope, peerId, String(expiresAt)].join("\n");
}

export function signWebfigToken(secret, scope, peerId, expiresAt) {
  return signCanonical(
    hmacKeyCandidates(secret)[0],
    webfigTokenCanonical(scope, peerId, expiresAt),
  );
}

export function verifyWebfigToken({
  secret,
  scope,
  peerId,
  expiresAt,
  signature,
  now = Date.now(),
  maxFutureMs,
}) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(peerId || ""))) return false;
  if (!/^\d{10,16}$/.test(String(expiresAt || ""))) return false;
  const expires = Number(expiresAt);
  if (!Number.isSafeInteger(expires) || expires <= now) return false;
  if (Number.isFinite(maxFutureMs) && expires > now + maxFutureMs) return false;
  const canonical = webfigTokenCanonical(scope, peerId, expiresAt);
  return hmacKeyCandidates(secret).some((key) =>
    safeEqualStr(signCanonical(key, canonical), signature),
  );
}

/**
 * App signs `/v1/...` while nginx may forward `/internal/provisioner/v1/...`.
 * Always verify + route on the app-facing path.
 */
export function normalizeProvisionerPath(pathname) {
  const raw = String(pathname || "/");
  const prefixes = ["/internal/provisioner", "/provisioner"];
  for (const prefix of prefixes) {
    if (raw === prefix) return "/";
    if (raw.startsWith(prefix + "/")) {
      const stripped = raw.slice(prefix.length);
      return stripped.startsWith("/") ? stripped : `/${stripped}`;
    }
  }
  return raw;
}

export function verifySignature({ secret, canonical, signature }) {
  const sig = String(signature || "").trim();
  if (!sig) return false;
  for (const key of hmacKeyCandidates(secret)) {
    if (safeEqualStr(signCanonical(key, canonical), sig)) return true;
  }
  return false;
}

function hubPublicKey() {
  const fromEnv = (env.MM_HUB_PUBLIC_KEY || "").trim();
  if (fromEnv) return fromEnv;
  try {
    return execFileSync("wg", ["show", WG_IFACE, "public-key"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error("Cannot read WireGuard public key (set MM_HUB_PUBLIC_KEY)");
  }
}

function loadPeers() {
  try {
    const raw = fs.readFileSync(PEERS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed.peers) ? parsed.peers : [];
  } catch {
    return [];
  }
}

function savePeers(peers) {
  fs.mkdirSync(path.dirname(PEERS_PATH), { recursive: true });
  fs.writeFileSync(PEERS_PATH, JSON.stringify({ peers }, null, 2));
}

function subnetBase() {
  const m = /^(\d+\.\d+\.\d+)\.0\/24$/.exec(SUBNET);
  if (!m) throw new Error(`Unsupported subnet ${SUBNET}`);
  return m[1];
}

function allocateAddress(peers) {
  const base = subnetBase();
  const used = new Set(
    peers
      .filter((p) => p.state !== "removed")
      .map((p) => String(p.tunnelAddress || p.address || "").split("/")[0]),
  );
  for (let i = 2; i < 254; i++) {
    const ip = `${base}.${i}`;
    if (!used.has(ip)) return `${ip}/32`;
  }
  throw new Error("WireGuard address pool exhausted");
}

function wgSyncPeer(peer) {
  if (peer.state === "removed" || peer.state === "disabled") {
    try {
      execFileSync("wg", ["set", WG_IFACE, "peer", peer.routerPublicKey, "remove"], {
        stdio: "ignore",
      });
    } catch {
      /* already gone */
    }
    return;
  }
  const ip = String(peer.tunnelAddress || "").split("/")[0];
  execFileSync("wg", ["set", WG_IFACE, "peer", peer.routerPublicKey, "allowed-ips", `${ip}/32`], {
    stdio: "inherit",
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

function header(req, name) {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v || "";
}

function authorize(req, rawBody, pathCandidates) {
  const keyId = header(req, "x-mm-key-id");
  const timestamp = header(req, "x-mm-timestamp");
  const requestId = header(req, "x-mm-request-id");
  const scope = header(req, "x-mm-scope");
  const tenantId = header(req, "x-mm-tenant-id");
  const routerId = header(req, "x-mm-router-id");
  const requestedBy = header(req, "x-mm-requested-by");
  const signature = header(req, "x-mm-signature");

  const detail = {
    bodyLen: Buffer.byteLength(rawBody || ""),
    paths: [...new Set((pathCandidates || []).filter(Boolean))],
    keyIdHeader: keyId || null,
    keyIdExpected: KEY_ID,
    hasSignature: Boolean(signature),
    headersOk: Boolean(
      keyId && timestamp && requestId && scope && tenantId && routerId && requestedBy && signature,
    ),
  };

  if (!detail.headersOk) {
    return { ok: false, reason: "missing_headers", detail };
  }
  if (keyId !== KEY_ID) {
    return { ok: false, reason: "key_id_mismatch", detail };
  }

  const ts = Date.parse(timestamp);
  const skewOk = Number.isFinite(ts) && Math.abs(Date.now() - ts) <= SKEW_MS;
  detail.skewOk = skewOk;
  detail.timestamp = timestamp;
  if (!skewOk) {
    return { ok: false, reason: "timestamp_skew", detail };
  }

  for (const pathName of detail.paths) {
    const canonical = canonicalString({
      method: req.method || "GET",
      path: pathName,
      timestamp,
      requestId,
      scope,
      tenantId,
      routerId,
      requestedBy,
      body: rawBody,
    });
    if (verifySignature({ secret: SECRET, canonical, signature })) {
      return { ok: true, scope, tenantId, routerId, requestedBy };
    }
  }
  return { ok: false, reason: "bad_signature", detail };
}

function publicPeer(p) {
  return {
    peerId: p.peerId,
    tenantId: p.tenantId,
    routerId: p.routerId,
    routerPublicKey: p.routerPublicKey,
    tunnelAddress: p.tunnelAddress,
    hubPublicKey: hubPublicKey(),
    endpoint: ENDPOINT,
    allowedIps: [HUB_ROUTE],
    state: p.state,
    lastHandshakeAt: p.lastHandshakeAt ?? null,
    rxBytes: p.rxBytes ?? null,
    txBytes: p.txBytes ?? null,
  };
}

function webfigAuth(req, res) {
  const action = header(req, "x-mm-webfig-action");
  let peerId = header(req, "x-mm-webfig-peer");
  let expiresAt = header(req, "x-mm-webfig-expires");
  let signature = header(req, "x-mm-webfig-signature");
  if (action === "launch") {
    try {
      const original = new URL(header(req, "x-mm-webfig-uri"), "http://127.0.0.1");
      const match = /^\/peers\/([A-Za-z0-9_-]+)\/open-webfig\/?$/.exec(original.pathname);
      peerId = match?.[1] ?? "";
      expiresAt = original.searchParams.get("expires") ?? "";
      signature = original.searchParams.get("signature") ?? "";
    } catch {
      peerId = "";
      expiresAt = "";
      signature = "";
    }
  }
  const scope =
    action === "launch" ? "webfig:launch" : action === "session" ? "webfig:session" : "";
  const maxFutureMs = action === "launch" ? WEBFIG_LAUNCH_MAX_MS : WEBFIG_SESSION_MS;
  if (
    !scope ||
    !verifyWebfigToken({ secret: SECRET, scope, peerId, expiresAt, signature, maxFutureMs })
  ) {
    res.writeHead(401);
    return res.end();
  }
  const peer = loadPeers().find(
    (candidate) =>
      candidate.peerId === peerId &&
      candidate.state !== "removed" &&
      candidate.state !== "disabled",
  );
  if (!peer) {
    res.writeHead(401);
    return res.end();
  }
  if (action === "launch") {
    const sessionExpires = String(Date.now() + WEBFIG_SESSION_MS);
    res.writeHead(204, {
      "X-MM-WebFig-Session-Expires": sessionExpires,
      "X-MM-WebFig-Session-Signature": signWebfigToken(
        SECRET,
        "webfig:session",
        peerId,
        sessionExpires,
      ),
    });
    return res.end();
  }
  res.writeHead(204);
  return res.end();
}

async function handle(req, res) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const rawPath = url.pathname;
  // App HMAC path is `/v1/...`; nginx may leave `/internal/provisioner` prefixed.
  const pathName = normalizeProvisionerPath(rawPath);
  const rawBody = ["GET", "HEAD"].includes(req.method || "") ? "" : await readBody(req);

  if (req.method === "GET" && pathName === "/v1/webfig/authorize") {
    return webfigAuth(req, res);
  }

  const byRouter = /^\/v1\/peers\/by-router\/([^/]+)$/.exec(pathName);
  const peerDisable = /^\/v1\/peers\/([^/]+)\/disable$/.exec(pathName);
  const peerOne = /^\/v1\/peers\/([^/]+)$/.exec(pathName);

  if (!(byRouter || peerDisable || peerOne)) {
    return json(res, 404, { error: "not_found", path: pathName });
  }

  const auth = authorize(req, rawBody, [pathName, rawPath]);
  if (!auth.ok) {
    console.warn(
      JSON.stringify({
        auth: "fail",
        reason: auth.reason,
        method: req.method,
        rawPath,
        pathName,
        bodyLen: Buffer.byteLength(rawBody || ""),
      }),
    );
    return json(res, 401, {
      error: "unauthorized",
      reason: auth.reason,
      bodyLen: auth.detail?.bodyLen,
      paths: auth.detail?.paths,
      skewOk: auth.detail?.skewOk,
      headersOk: auth.detail?.headersOk,
      keyIdOk: auth.detail?.keyIdHeader === auth.detail?.keyIdExpected,
    });
  }

  let body = {};
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json(res, 400, { error: "invalid_json" });
    }
  }

  const peers = loadPeers();

  if (req.method === "PUT" && byRouter) {
    if (auth.scope !== "peers:create") return json(res, 401, { error: "unauthorized" });
    const routerId = decodeURIComponent(byRouter[1]);
    if (routerId !== auth.routerId) return json(res, 401, { error: "unauthorized" });
    const routerPublicKey = String(body.routerPublicKey || "").trim();
    if (!routerPublicKey || body.tenantId !== auth.tenantId || body.routerId !== auth.routerId) {
      return json(res, 400, { error: "invalid_body" });
    }
    const existing = peers.find(
      (p) => p.routerId === routerId && p.tenantId === auth.tenantId && p.state !== "removed",
    );
    if (existing) {
      existing.routerPublicKey = routerPublicKey;
      existing.routerName = String(body.routerName || existing.routerName || routerId);
      existing.managementRestPort =
        Number(body.managementRestPort) || existing.managementRestPort || 443;
      existing.state = "active";
      existing.updatedAt = new Date().toISOString();
      wgSyncPeer(existing);
      savePeers(peers);
      return json(res, 200, publicPeer(existing));
    }
    const peer = {
      peerId: randomUUID(),
      tenantId: auth.tenantId,
      routerId,
      routerPublicKey,
      routerName: String(body.routerName || routerId),
      managementRestPort: Number(body.managementRestPort) || 443,
      tunnelAddress: allocateAddress(peers),
      state: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastHandshakeAt: null,
    };
    peers.push(peer);
    wgSyncPeer(peer);
    savePeers(peers);
    return json(res, 200, publicPeer(peer));
  }

  if (req.method === "GET" && peerOne && !peerDisable) {
    if (auth.scope !== "peers:inspect") return json(res, 401, { error: "unauthorized" });
    const peerId = decodeURIComponent(peerOne[1]);
    const peer = peers.find((p) => p.peerId === peerId && p.state !== "removed");
    if (!peer || peer.tenantId !== auth.tenantId || peer.routerId !== auth.routerId) {
      return json(res, 404, { error: "not_found" });
    }
    return json(res, 200, publicPeer(peer));
  }

  if (req.method === "POST" && peerDisable) {
    if (auth.scope !== "peers:disable") return json(res, 401, { error: "unauthorized" });
    const peerId = decodeURIComponent(peerDisable[1]);
    const peer = peers.find((p) => p.peerId === peerId && p.state !== "removed");
    if (!peer || peer.tenantId !== auth.tenantId || peer.routerId !== auth.routerId) {
      return json(res, 404, { error: "not_found" });
    }
    peer.state = "disabled";
    peer.updatedAt = new Date().toISOString();
    wgSyncPeer(peer);
    savePeers(peers);
    return json(res, 200, publicPeer(peer));
  }

  if (req.method === "DELETE" && peerOne && !peerDisable) {
    if (auth.scope !== "peers:remove") return json(res, 401, { error: "unauthorized" });
    const peerId = decodeURIComponent(peerOne[1]);
    const peer = peers.find((p) => p.peerId === peerId);
    if (!peer || peer.tenantId !== auth.tenantId || peer.routerId !== auth.routerId) {
      return json(res, 404, { error: "not_found" });
    }
    peer.state = "removed";
    peer.updatedAt = new Date().toISOString();
    wgSyncPeer(peer);
    savePeers(peers);
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { error: "method_not_allowed" });
}

const [host, portStr] = LISTEN.includes(":") ? LISTEN.split(":") : ["127.0.0.1", LISTEN];
const port = Number(portStr) || 8787;

const isMain =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  if (!SECRET) {
    console.error("MM_HUB_SIGNING_KEY is required");
    process.exit(1);
  }
  const shape = /^[0-9a-fA-F]{64}$/.test(SECRET) ? "hex64" : "other";
  console.log(
    `mikromagic-hub-peer starting keyId=${KEY_ID} secretShape=${shape} secretLen=${SECRET.length}`,
  );
  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error(err);
      json(res, 500, { error: "internal" });
    });
  });
  server.listen(port, host, () => {
    console.log(`mikromagic-hub-peer listening on ${host}:${port}`);
  });
}
