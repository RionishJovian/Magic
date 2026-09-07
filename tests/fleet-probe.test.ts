import { describe, it, expect, vi } from "vitest";
import { collectFleetSnapshot } from "@/lib/fleet-probe.server";
import type { RouterConn } from "@/lib/mikrotik.server";

const row = {
  id: "r1",
  name: "CCR_2004",
  host: "ccr2004.sn.mynetname.net",
  connection_mode: "hub",
};

function api(overrides: Partial<Parameters<typeof collectFleetSnapshot>[1]["api"]> = {}) {
  return {
    ping: vi.fn().mockResolvedValue({
      version: "7.7",
      uptime: "1d2h",
      "cpu-load": "12%",
      "free-memory": "0",
      "total-memory": "1024",
      "board-name": "CCR2004-16G-2S+",
    }),
    activeUsers: vi.fn().mockResolvedValue([{}]),
    listBindings: vi.fn().mockResolvedValue([{ type: "blocked" }, { type: "regular" }]),
    hosts: vi.fn().mockResolvedValue([{}, {}]),
    users: vi.fn().mockResolvedValue([{}]),
    ...overrides,
  };
}

describe("collectFleetSnapshot", () => {
  it("pings the loadRouterConn result, not a handmade public-host conn", async () => {
    const hubConn: RouterConn = {
      host: row.host,
      port: 443,
      username: "admin",
      password: "x",
      useTls: true,
      baseUrlOverride: "https://hub.example/peers/p1/rest",
    };
    const loadConn = vi.fn().mockResolvedValue(hubConn);
    const probe = api();
    const got = await collectFleetSnapshot(row, { loadConn, api: probe });
    expect(loadConn).toHaveBeenCalledWith("r1");
    expect(probe.ping).toHaveBeenCalledWith(hubConn);
    expect(got.online).toBe(true);
    expect(got.version).toBe("7.7");
    expect(got.cpu_load).toBe(12);
    expect(got.free_memory).toBe(0);
    expect(got.total_memory).toBe(1024);
    expect(got.active_sessions).toBe(1);
    expect(got.blocked_bindings).toBe(1);
    expect(got.hosts).toBe(2);
    expect(got.hotspot_users).toBe(1);
    expect(got.board_name).toBe("CCR2004-16G-2S+");
    expect(got.connection_mode).toBe("hub");
  });

  it("reads deeper health via raw when provided", async () => {
    const hubConn: RouterConn = {
      host: row.host,
      port: 443,
      username: "admin",
      password: "x",
      useTls: true,
      baseUrlOverride: "https://hub.example/peers/p1/rest",
    };
    const loadConn = vi.fn().mockResolvedValue(hubConn);
    const raw = vi.fn(async (_c: RouterConn, path: string) => {
      if (path === "/system/identity") return { name: "HQ" };
      if (path === "/system/health") return [{ name: "temperature", value: "48" }];
      if (path === "/interface")
        return [
          { name: "ether1", type: "ether", running: "true", disabled: "false" },
          { name: "ether2", type: "ether", running: "false", disabled: "false" },
        ];
      if (path === "/ip/pool") return [{ name: "hs", ranges: "10.0.0.2-10.0.0.11" }];
      if (path === "/ip/pool/used") return [{ pool: "hs" }, { pool: "hs" }];
      if (path === "/interface/wireguard/peers") return [];
      if (path === "/ip/firewall/filter") return [{}, {}, {}];
      if (path === "/queue/tree") return [{}];
      return [];
    });
    const got = await collectFleetSnapshot(row, {
      loadConn,
      api: api({ raw }),
    });
    expect(got.identity).toBe("HQ");
    expect(got.temperature_c).toBe(48);
    expect(got.interfaces_down?.map((i) => i.name)).toEqual(["ether2"]);
    expect(got.dhcp_pools?.[0]).toEqual({ name: "hs", total: 10, used: 2 });
    expect(got.firewall_rules).toBe(3);
    expect(got.queue_trees).toBe(1);
    expect(got.wireguard_peers).toEqual({ total: 0, handshake_ok: 0 });
  });

  it("marks the row offline when loadConn or ping fails", async () => {
    const loadConn = vi.fn().mockRejectedValue(new Error("hub 504"));
    const got = await collectFleetSnapshot(row, { loadConn, api: api() });
    expect(got.online).toBe(false);
    expect(got.error).toMatch(/504/);
  });
});
