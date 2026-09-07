/**
 * Integration tests against a MOCKED RouterOS device.
 *
 * A local self-signed HTTPS server on 127.0.0.1 stands in for the router's
 * REST API. No real hardware is ever contacted, nothing destructive runs, and
 * TLS verification is never globally disabled — the self-signed certificate is
 * accepted only through the per-request fingerprint pin.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:https";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { restRequest, peekCertificate, assertLocalTarget } from "@/agent/lib/routeros.mjs";
import { planBootstrap, buildRollback, CONNECTOR_TAG } from "@/agent/lib/bootstrap.mjs";

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

type Recorded = { method: string; url: string; auth: string | undefined; body: string };

let server: ReturnType<typeof createServer>;
let port = 0;
let fingerprint = "";
let certDir = "";
const recorded: Recorded[] = [];

const RESPONSES: Record<string, unknown> = {
  "/rest/system/identity": { name: "RB4011-lab" },
  "/rest/system/resource": {
    "board-name": "RB4011iGS+",
    version: "7.14.3 (stable)",
    "architecture-name": "arm",
  },
  "/rest/system/routerboard": { "serial-number": "HFX0ABCD123", model: "RB4011iGS+" },
  "/rest/user/group": [{ ".id": "*1", name: "full", policy: "read,write" }],
  "/rest/user": [{ ".id": "*1", name: "admin", group: "full" }],
  "/rest/ip/service": [
    { ".id": "*1", name: "www-ssl", disabled: "true", address: "" },
    { ".id": "*2", name: "www", disabled: "false", address: "" },
  ],
  "/rest/ip/firewall/filter": [{ ".id": "*1", chain: "input", action: "accept", comment: "" }],
  "/rest/interface": [{ name: "ether1", type: "ether", running: "true" }],
};

beforeAll(async () => {
  const c = selfSignedCert();
  certDir = c.dir;
  fingerprint = c.fingerprint;
  server = createServer({ key: c.key, cert: c.cert }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (d) => chunks.push(d as Buffer));
    req.on("end", () => {
      recorded.push({
        method: req.method ?? "",
        url: req.url ?? "",
        auth: req.headers.authorization,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      if (req.headers.authorization === undefined) {
        res.writeHead(401).end();
        return;
      }
      if (req.url === "/rest/system/license") {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: 403, message: "no permission" }));
        return;
      }
      const payload = RESPONSES[req.url ?? ""];
      if (payload === undefined) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: 404, message: "no such command" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
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

const call = (path: string, extra: Record<string, unknown> = {}) =>
  restRequest({
    host: "127.0.0.1",
    port,
    path,
    username: "admin",
    password: "sticker-pass",
    pinnedFingerprint: fingerprint,
    timeoutMs: 5000,
    ...extra,
  });

describe("mocked RouterOS REST transport", () => {
  it("reads the certificate so the operator can confirm the fingerprint", async () => {
    const info = await peekCertificate("127.0.0.1", port, 5000);
    expect(info.selfSigned).toBe(true);
    expect(info.fingerprint256).toBe(fingerprint);
  });

  it("refuses non-private targets before opening a socket", () => {
    expect(() => assertLocalTarget("8.8.8.8")).toThrow(/private LAN/i);
    expect(() => assertLocalTarget("router.example.com")).toThrow(/private LAN/i);
  });

  it("never sets a global TLS bypass", async () => {
    await call("/system/identity");
    expect(process.env["NODE_TLS_REJECT_UNAUTHORIZED"]).toBeUndefined();
  });

  it("rejects a self-signed certificate when no fingerprint is pinned", async () => {
    await expect(
      restRequest({
        host: "127.0.0.1",
        port,
        path: "/system/identity",
        username: "admin",
        password: "x",
        timeoutMs: 5000,
      }),
    ).rejects.toThrow();
  });

  it("rejects a mismatched pinned fingerprint", async () => {
    await expect(
      call("/system/identity", { pinnedFingerprint: "AA:" + fingerprint.slice(3) }),
    ).rejects.toThrow(/fingerprint/i);
  });

  it("reads identity and resource before any write", async () => {
    const identity = (await call("/system/identity")) as { name: string };
    const resource = (await call("/system/resource")) as Record<string, string>;
    expect(identity.name).toBe("RB4011-lab");
    expect(resource["board-name"]).toBe("RB4011iGS+");
    expect(recorded.every((r) => r.method === "GET")).toBe(true);
  });

  it("surfaces RouterOS permission errors instead of pretending success", async () => {
    await expect(call("/system/license")).rejects.toThrow(/403/);
  });

  it("surfaces unknown RouterOS commands as failures", async () => {
    await expect(call("/does/not/exist")).rejects.toThrow(/404/);
  });

  it("sends credentials only in the Authorization header, never in the URL", async () => {
    recorded.length = 0;
    await call("/user");
    const last = recorded.at(-1)!;
    expect(last.auth?.startsWith("Basic ")).toBe(true);
    expect(last.url).not.toMatch(/sticker-pass|admin:/);
  });
});

describe("bootstrap plan against the mocked device snapshot", () => {
  async function snapshot() {
    return {
      identity: ((await call("/system/identity")) as { name: string }).name,
      resource: (await call("/system/resource")) as Record<string, string>,
      routerboard: (await call("/system/routerboard")) as Record<string, string>,
      groups: (await call("/user/group")) as Record<string, string>[],
      users: (await call("/user")) as Record<string, string>[],
      services: (await call("/ip/service")) as Record<string, string>[],
      firewall: (await call("/ip/firewall/filter")) as Record<string, string>[],
    };
  }

  it("plans only additive, tagged changes on a stock device", async () => {
    const snap = await snapshot();
    const plan = planBootstrap(snap, {
      allowedFrom: "192.168.88.0/24",
      apiPassword: "generated-strong-password",
    });
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.writes.every((s) => s.command.includes(CONNECTOR_TAG) || s.id === "service")).toBe(
      true,
    );
    expect(plan.writes.some((s) => /remove|disable=yes|reset/i.test(s.command))).toBe(false);
    expect(JSON.stringify(plan)).not.toContain("sticker-pass");
  });

  it("is idempotent when connector-owned objects already exist", async () => {
    const snap = await snapshot();
    const first = planBootstrap(snap, {
      allowedFrom: "192.168.88.0/24",
      apiPassword: "pw",
    });
    const after = {
      ...snap,
      groups: [...snap.groups, { ".id": "*9", name: "magic-api", comment: CONNECTOR_TAG }],
      users: [...snap.users, { ".id": "*9", name: "magic-api", comment: CONNECTOR_TAG }],
      services: snap.services.map((s) =>
        s["name"] === "www-ssl"
          ? { ...s, disabled: false as unknown as string, address: "192.168.88.0/24" }
          : s,
      ),
      firewall: [
        ...snap.firewall,
        {
          ".id": "*9",
          chain: "input",
          action: "accept",
          comment: `${CONNECTOR_TAG}: allow www-ssl from connector`,
        },
      ],
    };
    const second = planBootstrap(after, { allowedFrom: "192.168.88.0/24", apiPassword: "pw" });
    expect(second.steps.filter((s) => s.action === "add").length).toBeLessThan(
      first.steps.filter((s) => s.action === "add").length,
    );
  });

  it("rollback touches only connector-owned objects", async () => {
    const snap = await snapshot();
    const plan = planBootstrap(snap, { allowedFrom: "192.168.88.0/24", apiPassword: "pw" });
    const script = buildRollback(plan, { backupName: "mm-backup" });
    const text = typeof script === "string" ? script : JSON.stringify(script);
    expect(text).toContain(CONNECTOR_TAG);
    expect(text).not.toMatch(/system reset-configuration/i);
    expect(text).not.toContain("pw");
  });
});
