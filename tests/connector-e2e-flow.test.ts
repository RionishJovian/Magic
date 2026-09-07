/**
 * End-to-end Connector bootstrap flow against a MOCKED, stateful RouterOS
 * device and a MOCKED cloud endpoint.
 *
 * No real hardware is contacted. Nothing destructive, no WinBox, no reset, no
 * public service, and TLS verification is never globally disabled — the
 * self-signed certificate is trusted only through the per-request pin.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { restRequest } from "@/agent/lib/routeros.mjs";
import {
  planBootstrap,
  buildRollback,
  generateStrongPassword,
  MAGIC_USER,
  MAGIC_GROUP,
  MAGIC_POLICY,
  CONNECTOR_TAG,
} from "@/agent/lib/bootstrap.mjs";
import { safeError } from "@/agent/lib/redact.mjs";

type Row = Record<string, string>;

const ALLOWED_FROM = "192.168.88.10/32";

const state = {
  groups: [{ ".id": "*1", name: "full", policy: "read,write,policy" }] as Row[],
  users: [{ ".id": "*1", name: "admin", group: "full" }] as Row[],
  services: [
    { ".id": "*s1", name: "www-ssl", disabled: "true", address: "" },
    { ".id": "*s2", name: "www", disabled: "false", address: "" },
  ] as Row[],
  backups: [] as Row[],
};

function selfSignedCert() {
  const dir = mkdtempSync(join(tmpdir(), "mm-cert-"));
  const key = join(dir, "key.pem");
  const cert = join(dir, "cert.pem");
  execFileSync("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    key,
    "-out",
    cert,
    "-days",
    "2",
    "-subj",
    "/CN=RouterOS-mock",
  ]);
  const pem = readFileSync(cert, "utf8");
  const der = Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64");
  const fingerprint = createHash("sha256")
    .update(der)
    .digest("hex")
    .toUpperCase()
    .replace(/(.{2})(?=.)/g, "$1:");
  return { dir, key: readFileSync(key), cert: readFileSync(cert), fingerprint };
}

let server: ReturnType<typeof createServer>;
let port = 0;
let fingerprint = "";
let certDir = "";
let nextId = 100;

function handle(method: string, url: string, body: Row): [number, unknown] {
  const rest = url.replace(/^\/rest/, "");
  if (method === "GET") {
    if (rest === "/system/identity") return [200, { name: "RB4011-lab" }];
    if (rest === "/system/resource")
      return [200, { "board-name": "RB4011iGS+", version: "7.14.3 (stable)" }];
    if (rest === "/system/routerboard")
      return [200, { "serial-number": "HFX0ABCD123", model: "RB4011iGS+" }];
    if (rest === "/user/group") return [200, state.groups];
    if (rest === "/user") return [200, state.users];
    if (rest === "/ip/service") return [200, state.services];
    return [404, { error: 404, message: "no such command" }];
  }
  if (method === "POST" && rest === "/system/backup/save") {
    if (!body.password || body.encryption !== "aes-sha256") {
      return [400, { error: 400, message: "backup must be encrypted" }];
    }
    state.backups.push({ name: String(body.name) });
    return [200, {}];
  }
  if (method === "PUT" && rest === "/user/group") {
    const row = { ".id": `*${nextId++}`, ...body };
    state.groups.push(row);
    return [200, row];
  }
  if (method === "PUT" && rest === "/user") {
    const row = { ".id": `*${nextId++}`, ...body };
    state.users.push(row);
    return [200, row];
  }
  const patch = /^\/(user\/group|user|ip\/service)\/(\*[\w]+)$/.exec(rest);
  if (method === "PATCH" && patch) {
    const bucket =
      patch[1] === "user/group" ? state.groups : patch[1] === "user" ? state.users : state.services;
    const row = bucket.find((r) => r[".id"] === patch[2]);
    if (!row) return [404, { error: 404, message: "not found" }];
    Object.assign(row, body);
    return [200, row];
  }
  if (method === "DELETE") return [403, { error: 403, message: "removals are not permitted" }];
  return [404, { error: 404, message: "no such command" }];
}

beforeAll(async () => {
  const c = selfSignedCert();
  certDir = c.dir;
  fingerprint = c.fingerprint;
  server = createServer({ key: c.key, cert: c.cert }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (d) => chunks.push(d as Buffer));
    req.on("end", () => {
      const auth = req.headers.authorization;
      const expected = "Basic " + Buffer.from("admin:sticker-pass").toString("base64");
      if (auth !== expected) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: 401, message: "invalid user name or password" }));
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      const [status, payload] = handle(req.method ?? "", req.url ?? "", raw ? JSON.parse(raw) : {});
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  port = typeof addr === "object" && addr ? addr.port : 0;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (certDir) rmSync(certDir, { recursive: true, force: true });
});

const call = (
  path: string,
  method = "GET",
  body?: unknown,
  creds: { username: string; password: string } = { username: "admin", password: "sticker-pass" },
) =>
  restRequest({
    host: "127.0.0.1",
    port,
    path,
    method,
    body,
    username: creds.username,
    password: creds.password,
    pinnedFingerprint: fingerprint,
    timeoutMs: 5000,
  });

async function snapshot() {
  const [groups, users, services] = await Promise.all([
    call("/user/group"),
    call("/user"),
    call("/ip/service"),
  ]);
  return { groups, users, services };
}

describe("connector bootstrap flow (mocked RouterOS)", () => {
  let magicPassword = "";

  it("reports an actionable error when authentication fails", async () => {
    await expect(
      call("/system/identity", "GET", undefined, { username: "admin", password: "wrong" }),
    ).rejects.toThrow();
    try {
      await call("/system/identity", "GET", undefined, { username: "admin", password: "wrong" });
    } catch (e) {
      expect(safeError(e)).not.toContain("wrong");
    }
  });

  it("verifies the router read-only before planning any write", async () => {
    const identity = await call("/system/identity");
    const resource = await call("/system/resource");
    const rb = await call("/system/routerboard");
    expect(identity.name).toBe("RB4011-lab");
    expect(resource.version).toBe("7.14.3 (stable)");
    expect(rb["serial-number"]).toBe("HFX0ABCD123");
    expect(state.groups).toHaveLength(1);
  });

  it("takes an encrypted on-router backup before applying anything", async () => {
    await call("/system/backup/save", "POST", {
      name: "mikromagic-test",
      password: "backup-pass",
      encryption: "aes-sha256",
    });
    expect(state.backups.map((b) => b.name)).toContain("mikromagic-test");
  });

  it("applies exactly the planned writes and nothing else", async () => {
    const plan = planBootstrap(await snapshot(), { allowedFrom: ALLOWED_FROM });
    expect(plan.blocked).toBe(false);
    magicPassword = generateStrongPassword(undefined, 32);

    for (const s of plan.writes) {
      if (s.id === "group") await call("/user/group", "PUT", s.payload);
      else if (s.id === "user")
        await call("/user", "PUT", { ...s.payload, password: magicPassword });
      else if (s.id === "service") await call(`/ip/service/${s.previous.id}`, "PATCH", s.payload);
    }

    const group = state.groups.find((g) => g.name === MAGIC_GROUP);
    const user = state.users.find((u) => u.name === MAGIC_USER);
    const svc = state.services.find((s) => s.name === "www-ssl");
    expect(group?.policy).toBe(MAGIC_POLICY);
    expect(group?.comment).toContain(CONNECTOR_TAG);
    expect(user?.address).toBe(ALLOWED_FROM);
    expect(svc?.disabled).toBe("false");
    expect(svc?.address).toBe(ALLOWED_FROM);
    // Untouched objects stay exactly as they were.
    expect(state.services.find((s) => s.name === "www")?.disabled).toBe("false");
    expect(state.groups.find((g) => g.name === "full")?.policy).toBe("read,write,policy");
  });

  it("registers with the cloud over HTTPS and never uploads the admin password", async () => {
    const seen: { url: string; body: string; auth: string | undefined }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      seen.push({
        url: String(input),
        body: String(init?.body ?? ""),
        auth: (init?.headers as Record<string, string>)?.authorization,
      });
      return new Response(JSON.stringify({ ok: true, id: "row-1" }), { status: 200 });
    }) as typeof fetch;

    const { report } = await import("@/agent/setup-cli.mjs");
    const ok = await report("https://mikromagic.app", "connector-token", {
      device: { ip: "192.168.88.1", mac: "AA:BB:CC:DD:EE:FF" },
      info: {
        identity: "RB4011-lab",
        model: "RB4011iGS+",
        version: "7.14.3",
        serial: "HFX0ABCD123",
        ip: "192.168.88.1",
        mac: "AA:BB:CC:DD:EE:FF",
      },
      state: "connected",
      tlsFingerprint: fingerprint,
      backupName: "mikromagic-test",
      credential: { username: MAGIC_USER, password: magicPassword },
    });
    globalThis.fetch = original;

    expect(ok).toBe(true);
    expect(seen[0]!.url.startsWith("https://")).toBe(true);
    expect(seen[0]!.auth).toBe("Bearer connector-token");
    const sent = JSON.parse(seen[0]!.body);
    expect(sent.tls_fingerprint).toBe(fingerprint);
    expect(sent.api_username).toBe(MAGIC_USER);
    expect(seen[0]!.body).not.toContain("sticker-pass");
  });

  it("refuses to register over plain HTTP", async () => {
    const { report } = await import("@/agent/setup-cli.mjs");
    await expect(
      report("http://mikromagic.app", "connector-token", {
        device: {},
        info: {},
        state: "connected",
      }),
    ).rejects.toThrow(/plain HTTP/i);
  });

  it("is idempotent: a rerun neither duplicates nor re-adds anything", async () => {
    const plan = planBootstrap(await snapshot(), { allowedFrom: ALLOWED_FROM });
    expect(plan.blocked).toBe(false);
    expect(plan.writes.filter((s: { action: string }) => s.action === "add")).toHaveLength(0);
    expect(state.users.filter((u) => u.name === MAGIC_USER)).toHaveLength(1);
    expect(state.groups.filter((g) => g.name === MAGIC_GROUP)).toHaveLength(1);

    const rollback = buildRollback(plan, {
      backupName: "mikromagic-test",
      appliedSteps: plan.writes,
    });
    // Nothing was added by the rerun, so nothing may be removed by its rollback.
    expect(rollback.script).not.toMatch(/remove/);
  });

  it("produces a rollback limited to this connector's own objects", async () => {
    const fresh = {
      groups: [] as Row[],
      users: [] as Row[],
      services: [{ ".id": "*s1", name: "www-ssl", disabled: "true", address: "" }],
    };
    const plan = planBootstrap(fresh, { allowedFrom: ALLOWED_FROM });
    const rollback = buildRollback(plan, { backupName: "b", appliedSteps: plan.writes });
    expect(rollback.script).toMatch(new RegExp(CONNECTOR_TAG));
    expect(rollback.script).not.toMatch(
      /reset-configuration|system\/reset|\/user\/remove \[find name=admin/,
    );
    expect(rollback.scope).toMatch(/never resets the router/i);
  });
});
