import { describe, it, expect, vi } from "vitest";
import {
  selectTestMethod,
  sanitizeReason,
  classifyConnectorFailure,
  classifyCloudFailure,
  remediationFor,
  testViaConnector,
  testViaCloud,
  testViaSandbox,
  type RouterTestRow,
} from "@/lib/router-test.server";

const baseRow: RouterTestRow = {
  id: "r1",
  host: "192.168.88.1",
  port: 443,
  username: "api",
  use_tls: true,
};

describe("branch selection", () => {
  it("routes Magic Hub ahead of a leftover connector_id so CGNAT hosts are never dialled", () => {
    expect(selectTestMethod({ connector_id: "c1", connection_mode: "hub" })).toBe("hub");
    expect(selectTestMethod({ connector_id: "c1", connection_mode: "cloud" })).toBe("hub");
    expect(selectTestMethod({ connector_id: "c1", connection_mode: "direct" })).toBe("connector");
  });
  it("routes sandbox ahead of every network transport", () => {
    expect(selectTestMethod({ connection_mode: "sandbox" })).toBe("sandbox");
    expect(selectTestMethod({ connector_id: "c1", connection_mode: "sandbox" })).toBe("sandbox");
  });
  it("routes cloud and direct rows correctly", () => {
    expect(selectTestMethod({ connection_mode: "hub" })).toBe("hub");
    expect(selectTestMethod({ connection_mode: "cloud" })).toBe("hub");
    expect(selectTestMethod({ connection_mode: "direct" })).toBe("direct");
    expect(selectTestMethod({})).toBe("direct");
  });
});

describe("connector transport test", () => {
  const online = {
    id: "c1",
    name: "Site A",
    enabled: true,
    status: "online",
    last_seen_at: new Date().toISOString(),
  };
  const row = { ...baseRow, connector_id: "c1" };

  it("never dials the public host and pings through the connector", async () => {
    const ping = vi.fn().mockResolvedValue({ version: "7.14" });
    const res = await testViaConnector(row, {
      loadConnector: async () => online,
      ping,
    });
    expect(res.ok).toBe(true);
    expect(res.method).toBe("connector");
    expect(ping).toHaveBeenCalledTimes(1);
    expect(res.endpoint).not.toContain(row.host);
    expect(JSON.stringify(res)).not.toContain("TCP");
  });

  it("reports an unpaired connector without pinging", async () => {
    const ping = vi.fn();
    const res = await testViaConnector(row, { loadConnector: async () => null, ping });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("connector_unpaired");
    expect(ping).not.toHaveBeenCalled();
    expect(res.remediation.length).toBeGreaterThan(0);
  });

  it("reports a disabled connector", async () => {
    const res = await testViaConnector(row, {
      loadConnector: async () => ({ ...online, enabled: false }),
      ping: vi.fn(),
    });
    expect(res.reason).toBe("connector_disabled");
  });

  it("reports an offline connector", async () => {
    const res = await testViaConnector(row, {
      loadConnector: async () => ({ ...online, status: "offline" }),
      ping: vi.fn(),
    });
    expect(res.reason).toBe("connector_offline");
  });

  it("reports a stale heartbeat separately from offline", async () => {
    const res = await testViaConnector(row, {
      loadConnector: async () => ({
        ...online,
        last_seen_at: new Date(Date.now() - 10 * 60_000).toISOString(),
      }),
      ping: vi.fn(),
    });
    expect(res.reason).toBe("connector_stale_heartbeat");
  });

  it("classifies job timeout, LAN unreachable and RouterOS auth failures", async () => {
    const cases: Array<[string, string]> = [
      ["The local connector did not answer in time.", "connector_job_timeout"],
      ["connect ECONNREFUSED 192.168.88.1:443", "connector_target_unreachable"],
      ["RouterOS 401 Unauthorized", "routeros_unauthorized"],
      ["RouterOS 403 Forbidden", "routeros_forbidden"],
    ];
    for (const [msg, reason] of cases) {
      const res = await testViaConnector(row, {
        loadConnector: async () => online,
        ping: async () => {
          throw new Error(msg);
        },
      });
      expect(res.reason).toBe(reason);
      expect(res.remediation).toEqual(remediationFor(res.reason!));
    }
  });

  it("never leaks credentials in the failure reason", async () => {
    const res = await testViaConnector(row, {
      secrets: ["s3cr3t-pass"],
      loadConnector: async () => online,
      ping: async () => {
        throw new Error("auth failed for https://api:s3cr3t-pass@192.168.88.1/rest");
      },
    });
    expect(res.error).not.toContain("s3cr3t-pass");
  });
});

describe("cloud transport test", () => {
  const row = { ...baseRow, connection_mode: "hub", cloud_peer_id: "p1" };
  const restBase = (id: string) => `https://hub.example/peers/${id}/rest`;

  it("tests through the hub REST base, not the router public host", async () => {
    const ping = vi.fn().mockResolvedValue({ version: "7.14" });
    const res = await testViaCloud(row, {
      isConfigured: () => true,
      restBase,
      peerStatus: async () => ({ status: "online", lastHandshakeAt: new Date().toISOString() }),
      ping,
    });
    expect(res.ok).toBe(true);
    expect(res.method).toBe("hub");
    expect(ping).toHaveBeenCalledWith(restBase("p1"));
    expect(res.endpoint).toContain("/peers/p1/rest");
    expect(res.endpoint).not.toContain(row.host);
  });

  it("fails fast when no peer is provisioned", async () => {
    const ping = vi.fn();
    const res = await testViaCloud(
      { ...row, cloud_peer_id: null },
      { isConfigured: () => true, restBase, ping },
    );
    expect(res.reason).toBe("cloud_peer_missing");
    expect(ping).not.toHaveBeenCalled();
  });

  it("reports a stale WireGuard handshake", async () => {
    const res = await testViaCloud(row, {
      isConfigured: () => true,
      restBase,
      peerStatus: async () => ({
        status: "online",
        lastHandshakeAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      }),
      ping: vi.fn(),
    });
    expect(res.reason).toBe("cloud_handshake_stale");
  });

  it("fails handshake when status is connecting and last handshake is never", async () => {
    const ping = vi.fn();
    const res = await testViaCloud(row, {
      isConfigured: () => true,
      restBase,
      peerStatus: async () => ({ status: "connecting", lastHandshakeAt: null }),
      ping,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("cloud_handshake_stale");
    expect(res.steps.some((s) => s.name === "WireGuard handshake" && s.status === "fail")).toBe(
      true,
    );
    expect(res.steps.some((s) => s.name.includes("system/resource"))).toBe(false);
    expect(ping).not.toHaveBeenCalled();
    expect(res.remediation.join(" ")).toMatch(/Show paste window/);
  });

  it("separates hub unavailability, proxy route and auth failures", async () => {
    expect(classifyCloudFailure("The VPS Router Manager API did not respond in time.")).toBe(
      "cloud_hub_unavailable",
    );
    expect(classifyCloudFailure("Router Manager API 404: peer route missing")).toBe(
      "cloud_proxy_route",
    );
    expect(classifyCloudFailure("RouterOS 401 Unauthorized")).toBe("routeros_unauthorized");
    expect(classifyCloudFailure("Magic Hub is not configured yet.")).toBe("cloud_not_configured");
  });

  it("treats nginx HTML 404/502 as hub proxy failure, not RouterOS 7.1 upgrade", () => {
    expect(
      classifyCloudFailure(
        "RouterOS API 404: <html>\n<head><title>404 Not Found</title></head>\n<body>\n<center><h1>404 Not Found</h1></center>\n<hr><center>nginx/1.24.0 (Ubuntu)</center>",
      ),
    ).toBe("cloud_proxy_route");
    expect(classifyCloudFailure("RouterOS API 502: bad gateway")).toBe("cloud_proxy_route");
    expect(remediationFor("cloud_proxy_route").join(" ")).not.toMatch(
      /RouterOS 7\.1\+ is required/,
    );
    expect(remediationFor("cloud_proxy_route").join(" ")).toMatch(/hub REST proxy/i);
  });

  it("keeps control-plane 502 as hub unavailable", () => {
    expect(classifyCloudFailure("Router Manager API 502: bad gateway")).toBe(
      "cloud_hub_unavailable",
    );
  });

  it("handshake remediations stay on WAN + paste window, not Scripts hopping", () => {
    const text = remediationFor("cloud_handshake_stale").join(" ");
    expect(text).toMatch(/WAN/i);
    expect(text).toMatch(/Show paste window/);
    expect(text).toMatch(/Ignore ping/);
  });

  it("never reports TCP closed for the cloud path", async () => {
    const res = await testViaCloud(row, {
      isConfigured: () => true,
      restBase,
      ping: async () => {
        throw new Error("Router Manager API 502: bad gateway");
      },
    });
    expect(res.ok).toBe(false);
    expect(JSON.stringify(res)).not.toContain("TCP");
  });
});

describe("shared helpers", () => {
  it("sanitizes inline credentials", () => {
    expect(sanitizeReason("https://admin:hunter22@10.0.0.1/rest")).toContain("//***:***@");
    expect(sanitizeReason("Authorization: Bearer abc.def")).not.toContain("abc.def");
  });
  it("classifies unknown connector errors conservatively", () => {
    expect(classifyConnectorFailure("something odd happened")).toBe("unknown");
  });
});

describe("testRouter routes by method before any direct host probing", () => {
  it("returns from the connector and cloud branches before DNS/TCP/TLS work", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/lib/routers.functions.ts", "utf8");
    const start = src.indexOf("const method = selectTestMethod(row)");
    expect(start).toBeGreaterThan(-1);
    const sandboxIdx = src.indexOf('if (method === "sandbox")', start);
    const connectorIdx = src.indexOf('if (method === "connector")', start);
    const cloudIdx = src.indexOf('if (method === "hub")', start);
    expect(sandboxIdx).toBeGreaterThan(start);
    expect(connectorIdx).toBeGreaterThan(sandboxIdx);
    expect(cloudIdx).toBeGreaterThan(connectorIdx);

    const afterBranches = src.slice(start, cloudIdx);
    // No DNS resolution or raw socket dialing may happen before the branches.
    expect(afterBranches).not.toMatch(/dns\.(lookup|resolve)/);
    expect(afterBranches).not.toMatch(/net\.(connect|createConnection)/);
    expect(afterBranches).not.toMatch(/tls\.connect/);
  });

  it("cloud results never reference the router public host", async () => {
    const res = await testViaCloud(
      { ...baseRow, connection_mode: "hub", cloud_peer_id: "p1" },
      {
        isConfigured: () => true,
        restBase: () => "https://hub.example.net/peer/p1",
        peerStatus: async () => ({
          status: "online",
          lastHandshakeAt: new Date().toISOString(),
        }),
        ping: async () => ({ version: "7.14" }),
      },
    );
    expect(res.ok).toBe(true);
    expect(JSON.stringify(res)).not.toContain(baseRow.host);
  });
});

describe("sandbox transport test", () => {
  it("fails closed for leftover virtual-lab rows and never dials a host", async () => {
    const res = await testViaSandbox({
      ...baseRow,
      connection_mode: "sandbox",
      host: "sandbox.local",
    });
    expect(res.ok).toBe(false);
    expect(res.method).toBe("sandbox");
    expect(res.reason).toBe("sandbox_unavailable");
    expect(res.endpoint).toBe("sandbox:/rest/system/resource");
    expect(res.remediation.length).toBeGreaterThan(0);
    expect(JSON.stringify(res)).not.toMatch(/47\.|10\.77\.|192\.168/);
  });
});
