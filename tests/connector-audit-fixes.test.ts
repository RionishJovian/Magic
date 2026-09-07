import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSetupBundle } from "@/lib/connector-bundle";
import { assertCloudBaseUrl } from "@/agent/lib/net.mjs";
import { fallbackCandidates } from "@/agent/lib/net.mjs";
import {
  buildRollback,
  planBootstrap,
  CONNECTOR_TAG,
  MAGIC_POLICY,
} from "@/agent/lib/bootstrap.mjs";
import { saveToken, loadToken, clearToken } from "@/agent/lib/token-store.mjs";

const MODULE_FILES = [
  "redact",
  "retry",
  "net",
  "mndp",
  "state",
  "token-store",
  "routeros",
  "bootstrap",
  "discovery",
].map((f) => `src/agent/lib/${f}.mjs`);

function bundle(): string {
  const sources = [...MODULE_FILES, "src/agent/setup-cli.mjs"].map((f) => readFileSync(f, "utf8"));
  return buildSetupBundle(sources);
}

describe("setup-tool bundle", () => {
  it("is valid JavaScript according to node --check", () => {
    const dir = mkdtempSync(join(tmpdir(), "mm-bundle-"));
    const file = join(dir, "connector-setup.mjs");
    writeFileSync(file, bundle());
    expect(() => execFileSync(process.execPath, ["--check", file])).not.toThrow();
  });

  it("emits each node builtin binding exactly once", () => {
    const out = bundle();
    const imports = out.split("\n").filter((l) => l.startsWith("import "));
    const bindings = imports.flatMap((line) => {
      const m = /\{([^}]*)\}/.exec(line);
      return m ? m[1]!.split(",").map((s) => s.trim()) : [];
    });
    expect(new Set(bindings).size).toBe(bindings.length);
    expect(bindings.filter((b) => b === "writeFileSync")).toHaveLength(1);
  });

  it("contains no relative imports or export statements", () => {
    const out = bundle();
    expect(out).not.toMatch(/^import[\s\S]*?from\s*["']\.\//m);
    expect(out).not.toMatch(/^export\s/m);
  });

  it("keeps the shebang only on the first line", () => {
    const out = bundle();
    expect(out.startsWith("#!/usr/bin/env node")).toBe(true);
    expect(out.split("\n").filter((l) => l.startsWith("#!"))).toHaveLength(1);
  });
});

describe("cloud transport policy", () => {
  it("accepts https", () => {
    expect(assertCloudBaseUrl("https://mikromagic.app").protocol).toBe("https:");
  });

  it("rejects plain http to a remote host even with the override", () => {
    expect(() =>
      assertCloudBaseUrl("http://mikromagic.app", { allowInsecureLocalhost: true }),
    ).toThrow(/plain HTTP/i);
  });

  it("rejects plain http to localhost without the explicit override", () => {
    expect(() => assertCloudBaseUrl("http://localhost:8080")).toThrow(/plain HTTP/i);
  });

  it("allows localhost http only with the explicit development override", () => {
    expect(
      assertCloudBaseUrl("http://127.0.0.1:8080", { allowInsecureLocalhost: true }).hostname,
    ).toBe("127.0.0.1");
  });
});

describe("discovery fallback bounds", () => {
  it("always includes the RouterOS factory address when no CIDR is known", () => {
    const candidates = fallbackCandidates(null, 64);
    expect(candidates).toContain("192.168.88.1");
    expect(candidates.length).toBeLessThanOrEqual(64);
  });

  it("stays inside the supplied private CIDR and never probes public space", () => {
    const candidates = fallbackCandidates("10.10.5.0/24", 32);
    expect(candidates.length).toBeLessThanOrEqual(33);
    for (const ip of candidates) {
      expect(ip.startsWith("10.10.5.") || ip === "192.168.88.1").toBe(true);
    }
  });
});

describe("bootstrap policy and rollback scope", () => {
  const fresh = { groups: [], users: [], services: [{ name: "www-ssl", disabled: true }] };

  it("requests only the minimum RouterOS policies", () => {
    for (const forbidden of ["winbox", "policy", "password", "sensitive", "ftp", "romon"]) {
      expect(MAGIC_POLICY.split(",")).not.toContain(forbidden);
    }
    expect(MAGIC_POLICY.split(",").sort()).toEqual(["read", "rest-api", "write"].sort());
  });

  it("refuses to enable the service without a source restriction", () => {
    const plan = planBootstrap(fresh, { allowedFrom: null });
    expect(plan.blocked).toBe(true);
  });

  it("restricts the service and user to the connector /32", () => {
    const plan = planBootstrap(fresh, { allowedFrom: "192.168.88.10/32" });
    const service = plan.writes.find((s: { id: string }) => s.id === "service");
    const user = plan.writes.find((s: { id: string }) => s.id === "user");
    expect(service.payload.address).toBe("192.168.88.10/32");
    expect(user.payload.address).toBe("192.168.88.10/32");
  });

  it("updates the group policy, not only its comment", () => {
    const existing = {
      groups: [{ ".id": "*1", name: "magic-api", comment: CONNECTOR_TAG, policy: "read" }],
      users: [],
      services: [{ name: "www-ssl", disabled: true }],
    };
    const plan = planBootstrap(existing, { allowedFrom: "192.168.88.10/32" });
    const group = plan.writes.find((s: { id: string }) => s.id === "group");
    expect(group.action).toBe("update");
    expect(group.payload.policy).toBe(MAGIC_POLICY);
  });

  it("removes only what this run added and restores what it updated", () => {
    const existing = {
      groups: [{ ".id": "*1", name: "magic-api", comment: CONNECTOR_TAG, policy: "read" }],
      users: [],
      services: [{ ".id": "*3", name: "www-ssl", disabled: true }],
    };
    const plan = planBootstrap(existing, { allowedFrom: "192.168.88.10/32" });
    const rollback = buildRollback(plan, { backupName: "b1", appliedSteps: plan.writes });
    // The pre-existing Connector group must be restored, never removed.
    expect(rollback.script).not.toMatch(/\/user\/group\/remove/);
    expect(rollback.script).toMatch(/\/user\/group\/set .*policy=read/);
    // The user was created by this run, so it is removed.
    expect(rollback.script).toMatch(/\/user\/remove/);
    expect(rollback.script).not.toMatch(/reset-configuration/);
  });

  it("only rolls back steps that were actually applied", () => {
    const plan = planBootstrap(fresh, { allowedFrom: "192.168.88.10/32" });
    const partial = plan.writes.slice(0, 1);
    const rollback = buildRollback(plan, { backupName: "b1", appliedSteps: partial });
    expect(rollback.commands).toHaveLength(1);
  });
});

describe("connector token storage", () => {
  it("never leaves the token readable as plaintext in the fallback store", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mm-token-"));
    const token = "mm_test_token_value_1234567890";
    await saveToken(dir, token);
    expect(await loadToken(dir)).toBe(token);

    // grep exits 1 when nothing matches, which is exactly what we want.
    let matches = "";
    try {
      matches = execFileSync("grep", ["-rl", token, dir], { encoding: "utf8" }).trim();
    } catch {
      matches = "";
    }
    expect(matches).toBe("");
    await clearToken(dir);
    expect(await loadToken(dir)).toBeNull();
  });

  it("refuses to store an empty token", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mm-token-"));
    await expect(saveToken(dir, "")).rejects.toThrow();
  });
});
