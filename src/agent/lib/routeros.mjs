/**
 * RouterOS transport for the local setup CLI.
 *
 * Rules enforced here:
 *  - HTTPS REST is preferred and TLS verification is ON by default;
 *  - a self-signed router certificate is only accepted after the operator
 *    confirms the exact SHA-256 fingerprint, and the exception is scoped to
 *    that one connection (never NODE_TLS_REJECT_UNAUTHORIZED);
 *  - plaintext HTTP REST and the plaintext RouterOS API are never used for
 *    credentials;
 *  - SSH is the only fallback (POSIX and Windows OpenSSH); the password is
 *    never in argv, env or on disk, and RouterOS commands go over stdin.
 */

import { request as httpsRequest } from "node:https";
import { connect as tlsConnect } from "node:tls";
import { spawn, execFileSync } from "node:child_process";
import { createServer, isIP } from "node:net";
import { mkdtempSync, writeFileSync, rmSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { safeError } from "./redact.mjs";
import { isPrivateIPv4 } from "./net.mjs";

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_BODY_BYTES = 1_000_000;

export function assertLocalTarget(host) {
  if (!isPrivateIPv4(host)) {
    throw new Error(`Refusing to contact ${host}: only private LAN addresses are allowed.`);
  }
}

function formatFingerprint(raw) {
  return String(raw ?? "").toUpperCase();
}

/** Read the router's certificate fingerprint so the operator can confirm it. */
export function peekCertificate(host, port = 443, timeoutMs = DEFAULT_TIMEOUT_MS) {
  assertLocalTarget(host);
  return new Promise((resolve, reject) => {
    const socket = tlsConnect(
      {
        host,
        port,
        rejectUnauthorized: false,
        // TLS SNI accepts DNS names, not IP literals. RouterOS connectors are
        // intentionally LAN-IP-only, so omit SNI for those addresses.
        servername: isIP(host) ? undefined : host,
        timeout: timeoutMs,
      },
      () => {
        const cert = socket.getPeerCertificate();
        const authorized = socket.authorized;
        socket.end();
        resolve({
          fingerprint256: formatFingerprint(cert.fingerprint256),
          subject: cert.subject?.CN ?? "unknown",
          validTo: cert.valid_to ?? "unknown",
          selfSigned: !authorized,
          authorizationError: authorized ? null : String(socket.authorizationError ?? "unknown"),
        });
      },
    );
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`Timed out reading the certificate of ${host}:${port}`));
    });
    socket.on("error", (err) => reject(new Error(safeError(err))));
  });
}

/**
 * One RouterOS REST call over verified TLS.
 * `pinnedFingerprint` (SHA-256, colon-separated uppercase) scopes a
 * self-signed exception to this exact router.
 */
export function restRequest({
  host,
  port = 443,
  path,
  method = "GET",
  body,
  username,
  password,
  pinnedFingerprint = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  assertLocalTarget(host);
  const payload = body == null ? null : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        host,
        port,
        path: `/rest${path}`,
        method,
        servername: isIP(host) ? undefined : host,
        // Never reuse a pooled socket: each request re-validates the certificate.
        agent: false,
        // Pinned mode: verification is delegated to the fingerprint check
        // below, which is strictly scoped to this single request.
        rejectUnauthorized: !pinnedFingerprint,
        checkServerIdentity: pinnedFingerprint ? () => undefined : undefined,
        timeout: timeoutMs,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          authorization: "Basic " + Buffer.from(`${username}:${password ?? ""}`).toString("base64"),
          ...(payload ? { "content-length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            res.destroy();
            reject(new Error("RouterOS response exceeded the size limit"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = null;
          }
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`RouterOS ${method} ${path} failed with HTTP ${res.statusCode}`));
            return;
          }
          resolve(json ?? text);
        });
      },
    );

    req.on("socket", (socket) => {
      if (!pinnedFingerprint) return;
      const verify = () => {
        const actual = formatFingerprint(socket.getPeerCertificate?.()?.fingerprint256);
        if (actual !== formatFingerprint(pinnedFingerprint)) {
          req.destroy(
            new Error(
              "TLS certificate fingerprint does not match the one you confirmed for this router.",
            ),
          );
        }
      };
      // The socket may already be secured when it is handed to us (reused or
      // fast handshake), in which case "secureConnect" never fires again.
      if (socket.encrypted && socket.getPeerCertificate?.()?.fingerprint256) verify();
      else socket.on("secureConnect", verify);
    });

    req.on("timeout", () => req.destroy(new Error(`RouterOS request to ${host} timed out`)));
    req.on("error", (err) => reject(new Error(safeError(err))));
    if (payload) req.write(payload);
    req.end();
  });
}

/* ========================================================================== *
 * SSH: read-only verification, backup and the narrow bootstrap writes.
 *
 * Cross-platform:
 *  - POSIX: the password is served from memory over a private 0600 UNIX socket
 *    to a short-lived askpass helper, exactly once.
 *  - Windows: the installed OpenSSH client prompts on the console and reads the
 *    password directly from the console handle. Nothing is stored.
 * On both platforms the password is never an argv element, never an environment
 * value, never written to disk and never logged. RouterOS commands are fed over
 * stdin so they never appear in the process arguments either.
 * ========================================================================== */

/** True when an OpenSSH client is installed and runnable. */
export function sshAvailable(execImpl = execFileSync) {
  try {
    execImpl("ssh", ["-V"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function sshMissingMessage(platformName = process.platform) {
  if (platformName === "win32") {
    return (
      "The OpenSSH client was not found. Install it with:\n" +
      "  Settings → System → Optional features → Add a feature → OpenSSH Client\n" +
      "or, in an elevated PowerShell:\n" +
      '  Add-WindowsCapability -Online -Name "OpenSSH.Client~~~~0.0.1.0"\n' +
      "Then run this tool again."
    );
  }
  if (platformName === "darwin") {
    return "The ssh command was not found. Install the Xcode command line tools with `xcode-select --install`, then run this tool again.";
  }
  return "The ssh command was not found. Install the OpenSSH client (for example `apt install openssh-client` or `dnf install openssh-clients`), then run this tool again.";
}

/** OpenSSH-style SHA256 fingerprint of a base64 host key blob. */
export function sshKeyFingerprint(base64Key) {
  const digest = createHash("sha256")
    .update(Buffer.from(String(base64Key), "base64"))
    .digest();
  return "SHA256:" + digest.toString("base64").replace(/=+$/, "");
}

export function knownHostsPath() {
  return join(homedir(), ".ssh", "known_hosts");
}

/** Host keys currently recorded for `host` in known_hosts (plain entries). */
export function readKnownHostKeys(host, path = knownHostsPath(), readImpl = readFileSync) {
  let text = "";
  try {
    text = String(readImpl(path, "utf8"));
  } catch {
    return [];
  }
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [hostsField, keyType, key] = trimmed.split(/\s+/);
    if (!hostsField || !keyType || !key) continue;
    if (hostsField.startsWith("|")) continue; // hashed entry: cannot be correlated
    const hosts = hostsField.split(",").map((h) => h.replace(/^\[|\]:\d+$/g, ""));
    if (!hosts.includes(host)) continue;
    out.push({ keyType, fingerprint: sshKeyFingerprint(key) });
  }
  return out;
}

/**
 * Scan the router's SSH host key so the operator can verify it before any
 * write. Returns the offered key plus how it correlates with known_hosts.
 * A changed key is reported as a mismatch and is NEVER silently replaced.
 */
export async function sshHostKeyIdentity(host, options = {}) {
  assertLocalTarget(host);
  const scan = options.scanImpl ?? defaultKeyscan;
  const known = options.knownHostKeys ?? readKnownHostKeys(host, options.knownHostsPath);
  const offered = await scan(host);
  if (!offered.length) {
    throw new Error(`No SSH host key was offered by ${host}. Is the SSH service enabled?`);
  }
  const preferred =
    offered.find((k) => k.keyType === "ssh-ed25519") ??
    offered.find((k) => k.keyType === "ssh-rsa") ??
    offered[0];
  const sameType = known.filter((k) => k.keyType === preferred.keyType);
  const matches = sameType.some((k) => k.fingerprint === preferred.fingerprint);
  return {
    keyType: preferred.keyType,
    fingerprint: preferred.fingerprint,
    known: matches,
    mismatch: sameType.length > 0 && !matches,
    knownFingerprints: sameType.map((k) => k.fingerprint),
  };
}

function defaultKeyscan(host) {
  return new Promise((resolve, reject) => {
    let out = "";
    const child = spawn("ssh-keyscan", ["-T", "5", "-t", "ed25519,rsa", host], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("error", (e) => reject(new Error(safeError(e))));
    child.on("close", () => {
      const keys = [];
      for (const line of out.split(/\r?\n/)) {
        const [, keyType, key] = line.trim().split(/\s+/);
        if (keyType && key) keys.push({ keyType, fingerprint: sshKeyFingerprint(key) });
      }
      resolve(keys);
    });
  });
}

/**
 * Run RouterOS commands over SSH.
 * `hostKeyPolicy` must be "yes" for an already-known host key, or "accept-new"
 * only after the operator has explicitly confirmed the displayed fingerprint.
 */
export async function sshCommand({
  host,
  username,
  password,
  commands,
  timeoutMs = 20000,
  hostKeyPolicy = "yes",
  platformName = process.platform,
  spawnImpl = spawn,
  execImpl = execFileSync,
}) {
  assertLocalTarget(host);
  if (hostKeyPolicy !== "yes" && hostKeyPolicy !== "accept-new") {
    throw new Error("Refusing to run SSH without an explicit host key policy.");
  }
  if (!sshAvailable(execImpl)) throw new Error(sshMissingMessage(platformName));

  const isWindows = platformName === "win32";
  const args = [
    "-o",
    "BatchMode=no",
    "-o",
    "NumberOfPasswordPrompts=1",
    "-o",
    `StrictHostKeyChecking=${hostKeyPolicy}`,
    "-o",
    `ConnectTimeout=${Math.ceil(timeoutMs / 1000)}`,
    `${username}@${host}`,
  ];
  // Commands go over stdin, never argv.
  const script = [...commands, "/quit"].join("\n") + "\n";

  let cleanup = () => {};
  let env = { ...process.env };
  if (!isWindows) {
    const channel = await memoryAskpass(String(password ?? ""));
    cleanup = channel.cleanup;
    env = {
      ...process.env,
      SSH_ASKPASS: channel.askpass,
      SSH_ASKPASS_REQUIRE: "force",
      DISPLAY: process.env.DISPLAY || ":0",
    };
  }

  try {
    return await new Promise((resolve, reject) => {
      const child = spawnImpl("ssh", args, {
        env,
        // Windows OpenSSH prompts on the console itself: stderr stays attached
        // so the operator can type the password; it is never captured.
        stdio: isWindows ? ["pipe", "pipe", "inherit"] : ["pipe", "pipe", "pipe"],
        ...(isWindows ? {} : { detached: true }),
      });
      let out = "";
      let err = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
      child.stdout?.on("data", (d) => (out += d.toString()));
      child.stderr?.on("data", (d) => (err += d.toString()));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(new Error(safeError(e)));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(out);
        else reject(new Error(safeError(err || `ssh exited with code ${code}`)));
      });
      child.stdin?.end(script);
    });
  } finally {
    cleanup();
  }
}

/** Private, in-memory, single-use askpass channel (POSIX only). */
async function memoryAskpass(secret) {
  const dir = mkdtempSync(join(tmpdir(), "mm-ssh-"), { mode: 0o700 });
  const sockPath = join(dir, "askpass.sock");
  const askpass = join(dir, "askpass.sh");
  let served = 0;

  const server = createServer((socket) => {
    if (served++ > 0) {
      socket.end();
      return;
    }
    socket.end(secret + "\n");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(sockPath, resolve);
  });
  chmodSync(sockPath, 0o600);

  // The helper script contains no secret material, only the socket path.
  writeFileSync(
    askpass,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} -e 'const n=require("net");const s=n.connect(process.argv[1]);s.pipe(process.stdout);' ${JSON.stringify(sockPath)}\n`,
    { mode: 0o700 },
  );

  return {
    askpass,
    cleanup: () => {
      server.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/* ------------------------------- parsing --------------------------------- */

const ANSI_RE = /\u001b\[[0-9;?]*[A-Za-z]/g;

/** Parse one `print terse` row into a plain object (flags + key=value pairs). */
export function parseTerseRow(line) {
  const clean = line.replace(ANSI_RE, "").trim();
  if (!clean) return null;
  const row = {};
  const head = clean.match(/^(\d+)\s+([A-Za-z*]*)\s*/);
  let rest = clean;
  if (head) {
    row[".index"] = head[1];
    row.flags = head[2] ?? "";
    rest = clean.slice(head[0].length);
  }
  const pair = /([\w.-]+)=("([^"]*)"|\S*)/g;
  let m;
  let found = false;
  while ((m = pair.exec(rest))) {
    row[m[1]] = m[3] ?? m[2];
    found = true;
  }
  return found ? row : null;
}

/** Split marker-delimited SSH output into named sections. */
export function parseSections(output) {
  const sections = {};
  let current = null;
  for (const raw of String(output).split(/\r?\n/)) {
    const line = raw.replace(ANSI_RE, "");
    const marker = line.trim().match(/^@@([a-z]+)$/);
    if (marker) {
      current = marker[1];
      sections[current] = [];
      continue;
    }
    if (current && line.trim()) sections[current].push(line);
  }
  return sections;
}

const SNAPSHOT_COMMANDS = [
  ':put "@@identity"',
  ":put [/system identity get name]",
  ':put "@@version"',
  ":put [/system resource get version]",
  ':put "@@board"',
  ":put [/system resource get board-name]",
  ':put "@@serial"',
  ':do {:put [/system routerboard get serial-number]} on-error={:put ""}',
  ':put "@@services"',
  "/ip service print terse",
  ':put "@@certs"',
  ':do {/certificate print terse} on-error={:put ""}',
  ':put "@@groups"',
  "/user group print terse",
  ':put "@@users"',
  "/user print terse",
];

/**
 * READ-ONLY snapshot over SSH. Runs `print`/`get` only — it performs no write
 * of any kind, and is the first thing the factory-router path does.
 */
export async function sshSnapshot({ host, username, password, hostKeyPolicy, ssh = sshCommand }) {
  const output = await ssh({
    host,
    username,
    password,
    hostKeyPolicy,
    commands: SNAPSHOT_COMMANDS,
  });
  const sections = parseSections(output);
  const firstLine = (name) => (sections[name] ?? []).map((l) => l.trim()).find(Boolean) ?? "";
  const rows = (name) =>
    (sections[name] ?? []).map((l) => parseTerseRow(l)).filter((r) => r && r.name);
  return {
    identity: firstLine("identity") || null,
    version: firstLine("version") || null,
    board: firstLine("board") || null,
    serial: firstLine("serial") || null,
    services: rows("services"),
    certificates: rows("certs"),
    groups: rows("groups"),
    users: rows("users"),
  };
}

/** Encrypted on-router backup taken over SSH, before any configuration write. */
export async function sshBackup({
  host,
  username,
  password,
  hostKeyPolicy,
  name,
  backupPassword,
  ssh = sshCommand,
}) {
  await ssh({
    host,
    username,
    password,
    hostKeyPolicy,
    commands: [
      `/system backup save name="${name}" password="${backupPassword}" encryption=aes-sha256`,
    ],
  });
  return name;
}

/**
 * The only SSH-side WRITES: create/sign the Connector certificate when the
 * secure service has none, assign it to www-ssl only, and enable www-ssl for
 * the Connector's own address. Called strictly after APPLY and after the
 * encrypted backup succeeded.
 */
export async function sshApplyRestAccess({
  host,
  username,
  password,
  hostKeyPolicy,
  allowedFrom,
  certificate = null,
  createCertificate = false,
  commonName = "mikromagic-connector",
  ssh = sshCommand,
}) {
  if (!allowedFrom) {
    throw new Error("Refusing to enable www-ssl without a Connector address restriction.");
  }
  const commands = [];
  if (createCertificate) {
    commands.push(
      `/certificate add name="${certificate}" common-name="${commonName}" key-size=2048 days-valid=3650 key-usage=tls-server comment="mikromagic-connector"`,
      `/certificate sign "${certificate}"`,
      `:local i 0; :while ($i < 60) do={ :if ([:len [/certificate find name="${certificate}" and private-key=yes]] > 0) do={ :set i 60 } else={ :delay 2s; :set i ($i + 1) } }`,
      `:if ([:len [/certificate find name="${certificate}" and private-key=yes]] = 0) do={ :error "certificate signing did not complete" }`,
    );
  }
  commands.push(
    `/ip service set [find name=www-ssl] disabled=no address=${allowedFrom}` +
      (certificate ? ` certificate="${certificate}"` : ""),
  );
  await ssh({ host, username, password, hostKeyPolicy, commands });
  return { certificate, allowedFrom };
}

/** True when the router answers a TLS handshake on the REST port. */
export async function restReachable(host, port = 443, timeoutMs = 3000) {
  try {
    await peekCertificate(host, port, timeoutMs);
    return true;
  } catch {
    return false;
  }
}
