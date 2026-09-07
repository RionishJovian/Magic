/**
 * Factory-router bootstrap: ordering, SSH host-key verification, certificate
 * handling, platform behaviour and rollback.
 *
 * Everything RouterOS-side is MOCKED. No real hardware, nothing destructive,
 * no WinBox, no reset, no public service, no global TLS bypass.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";

import {
  sshSnapshot,
  sshBackup,
  sshApplyRestAccess,
  sshHostKeyIdentity,
  sshKeyFingerprint,
  readKnownHostKeys,
  sshCommand,
  sshAvailable,
  sshMissingMessage,
  parseTerseRow,
  parseSections,
} from "@/agent/lib/routeros.mjs";
import {
  planBootstrap,
  buildRollback,
  certUsable,
  MAGIC_CERT,
  MAGIC_POLICY,
  CONNECTOR_TAG,
} from "@/agent/lib/bootstrap.mjs";

const HOST = "192.168.88.1";
const ALLOWED_FROM = "192.168.88.10/32";

/** Factory RouterOS: www-ssl disabled, no certificate at all. */
const FACTORY_SSH_OUTPUT = [
  "@@identity",
  "MikroTik",
  "@@version",
  "7.15.3 (stable)",
  "@@board",
  "RB4011iGS+",
  "@@serial",
  "HGT08ABCDEF",
  "@@services",
  ' 0   X name="www-ssl" address="" port=443 certificate=none',
  ' 1     name="www" address="" port=80',
  "@@certs",
  "@@groups",
  ' 0   name="full" policy="read,write,policy,test"',
  "@@users",
  ' 0   name="admin" group="full" address=""',
].join("\n");

function mockSsh(output: string, log: string[][]) {
  return async ({ commands }: { commands: string[] }) => {
    log.push(commands);
    return output;
  };
}

const READ_ONLY = /^(:put|:do|\/(ip service|certificate|user group|user) print|:local|:if)/;

describe("factory bootstrap ordering", () => {
  it("takes a strictly read-only SSH snapshot", async () => {
    const log: string[][] = [];
    const snap = await sshSnapshot({
      host: HOST,
      username: "admin",
      password: "",
      hostKeyPolicy: "yes",
      ssh: mockSsh(FACTORY_SSH_OUTPUT, log),
    });

    expect(snap.identity).toBe("MikroTik");
    expect(snap.version).toBe("7.15.3 (stable)");
    expect(snap.serial).toBe("HGT08ABCDEF");
    expect(snap.services.map((s: { name: string }) => s.name)).toContain("www-ssl");
    expect(snap.certificates).toEqual([]);

    const issued = log.flat().join("\n");
    for (const cmd of log.flat()) expect(cmd).toMatch(READ_ONLY);
    expect(issued).not.toMatch(/\b(set|add|remove|sign|save|reset)\b/);
  });

  it("runs read snapshot -> backup -> first write, never a write before the backup", async () => {
    const order: string[] = [];
    const ssh = async ({ commands }: { commands: string[] }) => {
      const joined = commands.join(" ");
      if (joined.includes("@@identity")) order.push("read");
      else if (joined.includes("backup save")) order.push("backup");
      else order.push("write");
      return FACTORY_SSH_OUTPUT;
    };

    const snap = await sshSnapshot({ host: HOST, username: "admin", password: "", ssh });
    const plan = planBootstrap(snap, {
      allowedFrom: ALLOWED_FROM,
      commonName: "MikroTik",
      requireCertificate: true,
    });
    expect(plan.blocked).toBe(false);
    // planning performs no I/O at all
    expect(order).toEqual(["read"]);

    await sshBackup({
      host: HOST,
      username: "admin",
      password: "",
      name: "mikromagic-test",
      backupPassword: "x",
      ssh,
    });
    await sshApplyRestAccess({
      host: HOST,
      username: "admin",
      password: "",
      allowedFrom: ALLOWED_FROM,
      certificate: plan.certificate,
      createCertificate: true,
      ssh,
    });

    expect(order).toEqual(["read", "backup", "write"]);
    expect(order.indexOf("backup")).toBeLessThan(order.indexOf("write"));
  });

  it("the CLI calls the SSH writes only after the APPLY prompt and the backup", () => {
    const src = readFileSync("src/agent/setup-cli.mjs", "utf8");
    const apply = src.indexOf('Type "APPLY" to continue');
    const backup = src.indexOf("await sshBackup(");
    const restBackup = src.indexOf("/system/backup/save");
    const write = src.indexOf("await sshApplyRestAccess(");
    const restWrite = src.indexOf("for (const s of plan.writes)");

    expect(apply).toBeGreaterThan(0);
    expect(backup).toBeGreaterThan(apply);
    expect(restBackup).toBeGreaterThan(apply);
    expect(write).toBeGreaterThan(backup);
    expect(restWrite).toBeGreaterThan(restBackup);
    // the old pre-APPLY write helper is gone
    expect(src).not.toContain("enableRestOverSsh");
  });

  it("refuses SSH writes without a Connector address restriction", async () => {
    await expect(
      sshApplyRestAccess({ host: HOST, username: "admin", password: "", allowedFrom: null }),
    ).rejects.toThrow(/address restriction/i);
  });
});

describe("www-ssl certificate", () => {
  it("plans a tagged Connector certificate when the factory service has none", () => {
    const plan = planBootstrap(
      {
        groups: [],
        users: [],
        services: [{ name: "www-ssl", disabled: "true", address: "", certificate: "none" }],
        certificates: [],
      },
      { allowedFrom: ALLOWED_FROM, commonName: "MikroTik", requireCertificate: true },
    );
    const cert = plan.steps.find((s: { id: string }) => s.id === "certificate");
    expect(cert.action).toBe("add");
    expect(cert.command).toContain(`name=${MAGIC_CERT}`);
    expect(cert.command).toContain("key-usage=tls-server");
    expect(cert.command).toContain(CONNECTOR_TAG);
    expect(plan.certificate).toBe(MAGIC_CERT);

    const svc = plan.steps.find((s: { id: string }) => s.id === "service");
    expect(svc.payload.certificate).toBe(MAGIC_CERT);
    expect(svc.command).toContain(`certificate=${MAGIC_CERT}`);
  });

  it("reuses a suitable certificate already assigned to www-ssl", () => {
    const plan = planBootstrap(
      {
        services: [
          { name: "www-ssl", disabled: "false", address: ALLOWED_FROM, certificate: "site-cert" },
        ],
        certificates: [{ name: "site-cert", "private-key": "true", flags: "KAT" }],
      },
      { allowedFrom: ALLOWED_FROM, requireCertificate: true },
    );
    const cert = plan.steps.find((s: { id: string }) => s.id === "certificate");
    expect(cert.action).toBe("skip");
    expect(plan.certificate).toBe("site-cert");
  });

  it("treats an untagged mikromagic-connector-cert as a blocking conflict", () => {
    const plan = planBootstrap(
      {
        services: [{ name: "www-ssl", disabled: "true", address: "", certificate: "none" }],
        certificates: [{ name: MAGIC_CERT, "private-key": "true", comment: "someone else" }],
      },
      { allowedFrom: ALLOWED_FROM, requireCertificate: true },
    );
    expect(plan.blocked).toBe(true);
    expect(plan.conflicts.map((c: { id: string }) => c.id)).toContain("certificate");
    expect(plan.writes).toEqual([]);
  });

  it("rejects a certificate without a private key", () => {
    expect(certUsable({ name: "x", "private-key": "false" })).toBe(false);
    expect(certUsable({ name: "x", flags: "R" })).toBe(false);
    expect(certUsable({ name: "x", flags: "KAT" })).toBe(true);
    expect(certUsable(undefined)).toBe(false);
  });

  it("never falls back to plain HTTP or a weaker service", () => {
    const plan = planBootstrap(
      {
        services: [
          { name: "www-ssl", disabled: "true", address: "", certificate: "none" },
          { name: "www", disabled: "false", address: "" },
        ],
        certificates: [],
      },
      { allowedFrom: ALLOWED_FROM, requireCertificate: true },
    );
    const commands = plan.steps.map((s: { command: string }) => s.command).join("\n");
    expect(commands).not.toMatch(/name=www(?![-\w])/);
    expect(commands).not.toMatch(/api-ssl|telnet|ftp/);
  });
});

describe("rollback with a created certificate", () => {
  it("removes the certificate it created and restores the previous assignment", () => {
    const plan = planBootstrap(
      {
        services: [{ name: "www-ssl", disabled: "true", address: "", certificate: "" }],
        certificates: [],
      },
      { allowedFrom: ALLOWED_FROM, requireCertificate: true },
    );
    const rollback = buildRollback(plan, {
      backupName: "b1",
      appliedSteps: plan.writes,
    });
    expect(rollback.script).toContain(`/certificate/remove [find name=${MAGIC_CERT}`);
    expect(rollback.script).toContain("disabled=yes");
    expect(rollback.script).toContain("certificate=none");
    // the service is restored before the certificate it referenced is removed
    expect(rollback.script.indexOf("/ip/service/set")).toBeLessThan(
      rollback.script.indexOf("/certificate/remove"),
    );
  });

  it("does not remove a reused, pre-existing certificate", () => {
    const plan = planBootstrap(
      {
        services: [{ name: "www-ssl", disabled: "true", address: "", certificate: "site-cert" }],
        certificates: [{ name: "site-cert", "private-key": "true", flags: "KAT" }],
      },
      { allowedFrom: ALLOWED_FROM, requireCertificate: true },
    );
    const rollback = buildRollback(plan, { appliedSteps: plan.writes });
    expect(rollback.script).not.toContain("/certificate/remove");
    expect(rollback.script).toContain("certificate=site-cert");
  });
});

describe("SSH host identity", () => {
  const KEY = Buffer.from("fake-ed25519-key-blob").toString("base64");
  const OTHER = Buffer.from("a-different-key-blob").toString("base64");

  it("computes OpenSSH SHA256 fingerprints", () => {
    expect(sshKeyFingerprint(KEY)).toMatch(/^SHA256:[A-Za-z0-9+/]+$/);
    expect(sshKeyFingerprint(KEY)).not.toContain("=");
  });

  it("reads plain known_hosts entries and ignores hashed ones", () => {
    const read = () =>
      [
        `# comment`,
        `|1|hashed|entry ssh-ed25519 ${KEY}`,
        `192.168.88.1,[192.168.88.1]:22 ssh-ed25519 ${KEY}`,
      ].join("\n");
    const keys = readKnownHostKeys(HOST, "/nonexistent", read as never);
    expect(keys).toHaveLength(1);
    expect(keys[0].fingerprint).toBe(sshKeyFingerprint(KEY));
  });

  it("reports an unknown key so the operator must confirm it", async () => {
    const id = await sshHostKeyIdentity(HOST, {
      knownHostKeys: [],
      scanImpl: async () => [{ keyType: "ssh-ed25519", fingerprint: sshKeyFingerprint(KEY) }],
    });
    expect(id.known).toBe(false);
    expect(id.mismatch).toBe(false);
    expect(id.fingerprint).toBe(sshKeyFingerprint(KEY));
  });

  it("correlates an already-known key", async () => {
    const id = await sshHostKeyIdentity(HOST, {
      knownHostKeys: [{ keyType: "ssh-ed25519", fingerprint: sshKeyFingerprint(KEY) }],
      scanImpl: async () => [{ keyType: "ssh-ed25519", fingerprint: sshKeyFingerprint(KEY) }],
    });
    expect(id.known).toBe(true);
    expect(id.mismatch).toBe(false);
  });

  it("flags a changed key as a mismatch and never replaces it", async () => {
    const id = await sshHostKeyIdentity(HOST, {
      knownHostKeys: [{ keyType: "ssh-ed25519", fingerprint: sshKeyFingerprint(KEY) }],
      scanImpl: async () => [{ keyType: "ssh-ed25519", fingerprint: sshKeyFingerprint(OTHER) }],
    });
    expect(id.mismatch).toBe(true);
    expect(id.known).toBe(false);
  });

  it("requires an explicit host key policy", async () => {
    await expect(
      sshCommand({
        host: HOST,
        username: "admin",
        password: "",
        commands: [":put 1"],
        hostKeyPolicy: "no",
      }),
    ).rejects.toThrow(/host key policy/i);
  });

  it("the CLI aborts on a mismatch and confirms an unknown key before any write", () => {
    const src = readFileSync("src/agent/setup-cli.mjs", "utf8");
    const mismatch = src.indexOf("SSH HOST KEY MISMATCH");
    const snapshot = src.indexOf("await sshSnapshot(");
    expect(mismatch).toBeGreaterThan(0);
    expect(mismatch).toBeLessThan(snapshot);
    expect(src).toContain("Type YES to accept exactly this SSH host key");
  });
});

describe("cross-platform SSH", () => {
  function fakeSpawn(record: {
    args?: string[];
    stdio?: unknown;
    env?: NodeJS.ProcessEnv;
    stdin?: string;
  }) {
    return (_cmd: string, args: string[], opts: Record<string, unknown>) => {
      record.args = args;
      record.stdio = opts.stdio;
      record.env = opts.env as NodeJS.ProcessEnv;
      const askpass = (opts.env as NodeJS.ProcessEnv)?.SSH_ASKPASS;
      if (askpass)
        (record as { askpassContent?: string }).askpassContent = readFileSync(askpass, "utf8");
      const child = new EventEmitter() as EventEmitter & {
        stdout: PassThrough;
        stderr: PassThrough;
        stdin: PassThrough;
        kill: () => void;
      };
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdin = new PassThrough();
      child.kill = () => {};
      let buffered = "";
      child.stdin.on("data", (d) => (buffered += d.toString()));
      child.stdin.on("finish", () => {
        record.stdin = buffered;
        child.stdout.end("ok\n");
        setImmediate(() => child.emit("close", 0));
      });
      return child;
    };
  }

  const okExec = () => Buffer.from("OpenSSH_9.6");

  it("runs on Windows through the console prompt, with no askpass and no secret in env/argv", async () => {
    const rec: Record<string, unknown> = {};
    const out = await sshCommand({
      host: HOST,
      username: "admin",
      password: "s3cret",
      commands: [":put [/system identity get name]"],
      platformName: "win32",
      spawnImpl: fakeSpawn(rec as never) as never,
      execImpl: okExec as never,
    });
    expect(out).toContain("ok");
    expect(rec.stdio).toEqual(["pipe", "pipe", "inherit"]);
    const env = rec.env as NodeJS.ProcessEnv;
    expect(env.SSH_ASKPASS).toBeUndefined();
    expect(JSON.stringify(rec.args)).not.toContain("s3cret");
    expect(JSON.stringify(env)).not.toContain("s3cret");
    expect(String(rec.stdin)).not.toContain("s3cret");
    expect(String(rec.stdin)).toContain("/system identity get name");
  });

  it("uses the in-memory askpass channel on POSIX, still without the secret in argv/env", async () => {
    const rec: Record<string, unknown> = {};
    await sshCommand({
      host: HOST,
      username: "admin",
      password: "s3cret",
      commands: [":put 1"],
      platformName: "linux",
      spawnImpl: fakeSpawn(rec as never) as never,
      execImpl: okExec as never,
    });
    const env = rec.env as NodeJS.ProcessEnv;
    expect(env.SSH_ASKPASS).toBeTruthy();
    expect(env.SSH_ASKPASS_REQUIRE).toBe("force");
    expect(String(rec.askpassContent)).toContain("askpass.sock");
    expect(String(rec.askpassContent)).not.toContain("s3cret");
    expect(JSON.stringify(rec.args)).not.toContain("s3cret");
    expect(JSON.stringify(env)).not.toContain("s3cret");
  });

  it("fails with actionable instructions when ssh is missing", async () => {
    const missing = () => {
      throw new Error("not found");
    };
    await expect(
      sshCommand({
        host: HOST,
        username: "admin",
        password: "",
        commands: [":put 1"],
        platformName: "win32",
        execImpl: missing as never,
      }),
    ).rejects.toThrow(/OpenSSH.Client/);
    expect(sshAvailable(missing as never)).toBe(false);
    expect(sshMissingMessage("darwin")).toMatch(/xcode-select/);
    expect(sshMissingMessage("linux")).toMatch(/openssh-client/);
  });
});

describe("terse parsing", () => {
  it("parses flags and quoted values", () => {
    const row = parseTerseRow(' 0   X name="www-ssl" address="" port=443 certificate=none');
    expect(row).toMatchObject({ name: "www-ssl", port: "443", certificate: "none", flags: "X" });
  });

  it("returns null for noise", () => {
    expect(parseTerseRow("")).toBeNull();
    expect(parseTerseRow("[admin@MikroTik] >")).toBeNull();
  });

  it("splits marker sections", () => {
    const sections = parseSections("@@a\n1\n@@b\n2\n3\n");
    expect(sections.a).toEqual(["1"]);
    expect(sections.b).toEqual(["2", "3"]);
  });
});

describe("policy", () => {
  it("grants rest-api but not the separate binary api policy", () => {
    expect(MAGIC_POLICY).toBe("read,write,rest-api");
    for (const forbidden of ["api", "winbox", "policy", "password", "sensitive", "ssh", "ftp"]) {
      expect(MAGIC_POLICY.split(",")).not.toContain(forbidden);
    }
  });
});
