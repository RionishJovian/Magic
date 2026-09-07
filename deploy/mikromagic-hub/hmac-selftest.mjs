#!/usr/bin/env node
/**
 * Run ON the Alibaba hub VPS after installing service.mjs.
 * Proves localhost HMAC, then public nginx path (same as the app).
 *
 *   sudo bash -c 'set -a; . /etc/mikromagic-hub/env; set +a; node /opt/mikromagic-hub/hmac-selftest.mjs'
 */

import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

function loadEnvFile(file) {
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      const k = m[1];
      let v = m[2] ?? "";
      if (
        (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
        (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v.trim();
    }
  } catch {
    /* optional */
  }
}

function clean(value) {
  let v = String(value ?? "").trim();
  if (
    (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
    (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

loadEnvFile("/etc/mikromagic-hub/env");

const SECRET = clean(process.env.MM_HUB_SIGNING_KEY || "");
const KEY_ID = clean(process.env.MM_HUB_SIGNING_KEY_ID || "v1") || "v1";
const BASE = clean(process.env.MM_HUB_SELFTEST_URL || "http://127.0.0.1:8787").replace(/\/+$/, "");
const PUB_BASE = clean(
  process.env.MM_HUB_PUBLIC_URL || "https://hub.mikromagic.app/internal/provisioner",
).replace(/\/+$/, "");

if (!SECRET) {
  console.error("FAIL: MM_HUB_SIGNING_KEY missing (source /etc/mikromagic-hub/env)");
  process.exit(2);
}

function keyCandidates(secret) {
  if (/^[0-9a-fA-F]{64}$/.test(secret)) return [Buffer.from(secret, "hex"), secret];
  return [secret];
}

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(key, canonical) {
  return b64url(createHmac("sha256", key).update(canonical).digest());
}

async function tryCreate(base, label) {
  const routerId = `selftest-${label}-${Date.now()}`;
  const path = `/v1/peers/by-router/${routerId}`;
  const body = JSON.stringify({
    tenantId: "selftest-tenant",
    routerId,
    requestedBy: "selftest",
    idempotencyKey: `wg-peer:${routerId}:create`,
    routerPublicKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    routerName: `selftest-${label}`,
    managementRestPort: 443,
  });
  const timestamp = new Date().toISOString();
  const requestId = randomUUID();
  const canonical = [
    "PUT",
    path,
    timestamp,
    requestId,
    "peers:create",
    "selftest-tenant",
    routerId,
    "selftest",
    body,
  ].join("\n");

  let last = null;
  for (const key of keyCandidates(SECRET)) {
    const signature = sign(key, canonical);
    const res = await fetch(`${base}${path}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-MM-Key-Id": KEY_ID,
        "X-MM-Timestamp": timestamp,
        "X-MM-Request-Id": requestId,
        "X-MM-Scope": "peers:create",
        "X-MM-Tenant-Id": "selftest-tenant",
        "X-MM-Router-Id": routerId,
        "X-MM-Requested-By": "selftest",
        "X-MM-Signature": signature,
      },
      body,
    });
    const text = await res.text();
    last = {
      status: res.status,
      text: text.slice(0, 300),
      key: Buffer.isBuffer(key) ? "hex-bytes" : "utf8",
    };
    if (res.ok) {
      console.log(`PASS: ${label} create accepted (${last.key}) status=${res.status}`);
      console.log(text.slice(0, 300));
      return true;
    }
  }
  console.error(`FAIL: ${label} hub rejected signed create`);
  console.error(JSON.stringify(last, null, 2));
  return false;
}

const shape = /^[0-9a-fA-F]{64}$/.test(SECRET) ? "hex64" : "other";
console.log(`selftest keyId=${KEY_ID} secretShape=${shape} secretLen=${SECRET.length}`);

if (!(await tryCreate(BASE, "localhost"))) {
  console.error(
    "If status is 401: replace /opt/mikromagic-hub/service.mjs from deploy/mikromagic-hub/ and restart mikromagic-hub-peer.",
  );
  process.exit(1);
}

if (!(await tryCreate(PUB_BASE, "public"))) {
  console.error("localhost worked but public nginx path failed — check path prefix / secret load.");
  process.exit(1);
}

process.exit(0);
