#!/usr/bin/env node
/**
 * MikroMagic Connector — LOCAL setup CLI.
 *
 * Runs entirely on the operator's own computer, inside the customer LAN.
 * The router admin username/password are typed here and never leave this
 * machine: they are held in memory only, never written to disk, never placed
 * in a command argument, never logged, and never sent to MikroMagic.
 *
 * Strict ordering — NO router write happens before all four of these:
 *   1. ownership / read-only snapshot verification (REST or read-only SSH),
 *   2. the full configuration summary (including every SSH-side change),
 *   3. an explicitly typed APPLY,
 *   4. a successful encrypted on-router backup.
 *
 * Physical cabling is NOT automated. You must connect this computer to one of
 * the RB4011 LAN ports (ether2 … ether10) yourself before running this.
 *
 *   sudo node connector-setup.mjs
 */

import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { platform } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { discoverRouters, connectorSourceCidr } from "./lib/discovery.mjs";
import { describeDevice, deviceFingerprint } from "./lib/mndp.mjs";
import { transition } from "./lib/state.mjs";
import {
  peekCertificate,
  restRequest,
  restReachable,
  sshAvailable,
  sshMissingMessage,
  sshHostKeyIdentity,
  sshSnapshot,
  sshBackup,
  sshApplyRestAccess,
} from "./lib/routeros.mjs";
import {
  planBootstrap,
  buildRollback,
  generateStrongPassword,
  MAGIC_USER,
  MAGIC_GROUP,
  MAGIC_CERT,
  CONNECTOR_TAG,
} from "./lib/bootstrap.mjs";
import { safeError } from "./lib/redact.mjs";
import { withRetry } from "./lib/retry.mjs";
import { assertCloudBaseUrl } from "./lib/net.mjs";
import { loadToken } from "./lib/token-store.mjs";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, (a) => r(a)));

function connectorHome() {
  if (process.env.MIKROMAGIC_HOME) return process.env.MIKROMAGIC_HOME;
  if (platform() === "win32") {
    return join(process.env.ProgramData || "C:\\ProgramData", "MikroMagicConnector");
  }
  if (platform() === "darwin") return "/Library/Application Support/MikroMagicConnector";
  return "/opt/mikromagic-connector";
}

/** Prompt without echoing. Blank input is a valid RouterOS password. */
function askSecret(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);
    let value = "";
    const onData = (chunk) => {
      const s = chunk.toString("utf8");
      if (s === "\r" || s === "\n" || s === "\u0004") {
        stdin.removeListener("data", onData);
        if (stdin.isTTY) stdin.setRawMode(Boolean(wasRaw));
        process.stdout.write("\n");
        resolve(value);
        return;
      }
      if (s === "\u0003") {
        process.stdout.write("\n");
        process.exit(130);
      }
      if (s === "\u007f") value = value.slice(0, -1);
      else value += s;
    };
    stdin.on("data", onData);
    if (!stdin.isTTY) {
      stdin.removeListener("data", onData);
      resolve("");
    }
  });
}

function log(...args) {
  console.log(...args);
}

/** Wait until the secure REST service answers a TLS handshake. */
async function waitForRest(host, attempts = 10, delayMs = 2000) {
  for (let i = 0; i < attempts; i++) {
    if (await restReachable(host)) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

async function main() {
  const baseUrl = (process.env.MIKROMAGIC_BASE_URL || "https://mikromagic.app").replace(/\/+$/, "");
  assertCloudBaseUrl(baseUrl, {
    allowInsecureLocalhost: process.env.MIKROMAGIC_ALLOW_INSECURE_LOCALHOST === "1",
  });

  // The paired agent owns the connector token; the setup tool reads it from
  // the same secure store. It is never taken from argv and never printed.
  const token = (await loadToken(connectorHome())) || "";

  log("");
  log("MikroMagic Connector — local router setup");
  log("-----------------------------------------");
  log("Manual step: connect this computer with an Ethernet cable to one of the");
  log("RB4011 LAN ports (ether2 … ether10). This tool cannot do that for you.");
  log("");
  if (!token) {
    log("No paired connector token was found on this machine.");
    log("Install and pair the Connector first (MikroMagic → Connectors → pairing code),");
    log("then run this tool again as an administrator so it can read the stored token.");
    rl.close();
    process.exit(1);
  }

  let state = "discovered";
  log("Scanning the local network (MNDP, UDP 5678)…");
  const devices = await discoverRouters({ mndpMs: 6000 });
  if (!devices.length) {
    log("No RouterOS device answered. Check the cable, then run this again.");
    rl.close();
    process.exit(1);
  }

  devices.forEach((d, i) => {
    const v = describeDevice(d);
    log(
      `  [${i + 1}] identity=${v.identity}  model=${v.model}  version=${v.version}  ip=${v.ip}  mac=${v.mac}`,
    );
  });

  const pick = Number(await ask("Select the router to set up [1]: ")) || 1;
  const device = devices[pick - 1];
  if (!device || !device.ip) {
    log("Invalid selection.");
    rl.close();
    process.exit(1);
  }

  state = transition(state, "authenticating");
  const username = (await ask("RouterOS username [admin]: ")).trim() || "admin";
  const password = await askSecret("RouterOS password (blank is allowed): ");

  // Which of our own addresses reaches this router — the /32 everything is
  // restricted to. Without it the tool refuses to enable the service.
  const allowedFrom = await connectorSourceCidr(device.ip);
  if (!allowedFrom) {
    log("Could not determine which local address reaches this router.");
    log("Nothing was changed. Re-run while connected to the router's LAN.");
    rl.close();
    process.exit(1);
  }
  log(`Connector source address: ${allowedFrom} (everything is restricted to it)`);

  const restUp = await restReachable(device.ip);
  const transport = restUp ? "rest" : "ssh";
  let hostKeyPolicy = null;
  let pinned = null;
  let snapshot = null;
  let info = null;

  if (!restUp) {
    // ---------------- factory router: READ-ONLY SSH verification -------------
    log("");
    log("The secure REST service (www-ssl) is not reachable on this router.");
    log("This tool can finish the setup over SSH. It will first only READ the");
    log("configuration; nothing is written until you type APPLY and an encrypted");
    log("backup has been taken.");
    if (!sshAvailable()) {
      log("");
      log(sshMissingMessage());
      rl.close();
      process.exit(1);
    }
    const useSsh = (await ask('Type "SSH" to continue with the secure fallback: ')).trim();
    if (useSsh !== "SSH") {
      log("Aborted. Nothing was changed.");
      rl.close();
      process.exit(1);
    }

    // ---- SSH host identity must be verified before anything else ------------
    let hostKey;
    try {
      hostKey = await sshHostKeyIdentity(device.ip);
    } catch (e) {
      log(`Could not read the SSH host key: ${safeError(e)}`);
      rl.close();
      process.exit(1);
    }
    if (hostKey.mismatch) {
      log("");
      log("SSH HOST KEY MISMATCH — refusing to continue.");
      log(`  offered : ${hostKey.keyType} ${hostKey.fingerprint}`);
      log(`  known   : ${hostKey.knownFingerprints.join(", ")}`);
      log("The stored key is never replaced automatically. Verify the device out of");
      log("band and remove the stale known_hosts entry yourself if this is expected.");
      rl.close();
      process.exit(1);
    }
    if (hostKey.known) {
      log(`SSH host key matches the one already known for this router (${hostKey.fingerprint}).`);
      hostKeyPolicy = "yes";
    } else {
      log("");
      log("This router's SSH host key is not known to this computer yet:");
      log(`  type    : ${hostKey.keyType}`);
      log(`  SHA-256 : ${hostKey.fingerprint}`);
      log("Check it against the router console (/ip ssh print) before accepting.");
      const ok = (await ask("Type YES to accept exactly this SSH host key: ")).trim();
      if (ok !== "YES") {
        log("Aborted. Nothing was changed.");
        rl.close();
        process.exit(1);
      }
      hostKeyPolicy = "accept-new";
    }

    try {
      snapshot = await sshSnapshot({
        host: device.ip,
        username,
        password,
        hostKeyPolicy,
      });
    } catch (e) {
      log(`Read-only SSH verification failed: ${safeError(e)}`);
      rl.close();
      process.exit(1);
    }
    if (device.identity && snapshot.identity && snapshot.identity !== device.identity) {
      log(
        `Refusing to continue: this device reports identity "${snapshot.identity}", not "${device.identity}".`,
      );
      rl.close();
      process.exit(1);
    }
    info = {
      identity: snapshot.identity ?? device.identity ?? "unknown",
      model: snapshot.board ?? "unknown",
      version: snapshot.version ?? "unknown",
      serial: snapshot.serial || null,
      ip: device.ip,
      mac: device.mac ?? null,
    };
  } else {
    // ---------------- REST router: pin TLS, then read-only verify ------------
    const cert = await peekCertificate(device.ip, 443).catch((e) => {
      log(`Could not read the router certificate: ${safeError(e)}`);
      return null;
    });
    if (cert?.selfSigned) {
      log("");
      log("This router presents a self-signed certificate:");
      log(`  subject     : ${cert.subject}`);
      log(`  valid until : ${cert.validTo}`);
      log(`  SHA-256     : ${cert.fingerprint256}`);
      const ok = (await ask("Type YES to trust exactly this certificate for this router: ")).trim();
      if (ok !== "YES") {
        log("Aborted. Nothing was changed.");
        rl.close();
        process.exit(1);
      }
      pinned = cert.fingerprint256;
    }

    try {
      snapshot = await readOverRest(device.ip, username, password, pinned);
    } catch (e) {
      log(`Authentication or read failed: ${safeError(e)}`);
      await report(baseUrl, token, {
        device,
        info: { identity: device.identity ?? "unknown", ip: device.ip, mac: device.mac ?? null },
        state: "error",
        lastError: safeError(e),
        tlsFingerprint: pinned,
      });
      rl.close();
      process.exit(1);
    }
    info = {
      identity: snapshot.identity ?? device.identity ?? "unknown",
      model: snapshot.board ?? "unknown",
      version: snapshot.version ?? "unknown",
      serial: snapshot.serial || null,
      ip: device.ip,
      mac: device.mac ?? null,
    };
  }

  log("");
  log(`Verified router (read-only, over ${transport === "ssh" ? "SSH" : "HTTPS REST"}):`);
  log(`  identity : ${info.identity}`);
  log(`  model    : ${info.model}`);
  log(`  RouterOS : ${info.version}`);
  log(`  serial   : ${info.serial ?? "unknown"}`);
  log(`  address  : ${info.ip}`);

  // --- plan ------------------------------------------------------------------
  const plan = planBootstrap(snapshot, {
    allowedFrom,
    service: "www-ssl",
    commonName: info.identity,
    requireCertificate: transport === "ssh",
  });

  if (plan.blocked) {
    log("");
    log("Setup cannot continue — please resolve these first:");
    for (const c of plan.conflicts) {
      log(`  [CONFLICT] ${c.title}`);
      log(`        ${c.detail}`);
      log(`        fix: ${c.remedy}`);
    }
    await report(baseUrl, token, {
      device,
      info,
      state: "error",
      lastError: plan.conflicts
        .map((c) => c.title)
        .join("; ")
        .slice(0, 300),
      tlsFingerprint: pinned,
    });
    rl.close();
    process.exit(1);
  }

  const certStep = plan.steps.find((s) => s.id === "certificate");
  const createCert = plan.writes.some((s) => s.id === "certificate" && s.action === "add");

  log("");
  log("Dry run — nothing has been written yet. The following changes would be applied:");
  for (const s of plan.steps) {
    const via =
      transport === "ssh" && (s.id === "certificate" || s.id === "service") ? " (over SSH)" : "";
    log(`  [${s.action.toUpperCase()}]${via} ${s.title}`);
    if (s.command) log(`        ${s.command}`);
    log(`        reason: ${s.reason}`);
  }
  log("");
  log("Nothing existing is deleted, disabled or weakened. No firewall rule is added.");
  log("An encrypted on-router backup is taken BEFORE the first configuration write.");
  if (plan.noop) {
    log("Already bootstrapped — nothing to do.");
    rl.close();
    return;
  }

  const confirm = (await ask('Type "APPLY" to continue, anything else aborts: ')).trim();
  if (confirm !== "APPLY") {
    log("Aborted. Nothing was changed.");
    rl.close();
    return;
  }

  // --- encrypted on-router backup BEFORE any write ---------------------------
  state = transition(state, "configuring");
  const backupName = `mikromagic-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const backupPassword = randomBytes(24).toString("base64url");
  try {
    if (transport === "ssh") {
      await sshBackup({
        host: device.ip,
        username,
        password,
        hostKeyPolicy,
        name: backupName,
        backupPassword,
      });
    } else {
      await restRequest({
        host: device.ip,
        path: "/system/backup/save",
        method: "POST",
        body: { name: backupName, password: backupPassword, encryption: "aes-sha256" },
        username,
        password,
        pinnedFingerprint: pinned,
      });
    }
  } catch (e) {
    log(`Backup failed: ${safeError(e)}`);
    log("Nothing was changed — the tool never writes without a successful backup.");
    rl.close();
    process.exit(1);
  }
  log(`Encrypted backup saved on the router as ${backupName}.backup`);
  log("Keep this backup password somewhere safe — it is shown only once:");
  log(`  ${backupPassword}`);

  // --- apply exactly what the plan displayed ----------------------------------
  const magicPassword = generateStrongPassword(randomBytes, 32);
  const applied = [];

  if (transport === "ssh") {
    // Certificate + service are the only SSH-side writes.
    try {
      await sshApplyRestAccess({
        host: device.ip,
        username,
        password,
        hostKeyPolicy,
        allowedFrom,
        certificate: plan.certificate,
        createCertificate: createCert,
        commonName: info.identity,
      });
    } catch (e) {
      log(`Enabling secure REST failed: ${safeError(e)}`);
      log(`Restore ${backupName}.backup on the router if you want to undo this run.`);
      await report(baseUrl, token, {
        device,
        info,
        state: "error",
        lastError: safeError(e),
        backupName,
      });
      rl.close();
      process.exit(1);
    }
    for (const s of plan.writes) {
      if (s.id === "certificate" || s.id === "service") applied.push(s);
    }
    log("Secure REST (www-ssl) is enabled for this computer only.");

    if (!(await waitForRest(device.ip))) {
      log("The router did not start answering HTTPS on port 443.");
      log(`Restore ${backupName}.backup, or run the rollback commands shown above.`);
      rl.close();
      process.exit(1);
    }
    const cert = await peekCertificate(device.ip, 443).catch(() => null);
    if (cert?.selfSigned) {
      log("");
      log("The router now presents this TLS certificate:");
      log(`  subject     : ${cert.subject}`);
      log(`  valid until : ${cert.validTo}`);
      log(`  SHA-256     : ${cert.fingerprint256}`);
      const ok = (await ask("Type YES to pin exactly this certificate for this router: ")).trim();
      if (ok !== "YES") {
        log("Aborted before creating the API account.");
        rl.close();
        process.exit(1);
      }
      pinned = cert.fingerprint256;
    }
  }

  const call = (path, method = "GET", body) =>
    restRequest({
      host: device.ip,
      path,
      method,
      body,
      username,
      password,
      pinnedFingerprint: pinned,
    });

  try {
    for (const s of plan.writes) {
      if (applied.includes(s)) continue;
      if (s.id === "certificate" && s.action === "add") {
        await call("/certificate", "PUT", {
          name: MAGIC_CERT,
          "common-name": s.payload.commonName,
          "key-size": "2048",
          "days-valid": "3650",
          "key-usage": "tls-server",
          comment: CONNECTOR_TAG,
        });
        await call("/certificate/sign", "POST", { number: MAGIC_CERT });
      } else if (s.id === "group") {
        if (s.action === "add") await call("/user/group", "PUT", s.payload);
        else await call(`/user/group/${s.previous.id}`, "PATCH", s.payload);
      } else if (s.id === "user") {
        const payload = { ...s.payload, password: magicPassword };
        if (s.action === "add") await call("/user", "PUT", payload);
        else await call(`/user/${s.previous.id}`, "PATCH", payload);
      } else if (s.id === "service") {
        await call(`/ip/service/${s.previous.id}`, "PATCH", s.payload);
      }
      applied.push(s);
    }
  } catch (e) {
    log(`Apply failed: ${safeError(e)}`);
    await report(baseUrl, token, {
      device,
      info,
      state: "error",
      lastError: safeError(e),
      tlsFingerprint: pinned,
      backupName,
      rollback: buildRollback(plan, { backupName, appliedSteps: applied }),
    });
    rl.close();
    process.exit(1);
  }

  const rollback = buildRollback(plan, { backupName, appliedSteps: applied });
  const rollbackPath = `./mikromagic-rollback-${info.identity.replace(/[^\w.-]/g, "_")}.rsc`;
  writeFileSync(
    rollbackPath,
    `# ${rollback.scope}\n# backup: ${backupName}\n${rollback.script}\n`,
    {
      mode: 0o600,
    },
  );
  log(`Rollback script written to ${rollbackPath}`);
  if (certStep?.action === "add") {
    log(`It also removes the "${MAGIC_CERT}" certificate this run created.`);
  }

  // --- health check with the new credential ----------------------------------
  let healthy = false;
  let healthError = null;
  try {
    const check = await restRequest({
      host: device.ip,
      path: "/system/resource",
      username: MAGIC_USER,
      password: magicPassword,
      pinnedFingerprint: pinned,
    });
    healthy = Boolean(check);
  } catch (e) {
    healthError = safeError(e);
  }
  if (!healthy) {
    log(`Health check with the ${MAGIC_USER} account failed: ${healthError ?? "no response"}`);
    log(`Run the rollback script (${rollbackPath}) if you want to undo this run.`);
    await report(baseUrl, token, {
      device,
      info,
      state: "error",
      lastError: healthError ?? "health check failed",
      tlsFingerprint: pinned,
      backupName,
      rollback,
    });
    rl.close();
    process.exit(1);
  }
  log(`Health check passed: the ${MAGIC_GROUP} account can read the router.`);

  // --- register with the cloud over outbound HTTPS ---------------------------
  // The router is only reported as connected once registration succeeds.
  try {
    await withRetry(
      () =>
        report(baseUrl, token, {
          device,
          info,
          state: "connected",
          tlsFingerprint: pinned,
          backupName,
          rollback,
          credential: { username: MAGIC_USER, password: magicPassword },
          throwOnError: true,
        }),
      { retries: 4, onRetry: (e, a) => log(`registration retry ${a + 1}: ${safeError(e)}`) },
    );
  } catch (e) {
    log(`Registration failed: ${safeError(e)}`);
    log("The router was configured locally but is NOT connected to MikroMagic yet.");
    await report(baseUrl, token, {
      device,
      info,
      state: "offline",
      lastError: safeError(e),
      tlsFingerprint: pinned,
      backupName,
      rollback,
    });
    rl.close();
    process.exit(1);
  }

  state = transition(state, "connected");
  log("Router registered with MikroMagic. Only the generated magic-api credential was uploaded.");
  log("Your admin password never left this computer.");
  rl.close();
}

/** READ-ONLY REST snapshot in the shape planBootstrap expects. */
export async function readOverRest(host, username, password, pinned, requestImpl = restRequest) {
  const call = (path) => requestImpl({ host, path, username, password, pinnedFingerprint: pinned });
  const identity = await call("/system/identity");
  const resource = await call("/system/resource");
  const routerboard = await call("/system/routerboard").catch(() => ({}));
  const [groups, users, services, certificates] = await Promise.all([
    call("/user/group").catch(() => []),
    call("/user").catch(() => []),
    call("/ip/service").catch(() => []),
    call("/certificate").catch(() => []),
  ]);
  return {
    identity: identity?.name ?? null,
    version: resource?.version ?? null,
    board: routerboard?.model ?? resource?.["board-name"] ?? null,
    serial: routerboard?.["serial-number"] ?? null,
    groups,
    users,
    services,
    certificates,
  };
}

/** Report device state to the cloud. Never sends the admin password. */
export async function report(baseUrl, token, opts) {
  const url = assertCloudBaseUrl(baseUrl, {
    allowInsecureLocalhost: process.env.MIKROMAGIC_ALLOW_INSECURE_LOCALHOST === "1",
  });
  const { device, info, state, lastError, tlsFingerprint, backupName, rollback, credential } = opts;
  const res = await fetch(`${url.origin}/api/public/connector/devices`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      fingerprint: deviceFingerprint({ ...device, serial: info.serial ?? null }),
      identity: info.identity ?? null,
      model: info.model ?? null,
      platform: device.platform ?? null,
      os_version: info.version ?? null,
      ip: info.ip ?? null,
      mac: info.mac ?? null,
      serial: info.serial ?? null,
      state,
      last_error: lastError ?? null,
      tls_fingerprint: tlsFingerprint ?? null,
      backup_name: backupName ?? null,
      rollback_script: rollback?.script ?? null,
      rollback_scope: rollback?.scope ?? null,
      ...(credential
        ? { api_username: credential.username, api_password: credential.password }
        : {}),
    }),
  });
  if (!res.ok && opts.throwOnError) {
    throw new Error(`registration failed with HTTP ${res.status}`);
  }
  return res.ok;
}

// Only run when this file is executed directly (including as the generated
// single-file bundle); importing it from tests must never start the wizard.
export function isDirectRunPath(argv1, moduleUrl) {
  if (!argv1) return false;
  try {
    return pathToFileURL(argv1).href === moduleUrl;
  } catch {
    return false;
  }
}

const isDirectRun = isDirectRunPath(process.argv[1], import.meta.url);
if (isDirectRun && process.env.MIKROMAGIC_SETUP_NO_RUN !== "1") {
  main().catch((err) => {
    console.error("Setup failed:", safeError(err));
    rl.close();
    process.exit(1);
  });
}
