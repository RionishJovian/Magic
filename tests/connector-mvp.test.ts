import { describe, expect, it, vi } from "vitest";
import {
  parseMndpPacket,
  dedupeDevices,
  deviceFingerprint,
  describeDevice,
} from "@/agent/lib/mndp.mjs";
import { fallbackCandidates, isPrivateIPv4, MAX_FALLBACK_CANDIDATES } from "@/agent/lib/net.mjs";
import { canTransition, transition, ROUTER_STATES } from "@/agent/lib/state.mjs";
import { redact, redactText, safeError } from "@/agent/lib/redact.mjs";
import { backoffDelay, withRetry } from "@/agent/lib/retry.mjs";
import { planBootstrap, buildRollback, CONNECTOR_TAG } from "@/agent/lib/bootstrap.mjs";
import { validateJobTarget } from "@/lib/connector-guard.server";
import { redactDeep } from "@/lib/redact.server";

function tlv(type: number, value: Buffer | string) {
  const val = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  const head = Buffer.alloc(4);
  head.writeUInt16BE(type, 0);
  head.writeUInt16BE(val.length, 2);
  return Buffer.concat([head, val]);
}

function mndpPacket(parts: Buffer[]) {
  return Buffer.concat([Buffer.alloc(4), ...parts]);
}

describe("MNDP parsing", () => {
  it("extracts identity, version, board and mac", () => {
    const pkt = mndpPacket([
      tlv(1, Buffer.from([0x48, 0x8f, 0x5a, 0x11, 0x22, 0x33])),
      tlv(5, "MikroTik-RB4011"),
      tlv(7, "7.14.3"),
      tlv(8, "MikroTik"),
      tlv(12, "RB4011iGS+"),
    ]);
    const d = parseMndpPacket(pkt, "192.168.88.1");
    expect(d).toMatchObject({
      identity: "MikroTik-RB4011",
      version: "7.14.3",
      platform: "MikroTik",
      model: "RB4011iGS+",
      mac: "48:8F:5A:11:22:33",
      ip: "192.168.88.1",
    });
  });

  it("never throws on truncated or hostile packets", () => {
    expect(parseMndpPacket(Buffer.alloc(0))).toBeNull();
    expect(parseMndpPacket(Buffer.alloc(3))).toBeNull();
    const lying = mndpPacket([Buffer.from([0, 5, 0xff, 0xff])]);
    expect(() => parseMndpPacket(lying, "10.0.0.1")).not.toThrow();
  });

  it("caps oversized strings and strips control characters", () => {
    const d = parseMndpPacket(mndpPacket([tlv(5, "a\u0000b".padEnd(400, "x"))]), "10.0.0.2");
    expect(d?.identity?.length).toBeLessThanOrEqual(128);
    expect(d?.identity).not.toContain("\u0000");
  });

  it("shows unknown instead of blanks", () => {
    expect(describeDevice({ identity: null, ip: "10.0.0.1" })).toMatchObject({
      identity: "unknown",
      model: "unknown",
      mac: "unknown",
    });
  });
});

describe("device dedupe", () => {
  it("merges sightings by mac and fills missing fields", () => {
    const merged = dedupeDevices([
      { mac: "AA:BB:CC:00:11:22", identity: "R1", ip: null },
      { mac: "AA:BB:CC:00:11:22", identity: null, ip: "192.168.88.1", version: "7.14" },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ identity: "R1", ip: "192.168.88.1", version: "7.14" });
  });

  it("prefers serial as the fingerprint", () => {
    expect(deviceFingerprint({ serial: "abc123", mac: "AA:BB:CC:00:11:22" })).toBe("serial:ABC123");
    expect(deviceFingerprint({ mac: "aa:bb:cc:00:11:22" })).toBe("mac:AA:BB:CC:00:11:22");
  });

  it("keeps distinct devices apart", () => {
    expect(
      dedupeDevices([{ mac: "AA:BB:CC:00:11:22" }, { mac: "AA:BB:CC:00:11:33" }]),
    ).toHaveLength(2);
  });
});

describe("fallback candidate bounds", () => {
  it("always includes the RouterOS default address", () => {
    expect(fallbackCandidates(null)).toContain("192.168.88.1");
  });

  it("enumerates a /24 within the hard cap", () => {
    const c = fallbackCandidates("192.168.88.10/24");
    expect(c.length).toBeLessThanOrEqual(MAX_FALLBACK_CANDIDATES);
    expect(c).toContain("192.168.88.1");
  });

  it("never enumerates a large network and never leaves private space", () => {
    const c = fallbackCandidates("10.0.0.5/8");
    expect(c.length).toBeLessThanOrEqual(MAX_FALLBACK_CANDIDATES);
    expect(c.every((ip: string) => isPrivateIPv4(ip))).toBe(true);
  });

  it("ignores public CIDRs", () => {
    expect(fallbackCandidates("8.8.8.0/24")).toEqual(["192.168.88.1"]);
    expect(isPrivateIPv4("8.8.8.8")).toBe(false);
  });
});

describe("router state machine", () => {
  it("supports exactly the six MVP states", () => {
    expect(ROUTER_STATES).toEqual([
      "discovered",
      "authenticating",
      "configuring",
      "connected",
      "offline",
      "error",
    ]);
  });

  it("allows the happy path and rejects illegal jumps", () => {
    let s = "discovered";
    s = transition(s, "authenticating");
    s = transition(s, "configuring");
    s = transition(s, "connected");
    expect(s).toBe("connected");
    expect(canTransition("discovered", "configuring")).toBe(false);
    expect(() => transition("discovered", "connected")).toThrow();
    expect(canTransition("anything", "connected")).toBe(false);
  });
});

describe("redaction", () => {
  it("masks bearer tokens, basic auth and password assignments", () => {
    expect(redactText("Authorization: Bearer abc.def")).toContain("[redacted]");
    expect(redactText("Basic YWRtaW46cHc=")).toContain("[redacted]");
    expect(redactText("password=hunter2")).toBe("password=[redacted]");
    expect(redactText("https://admin:pw@192.168.88.1/rest")).toContain(":[redacted]@");
  });

  it("deep-redacts secret-bearing keys on both agent and server", () => {
    const input = {
      headers: { authorization: "Bearer x" },
      nested: { api_password: "p" },
      ip: "10.0.0.1",
    };
    for (const fn of [redact, redactDeep]) {
      const out = fn(input) as Record<string, never>;
      expect(JSON.stringify(out)).not.toContain("Bearer x");
      expect(JSON.stringify(out)).not.toContain('"p"');
      expect(JSON.stringify(out)).toContain("10.0.0.1");
    }
  });

  it("produces safe single-line errors", () => {
    expect(safeError(new Error("failed token=abc\nsecond line"))).not.toContain("abc");
  });
});

describe("retry with backoff", () => {
  it("grows exponentially and stays jittered within bounds", () => {
    expect(backoffDelay(0, 100, 10000, () => 1)).toBe(100);
    expect(backoffDelay(3, 100, 10000, () => 1)).toBe(800);
    expect(backoffDelay(20, 100, 10000, () => 1)).toBe(10000);
    expect(backoffDelay(3, 100, 10000, () => 0)).toBe(0);
  });

  it("retries transient failures then succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new Error("boom");
        return "ok";
      },
      { retries: 5, sleep: async () => {}, random: () => 0 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("stops immediately for non-retryable failures", async () => {
    const fn = vi.fn(async () => {
      throw new Error("nope");
    });
    await expect(
      withRetry(fn, { retries: 3, sleep: async () => {}, shouldRetry: () => false }),
    ).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("bootstrap plan", () => {
  const empty = {
    groups: [],
    users: [],
    services: [{ name: "www-ssl", disabled: true }],
    firewall: [],
  };

  it("creates tagged objects on a fresh router", () => {
    const plan = planBootstrap(empty, { password: "x", allowedFrom: "192.168.88.0/24" });
    expect(plan.noop).toBe(false);
    const ids = plan.writes.map((s: { id: string }) => s.id);
    // No firewall rule is ever added: access is restricted on the service and
    // the magic-api user instead.
    expect(ids).toEqual(expect.arrayContaining(["group", "user", "service"]));
    expect(ids).not.toContain("firewall");
    expect(plan.steps.every((s: { tag: string }) => s.tag === CONNECTOR_TAG)).toBe(true);
  });

  it("is idempotent: re-running updates tagged objects instead of duplicating", () => {
    const already = {
      groups: [{ name: "magic-api", comment: CONNECTOR_TAG }],
      users: [{ name: "magic-api", comment: CONNECTOR_TAG }],
      services: [{ name: "www-ssl", disabled: false, address: "192.168.88.0/24" }],
      firewall: [{ comment: `${CONNECTOR_TAG}: allow www-ssl from connector` }],
    };
    const plan = planBootstrap(already, { password: "x", allowedFrom: "192.168.88.0/24" });
    expect(plan.writes.filter((s: { action: string }) => s.action === "add")).toHaveLength(0);
    expect(plan.steps.filter((s: { id: string }) => s.id === "user")).toHaveLength(1);
  });

  it("never touches objects it does not own", () => {
    const foreign = {
      groups: [{ name: "magic-api", comment: "created by hand" }],
      users: [{ name: "magic-api", comment: "created by hand" }],
      services: [{ name: "www-ssl", disabled: false }],
      firewall: [],
    };
    const plan = planBootstrap(foreign, { password: "x", allowedFrom: "192.168.88.10/32" });
    // Untagged objects with our names are an actionable conflict, never adopted.
    expect(plan.blocked).toBe(true);
    expect(plan.conflicts.length).toBeGreaterThanOrEqual(2);
    expect(plan.writes).toHaveLength(0);
  });

  it("never emits a command that deletes or disables existing config", () => {
    const plan = planBootstrap(empty, { password: "x", allowedFrom: "192.168.88.0/24" });
    for (const step of plan.writes) {
      expect(step.command).not.toMatch(/remove|disable=yes|reset-configuration/);
    }
  });
});

describe("rollback scope", () => {
  it("only removes connector-tagged objects and restores the touched service", () => {
    const plan = planBootstrap(
      { groups: [], users: [], services: [{ name: "www-ssl", disabled: true }], firewall: [] },
      { password: "x", allowedFrom: "192.168.88.0/24" },
    );
    const rb = buildRollback(plan, {
      backupName: "mikromagic-1",
      previousService: { name: "www-ssl", disabled: true, address: "" },
    });
    expect(rb.backupName).toBe("mikromagic-1");
    expect(rb.commands.every((c: string) => !/system\/reset|\/file\/remove/.test(c))).toBe(true);
    expect(rb.script).toContain(CONNECTOR_TAG);
    expect(rb.script).toContain("/ip/service/set [find name=www-ssl] disabled=yes");
    expect(rb.scope).toMatch(/does not restore files/i);
  });

  it("skips rollback commands for steps that were never applied", () => {
    const plan = planBootstrap(
      {
        groups: [{ name: "magic-api", comment: CONNECTOR_TAG }],
        users: [{ name: "magic-api", comment: CONNECTOR_TAG }],
        services: [{ name: "www-ssl", disabled: false }],
        firewall: [],
      },
      { password: "x", allowedFrom: null },
    );
    const rb = buildRollback(plan, {});
    expect(rb.commands.some((c: string) => c.includes("firewall"))).toBe(false);
  });
});

describe("connector job target validation", () => {
  it("accepts private LAN https targets", () => {
    const r = validateJobTarget({ url: "https://192.168.88.1/rest/system/resource" });
    expect(r.ok).toBe(true);
  });

  it("rejects public targets, other schemes and URL credentials", () => {
    for (const url of [
      "https://8.8.8.8/",
      "https://example.com/",
      "file:///etc/passwd",
      "gopher://192.168.88.1/",
      "https://admin:pw@192.168.88.1/",
    ]) {
      expect(validateJobTarget({ url }).ok).toBe(false);
    }
  });

  it("rejects dangerous headers and unsupported methods", () => {
    expect(validateJobTarget({ url: "https://192.168.88.1/", headers: { Cookie: "a=b" } }).ok).toBe(
      false,
    );
    expect(validateJobTarget({ url: "https://192.168.88.1/", method: "TRACE" }).ok).toBe(false);
  });

  it("rejects oversized bodies", () => {
    const r = validateJobTarget({ url: "https://192.168.88.1/", body: "x".repeat(600_000) });
    expect(r.ok).toBe(false);
  });

  it("normalises the method and lowercases headers", () => {
    const r = validateJobTarget({
      url: "https://10.1.2.3/rest",
      method: "post",
      headers: { "Content-Type": "application/json" },
    });
    expect(r.ok && r.method).toBe("POST");
    expect(r.ok && r.headers["content-type"]).toBe("application/json");
  });
});
