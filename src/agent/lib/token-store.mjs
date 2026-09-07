/**
 * Connector token storage.
 *
 * The connector bearer token is a credential and is never kept as plaintext
 * on disk. Where the OS offers a secret store we use it:
 *
 *   Windows  DPAPI (LocalMachine scope) via PowerShell, secret on stdin
 *   macOS    Keychain (`security`), secret on stdin
 *   Linux    libsecret (`secret-tool`), secret on stdin
 *
 * When no OS store is available we fall back to an AES-256-GCM encrypted file
 * with 0600 permissions, keyed from a machine-bound value plus a random
 * per-install key file. That fallback is explicitly weaker: a local attacker
 * who can already read files as this user can recover the token. Nothing here
 * ever passes the secret as a command-line argument or logs it.
 */

import { spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { platform, hostname } from "node:os";
import { join, dirname } from "node:path";

const SERVICE = "app.mikromagic.connector";
const ACCOUNT = "connector-token";

export class TokenStoreError extends Error {
  constructor(message, remedy) {
    super(message);
    this.name = "TokenStoreError";
    this.remedy = remedy ?? null;
  }
}

/** Run a command, writing the secret to stdin. The secret is never in argv. */
function run(cmd, args, stdin = null) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      resolve({ ok: false, out: "", err: "spawn failed" });
      return;
    }
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", () => resolve({ ok: false, out: "", err: "not available" }));
    child.on("close", (code) => resolve({ ok: code === 0, out, err }));
    if (stdin != null) child.stdin.end(stdin);
    else child.stdin.end();
  });
}

/* ------------------------------------------------------------- encrypted -- */

function keyPath(dir) {
  return join(dir, "token.key");
}
function blobPath(dir) {
  return join(dir, "token.enc");
}

function fallbackKey(dir) {
  const path = keyPath(dir);
  let material;
  if (existsSync(path)) {
    material = readFileSync(path);
  } else {
    material = randomBytes(32);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, material, { mode: 0o600 });
  }
  return createHash("sha256").update(material).update(hostname()).update(platform()).digest();
}

function encryptedSave(dir, token) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", fallbackKey(dir), iv);
  const ct = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
  mkdirSync(dir, { recursive: true });
  writeFileSync(blobPath(dir), payload, { mode: 0o600 });
  return "encrypted-file";
}

function encryptedLoad(dir) {
  const path = blobPath(dir);
  if (!existsSync(path)) return null;
  try {
    const buf = Buffer.from(readFileSync(path, "utf8"), "base64");
    const decipher = createDecipheriv("aes-256-gcm", fallbackKey(dir), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ OS backends -- */

const PS_SAVE = `$ErrorActionPreference='Stop';
Add-Type -AssemblyName System.Security;
$t=[Console]::In.ReadToEnd();
$b=[Text.Encoding]::UTF8.GetBytes($t);
$p=[Security.Cryptography.ProtectedData]::Protect($b,$null,'LocalMachine');
[IO.File]::WriteAllText($env:MM_BLOB,[Convert]::ToBase64String($p));`;

const PS_LOAD = `$ErrorActionPreference='Stop';
Add-Type -AssemblyName System.Security;
$p=[Convert]::FromBase64String([IO.File]::ReadAllText($env:MM_BLOB));
$b=[Security.Cryptography.ProtectedData]::Unprotect($p,$null,'LocalMachine');
[Console]::Out.Write([Text.Encoding]::UTF8.GetString($b));`;

function dpapiPath(dir) {
  return join(dir, "token.dpapi");
}

async function osSave(dir, token) {
  const os = platform();
  if (os === "win32") {
    mkdirSync(dir, { recursive: true });
    const env = { ...process.env, MM_BLOB: dpapiPath(dir) };
    const res = await new Promise((resolve) => {
      const child = spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", PS_SAVE],
        { stdio: ["pipe", "ignore", "pipe"], env },
      );
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
      child.stdin.end(token);
    });
    return res ? "windows-dpapi" : null;
  }
  if (os === "darwin") {
    // `-w` without a value makes `security` read the secret from stdin.
    const res = await run(
      "security",
      ["add-generic-password", "-U", "-a", ACCOUNT, "-s", SERVICE, "-w"],
      token + "\n",
    );
    return res.ok ? "macos-keychain" : null;
  }
  const res = await run(
    "secret-tool",
    ["store", "--label=MikroMagic Connector", "service", SERVICE, "account", ACCOUNT],
    token,
  );
  return res.ok ? "linux-secret-tool" : null;
}

async function osLoad(dir) {
  const os = platform();
  if (os === "win32") {
    if (!existsSync(dpapiPath(dir))) return null;
    const env = { ...process.env, MM_BLOB: dpapiPath(dir) };
    return await new Promise((resolve) => {
      let out = "";
      const child = spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", PS_LOAD],
        { stdio: ["ignore", "pipe", "ignore"], env },
      );
      child.stdout.on("data", (d) => (out += d.toString()));
      child.on("error", () => resolve(null));
      child.on("close", (code) => resolve(code === 0 && out ? out.trim() : null));
    });
  }
  if (os === "darwin") {
    const res = await run("security", [
      "find-generic-password",
      "-a",
      ACCOUNT,
      "-s",
      SERVICE,
      "-w",
    ]);
    return res.ok && res.out.trim() ? res.out.trim() : null;
  }
  const res = await run("secret-tool", ["lookup", "service", SERVICE, "account", ACCOUNT]);
  return res.ok && res.out.trim() ? res.out.trim() : null;
}

async function osClear(dir) {
  const os = platform();
  if (os === "win32") {
    rmSync(dpapiPath(dir), { force: true });
    return;
  }
  if (os === "darwin") {
    await run("security", ["delete-generic-password", "-a", ACCOUNT, "-s", SERVICE]);
    return;
  }
  await run("secret-tool", ["clear", "service", SERVICE, "account", ACCOUNT]);
}

/* ----------------------------------------------------------------- API ---- */

/**
 * Persist the token. Returns the backend that accepted it.
 * Never returns silently without storing: callers can surface the backend and
 * warn when the weaker encrypted-file fallback was used.
 */
export async function saveToken(dir, token) {
  if (!token || typeof token !== "string") {
    throw new TokenStoreError("Refusing to store an empty connector token.");
  }
  const backend = await osSave(dir, token).catch(() => null);
  if (backend) {
    // Some headless macOS/keychain environments can return success from the
    // save command even though the credential cannot subsequently be read.
    // Accept an OS backend only after an exact read-back; otherwise clean up
    // the partial entry and use the encrypted local fallback.
    const verified = await osLoad(dir).catch(() => null);
    if (verified === token) {
      // Never keep a second copy around.
      rmSync(blobPath(dir), { force: true });
      return backend;
    }
    await osClear(dir).catch(() => {});
  }
  return encryptedSave(dir, token);
}

/** Read the token, or null when nothing is stored yet. */
export async function loadToken(dir) {
  const fromOs = await osLoad(dir).catch(() => null);
  if (fromOs) return fromOs;
  return encryptedLoad(dir);
}

export async function clearToken(dir) {
  await osClear(dir).catch(() => {});
  rmSync(blobPath(dir), { force: true });
}

/**
 * One-time migration of a legacy plaintext token from config.json into the
 * secure store. The plaintext copy is removed from the config file.
 */
export async function migratePlaintextToken(dir, config, writeConfig) {
  if (!config || typeof config.token !== "string" || !config.token) return { migrated: false };
  const backend = await saveToken(dir, config.token);
  const next = { ...config };
  delete next.token;
  writeConfig(next);
  return { migrated: true, backend, config: next };
}

/** Human-readable description used by the CLI and heartbeat status. */
export function describeBackend(backend) {
  switch (backend) {
    case "windows-dpapi":
      return "Windows DPAPI (machine scope)";
    case "macos-keychain":
      return "macOS Keychain";
    case "linux-secret-tool":
      return "Linux secret service (libsecret)";
    default:
      return "encrypted file fallback (0600, machine-bound key) — install libsecret for OS-backed storage";
  }
}
