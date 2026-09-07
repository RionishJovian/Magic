#!/usr/bin/env node
/**
 * MikroMagic Connector Agent
 * -------------------------------------------------------------
 * Runs on a Windows or macOS machine inside the customer LAN.
 * It never listens on a port: it only makes outbound HTTPS calls to
 * the MikroMagic cloud (pair -> heartbeat -> poll jobs -> post results)
 * and proxies those jobs to local devices (MikroTik / UniFi / etc).
 *
 * Self-updating: every few hours it asks the cloud for the latest agent
 * version. The manifest is Ed25519-signed and pins a SHA-256 of the new
 * agent file; both must verify before the update is written to disk.
 * After a successful update the process exits(0) and the OS service
 * manager (Windows Scheduled Task / launchd) restarts it.
 *
 * Zero npm dependencies — Node.js 18+ built-ins only.
 */

import { createHash, verify as cryptoVerify, createPublicKey } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { hostname, networkInterfaces, platform, homedir } from "node:os";
import { join, dirname } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import {
  saveToken,
  loadToken,
  clearToken,
  migratePlaintextToken,
  describeBackend,
} from "./lib/token-store.mjs";
import { withRetry } from "./lib/retry.mjs";

export const AGENT_VERSION = "1.0.0";

/** Ed25519 public key (SPKI DER, base64) used to verify update manifests. */
const UPDATE_PUBLIC_KEY_B64 = "MCowBQYDK2VwAyEACqzWWPJXbYAuE2WfbOb8USjBKEdYZ4W8ROiXB0yb3wE=";

const DEFAULT_BASE_URL = "https://mikromagic.app";
const POLL_INTERVAL_MS = 3000;
const HEARTBEAT_INTERVAL_MS = 30000;
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const JOB_TIMEOUT_MS = 20000;

function configDir() {
  if (process.env.MIKROMAGIC_HOME) return process.env.MIKROMAGIC_HOME;
  if (platform() === "win32") {
    return join(process.env.ProgramData || "C:\\ProgramData", "MikroMagicConnector");
  }
  if (platform() === "darwin") return "/Library/Application Support/MikroMagicConnector";
  return join(homedir(), ".mikromagic-connector");
}

const CONFIG_PATH = join(configDir(), "config.json");
const CONFIG_DIR = configDir();
const AGENT_PATH = process.argv[1] || join(configDir(), "connector-agent.mjs");

function log(...args) {
  console.log(new Date().toISOString(), "[connector]", ...args);
}

function readConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(cfg) {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

/**
 * The bearer token lives in the OS secret store, never in config.json.
 * Anything already on disk in plaintext is migrated away on first start.
 */
async function loadTokenIntoConfig(cfg) {
  const migrated = await migratePlaintextToken(CONFIG_DIR, cfg, writeConfig);
  const base = migrated.migrated ? migrated.config : cfg;
  if (migrated.migrated) {
    log("moved the stored token into", describeBackend(migrated.backend));
  }
  const token = await loadToken(CONFIG_DIR);
  return { ...base, token: token || undefined };
}

async function persistToken(cfg) {
  const { token, ...rest } = cfg;
  writeConfig({ ...rest, pairingCode: undefined });
  if (token) {
    const backend = await saveToken(CONFIG_DIR, token);
    log("token stored in", describeBackend(backend));
  }
  return cfg;
}

function localAddress() {
  const nets = networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const net of list || []) {
      if (net.family === "IPv4" && !net.internal) {
        return { ip: net.address, subnet: net.cidr || null };
      }
    }
  }
  return { ip: null, subnet: null };
}

function agentMeta() {
  const { ip, subnet } = localAddress();
  return {
    version: AGENT_VERSION,
    hostname: hostname(),
    local_ip: ip || undefined,
    local_subnet: subnet || undefined,
  };
}

async function api(cfg, path, init = {}) {
  const base = (cfg.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const headers = { "content-type": "application/json", ...(init.headers || {}) };
  if (cfg.token) headers.authorization = "Bearer " + cfg.token;
  const res = await fetch(base + path, { ...init, headers });
  return res;
}

/* ------------------------------------------------------------------ pairing */

export async function pair(cfg, code) {
  const res = await api(cfg, "/api/public/connector/pair", {
    method: "POST",
    body: JSON.stringify({ code, ...agentMeta() }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Pairing failed (" + res.status + ")");
  const next = {
    ...cfg,
    token: body.token,
    connectorId: body.connector_id,
    pairingCode: undefined,
  };
  await persistToken(next);
  log("paired as", body.connector_id);
  return next;
}

/* ---------------------------------------------------------------- heartbeat */

export async function heartbeat(cfg) {
  const res = await api(cfg, "/api/public/connector/heartbeat", {
    method: "POST",
    body: JSON.stringify(agentMeta()),
  });
  if (res.status === 401) throw new Error("unauthorized");
  return res.ok;
}

/* --------------------------------------------------------------- job runner */

/** Only private/link-local LAN targets may ever be contacted. */
function assertLocalHttpTarget(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    throw new Error("Invalid job URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Unsupported scheme");
  if (url.username || url.password) throw new Error("Credentials in URL are not allowed");
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(url.hostname);
  if (!m) throw new Error("Only literal private IPv4 targets are allowed");
  const [a, b] = [Number(m[1]), Number(m[2])];
  const priv =
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    a === 127;
  if (!priv) throw new Error("Target is not a private LAN address");
  return url;
}

/**
 * Perform a device request. TLS verification is never globally disabled: a
 * self-signed router certificate is accepted only when the cloud job carries
 * the exact SHA-256 fingerprint the operator confirmed during local setup.
 */
async function runHttpJob(request) {
  const url = assertLocalHttpTarget(request.url);
  const pinned = (request.tlsFingerprint || "").toUpperCase();
  const method = (request.method || "GET").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(method)) {
    throw new Error("Unsupported method");
  }

  if (url.protocol === "http:" || !pinned) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), JOB_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        headers: request.headers || {},
        body: request.body ?? undefined,
        redirect: "error",
        signal: controller.signal,
      });
      const text = await res.text();
      const headers = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return { status: res.status, statusText: res.statusText, headers, body: text };
    } finally {
      clearTimeout(timer);
    }
  }

  // Pinned HTTPS: scoped certificate exception for this one request.
  const { request: httpsRequest } = await import("node:https");
  return await new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        host: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method,
        servername: url.hostname,
        rejectUnauthorized: false,
        timeout: JOB_TIMEOUT_MS,
        headers: request.headers || {},
      },
      (res) => {
        let body = "";
        let size = 0;
        res.on("data", (c) => {
          size += c.length;
          if (size > 2_000_000) {
            res.destroy();
            reject(new Error("Device response exceeded the size limit"));
            return;
          }
          body += c.toString("utf8");
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage || "",
            headers: Object.fromEntries(
              Object.entries(res.headers).map(([k, v]) => [
                k,
                Array.isArray(v) ? v.join(", ") : String(v),
              ]),
            ),
            body,
          }),
        );
      },
    );
    req.on("socket", (socket) => {
      socket.on("secureConnect", () => {
        const actual = String(socket.getPeerCertificate().fingerprint256 || "").toUpperCase();
        if (actual !== pinned) req.destroy(new Error("TLS fingerprint mismatch for this router"));
      });
    });
    req.on("timeout", () => req.destroy(new Error("Device request timed out")));
    req.on("error", reject);
    if (request.body) req.write(request.body);
    req.end();
  });
}

async function pollJobs(cfg) {
  const res = await api(cfg, "/api/public/connector/jobs");
  if (res.status === 401) throw new Error("unauthorized");
  if (!res.ok) return;
  const { jobs = [] } = await res.json().catch(() => ({ jobs: [] }));
  for (const job of jobs) {
    let payload;
    try {
      const response = await runHttpJob(job.request || {});
      payload = { job_id: job.id, status: "done", response };
    } catch (err) {
      payload = {
        job_id: job.id,
        status: "failed",
        error: String(err?.message || err).slice(0, 2000),
      };
    }
    await withRetry(
      async () => {
        const posted = await api(cfg, "/api/public/connector/result", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        if (!posted.ok && posted.status !== 404) {
          throw new Error(`result post failed: HTTP ${posted.status}`);
        }
      },
      {
        retries: 3,
        shouldRetry: (err) => !/unauthorized/i.test(String(err?.message || err)),
        onRetry: (err, attempt, delay) => {
          console.warn(
            `[connector] result post retry ${attempt + 1} in ${delay}ms:`,
            String(err?.message || err).slice(0, 200),
          );
        },
      },
    ).catch((err) => {
      console.error(
        "[connector] failed to report job result:",
        String(err?.message || err).slice(0, 500),
      );
    });
  }
}

/* ------------------------------------------------------------- self-updater */

export function verifyManifest(manifest, signatureB64, publicKeyB64 = UPDATE_PUBLIC_KEY_B64) {
  const key = createPublicKey({
    key: Buffer.from(publicKeyB64, "base64"),
    format: "der",
    type: "spki",
  });
  return cryptoVerify(
    null,
    Buffer.from(JSON.stringify(manifest)),
    key,
    Buffer.from(signatureB64, "base64"),
  );
}

export function isNewerVersion(next, current) {
  const a = String(next)
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const b = String(current)
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

async function checkForUpdate(cfg) {
  const res = await api(cfg, "/api/public/connector/version");
  if (!res.ok) return false;
  const body = await res.json().catch(() => null);
  if (!body?.manifest || !body?.signature) return false;
  const { manifest, signature } = body;

  if (!verifyManifest(manifest, signature)) {
    log("update rejected: bad signature");
    return false;
  }
  if (!isNewerVersion(manifest.version, AGENT_VERSION)) return false;

  const base = (cfg.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const url = manifest.url.startsWith("http") ? manifest.url : base + manifest.url;
  if (!url.startsWith(base + "/")) {
    log("update rejected: download URL outside of the trusted origin");
    return false;
  }
  const download = await fetch(url);
  if (!download.ok) return false;
  const source = await download.text();
  const digest = createHash("sha256").update(source, "utf8").digest("hex");
  if (digest !== manifest.sha256) {
    log("update rejected: checksum mismatch");
    return false;
  }

  const tmp = AGENT_PATH + ".next";
  writeFileSync(tmp, source, { mode: 0o755 });
  renameSync(tmp, AGENT_PATH);
  log("updated to", manifest.version, "— restarting");
  return true;
}

/* ---------------------------------------------------------------- main loop */

async function main() {
  let cfg = await loadTokenIntoConfig(readConfig());
  if (process.env.MIKROMAGIC_BASE_URL) cfg.baseUrl = process.env.MIKROMAGIC_BASE_URL;
  if (!cfg.baseUrl) cfg.baseUrl = DEFAULT_BASE_URL;

  const cliCode = process.argv.includes("--pair")
    ? process.argv[process.argv.indexOf("--pair") + 1]
    : undefined;
  const code = cliCode || process.env.MIKROMAGIC_PAIRING_CODE || cfg.pairingCode;

  if (!cfg.token) {
    if (!code) {
      log("no pairing code. Run: connector-agent --pair XXXX-XXXX-XXXX");
      process.exit(2);
    }
    cfg = await pair(cfg, code.trim().toUpperCase());
  } else if (code) {
    // Explicit re-pair request wins over the stored token.
    cfg = await pair(cfg, code.trim().toUpperCase());
  }

  await persistToken(cfg);
  log("agent", AGENT_VERSION, "online for", cfg.connectorId);

  let lastHeartbeat = 0;
  let lastUpdateCheck = Date.now();

  for (;;) {
    try {
      await pollJobs(cfg);
      if (Date.now() - lastHeartbeat > HEARTBEAT_INTERVAL_MS) {
        await heartbeat(cfg);
        lastHeartbeat = Date.now();
      }
      if (Date.now() - lastUpdateCheck > UPDATE_INTERVAL_MS) {
        lastUpdateCheck = Date.now();
        if (await checkForUpdate(cfg)) process.exit(0);
      }
    } catch (err) {
      if (String(err?.message) === "unauthorized") {
        log("token rejected — clearing credentials, re-pair required");
        writeConfig({ baseUrl: cfg.baseUrl });
        await clearToken(CONFIG_DIR);
        process.exit(3);
      }
      log("loop error:", String(err?.message || err));
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

/**
 * URL-safe direct-run check. String concatenation broke on macOS because the
 * install path contains a space, which import.meta.url encodes as %20.
 */
export function isDirectRunPath(argv1, moduleUrl) {
  if (!argv1) return false;
  try {
    return pathToFileURL(argv1).href === moduleUrl;
  } catch {
    return false;
  }
}

const isDirectRun = isDirectRunPath(process.argv[1], import.meta.url);
// The generated one-file artifact marks itself explicitly: bundling changes
// module boundaries, so relying on import.meta.url alone can make a direct
// download exit silently on some Node/Vite combinations.
if (
  isDirectRun ||
  globalThis.__MIKROMAGIC_BUNDLED_AGENT__ === true ||
  process.env.MIKROMAGIC_FORCE_RUN === "1"
) {
  main().catch((err) => {
    log("fatal:", String(err?.message || err));
    process.exit(1);
  });
}

export { CONFIG_PATH, checkForUpdate, pollJobs, readConfig, writeConfig, existsSync };
