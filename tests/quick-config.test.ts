import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RouterConn } from "@/lib/mikrotik.server";

const conn: RouterConn = {
  host: "router.test",
  port: 443,
  username: "admin",
  password: "secret",
  useTls: true,
};

type MockStore = {
  firewall: Record<string, string>[];
  lists: Record<string, string>[];
  schedulers: Record<string, string>[];
  scripts: Record<string, string>[];
  addressLists: Record<string, string>[];
  bindings: Record<string, string>[];
  queues: Record<string, string>[];
  queueTypes: Record<string, string>[];
  userProfiles: Record<string, string>[];
  hotspotProfiles: Record<string, string>[];
  executedScripts: string[];
  ntpSets: Record<string, string>[];
  ntpClient: Record<string, string>;
  ntpSetFails: boolean;
  restPostFails: boolean;
  pingFails: boolean;
  rosVersion: string;
  nextId: number;
};

function row(id: number, data: Record<string, string>) {
  return { ".id": `*${id}`, ...data };
}

function createStore(overrides: Partial<MockStore> = {}): MockStore {
  return {
    firewall: [],
    lists: [row(1, { name: "LAN" }), row(2, { name: "WAN" })],
    schedulers: [],
    scripts: [],
    addressLists: [],
    bindings: [],
    queues: [],
    queueTypes: [],
    userProfiles: [],
    hotspotProfiles: [row(3, { name: "hsprof1", "login-by": "http-chap,http-pap" })],
    executedScripts: [],
    ntpSets: [],
    ntpClient: { enabled: "false" },
    ntpSetFails: false,
    restPostFails: false,
    pingFails: false,
    rosVersion: "7.14.3",
    nextId: 10,
    ...overrides,
  };
}

const holder = { store: createStore() };

function buildMockApi(getStore: () => MockStore) {
  return {
    ping: vi.fn(async () => {
      if (getStore().pingFails) throw new Error("connection refused");
      return { version: getStore().rosVersion };
    }),
    listFirewallFilter: vi.fn(async () => getStore().firewall),
    addFirewallFilter: vi.fn(async (_c: RouterConn, rule: Record<string, string>) => {
      const store = getStore();
      if (store.restPostFails) {
        store.executedScripts.push(
          `/ip firewall filter add chain=${rule.chain ?? "forward"} action=${rule.action ?? "drop"} comment="${rule.comment ?? ""}"`,
        );
      }
      store.nextId += 1;
      store.firewall.push(row(store.nextId, rule));
    }),
    profiles: vi.fn(async () => getStore().userProfiles),
    hotspotProfiles: vi.fn(async () => getStore().hotspotProfiles),
    patchHotspotProfile: vi.fn(
      async (_c: RouterConn, id: string, patch: Record<string, string>) => {
        const store = getStore();
        const idx = store.hotspotProfiles.findIndex((p) => p[".id"] === id);
        if (idx >= 0) Object.assign(store.hotspotProfiles[idx]!, patch);
      },
    ),
    addUserProfile: vi.fn(async (_c: RouterConn, profile: Record<string, string>) => {
      const store = getStore();
      store.nextId += 1;
      store.userProfiles.push(row(store.nextId, profile));
      return store.userProfiles.at(-1);
    }),
    patchUserProfile: vi.fn(async (_c: RouterConn, id: string, patch: Record<string, string>) => {
      const store = getStore();
      const idx = store.userProfiles.findIndex((p) => p[".id"] === id);
      if (idx >= 0) Object.assign(store.userProfiles[idx]!, patch);
    }),
    execScript: vi.fn(async (_c: RouterConn, script: string) => {
      const store = getStore();
      store.executedScripts.push(script);
      if (/\/system ntp client set enabled=yes/i.test(script)) {
        store.ntpClient.enabled = "true";
      }
      if (/\/system ntp client set enabled=no/i.test(script)) {
        store.ntpClient.enabled = "false";
      }
    }),
    raw: vi.fn(async (_c: RouterConn, path: string, init?: RequestInit) => {
      const store = getStore();
      const method = (init?.method ?? "GET").toUpperCase();
      if (path === "/interface/list" && method === "GET") return store.lists;
      if (path === "/system/scheduler" && method === "GET") return store.schedulers;
      if (path === "/system/script" && method === "GET") return store.scripts;
      if (path === "/ip/firewall/address-list" && method === "GET") return store.addressLists;
      if (path === "/ip/hotspot/ip-binding" && method === "GET") return store.bindings;
      if (path === "/queue/simple" && method === "GET") return store.queues;
      if (path === "/queue/type" && method === "GET") return store.queueTypes;
      if (path === "/ip/dhcp-server/network" && method === "GET") {
        return [{ address: "192.168.10.0/24" }];
      }
      if (path === "/system/ntp/client" && method === "GET") return store.ntpClient;
      if (path === "/system/ntp/client/servers" && method === "GET") return [];

      if (method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, string>;
        if (
          store.restPostFails &&
          (path === "/system/scheduler" ||
            path === "/system/script" ||
            path === "/queue/simple" ||
            path === "/queue/type")
        ) {
          throw new Error(
            'RouterOS API 400: {"detail":"no such command","error":400,"message":"Bad Request"}',
          );
        }
        store.nextId += 1;
        if (path === "/system/scheduler") {
          store.schedulers.push(row(store.nextId, body));
          return store.schedulers.at(-1);
        }
        if (path === "/system/script") {
          store.scripts.push(row(store.nextId, body));
          return store.scripts.at(-1);
        }
        if (path === "/queue/simple") {
          store.queues.push(row(store.nextId, body));
          return store.queues.at(-1);
        }
        if (path === "/queue/type") {
          store.queueTypes.push(row(store.nextId, body));
          return store.queueTypes.at(-1);
        }
        if (path === "/system/ntp/client/servers") return body;
        if (path === "/system/ntp/client/set") {
          if (store.ntpSetFails) {
            throw new Error(
              'RouterOS API 400: {"detail":"no such command","error":400,"message":"Bad Request"}',
            );
          }
          store.ntpSets.push(body);
          if (body.enabled === "yes" || body.enabled === "true") store.ntpClient.enabled = "true";
          if (body.enabled === "no" || body.enabled === "false") store.ntpClient.enabled = "false";
          return body;
        }
      }

      if (method === "PUT") {
        const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, string>;
        store.nextId += 1;
        if (path === "/system/scheduler") {
          store.schedulers.push(row(store.nextId, body));
          return store.schedulers.at(-1);
        }
        if (path === "/system/script") {
          store.scripts.push(row(store.nextId, body));
          return store.scripts.at(-1);
        }
        if (path === "/queue/simple") {
          store.queues.push(row(store.nextId, body));
          return store.queues.at(-1);
        }
        if (path === "/queue/type") {
          store.queueTypes.push(row(store.nextId, body));
          return store.queueTypes.at(-1);
        }
      }

      if (method === "PATCH" && path === "/system/ntp/client") return {};

      const deleteMatch = /^(.+)\/(.+)$/.exec(path);
      if (method === "DELETE" && deleteMatch) {
        const base = deleteMatch[1]!;
        const id = decodeURIComponent(deleteMatch[2]!);
        const removeFrom = (arr: Record<string, string>[]) => {
          const idx = arr.findIndex((r) => r[".id"] === id);
          if (idx >= 0) arr.splice(idx, 1);
        };
        if (base === "/ip/firewall/filter") removeFrom(store.firewall);
        if (base === "/system/scheduler") removeFrom(store.schedulers);
        if (base === "/system/script") removeFrom(store.scripts);
        if (base === "/ip/firewall/address-list") removeFrom(store.addressLists);
        if (base === "/ip/hotspot/ip-binding") removeFrom(store.bindings);
        if (base === "/queue/simple") removeFrom(store.queues);
        if (base === "/queue/type") removeFrom(store.queueTypes);
        return {};
      }

      throw new Error(`unexpected raw ${method} ${path}`);
    }),
  };
}

vi.mock("@/lib/mikrotik.server", () => ({
  routerAPI: buildMockApi(() => holder.store),
}));

describe("quick-config.server", () => {
  beforeEach(() => {
    holder.store = createStore();
    vi.resetModules();
  });

  it("reports unreachable when REST ping fails", async () => {
    holder.store.pingFails = true;
    const { readQuickConfig } = await import("@/lib/quick-config.server");
    const snap = await readQuickConfig(conn);
    expect(snap.reachable).toBe(false);
    expect(snap.reachError).toMatch(/connection refused/i);
    expect(snap.features.clientIsolation.enabled).toBe(false);
  });

  it("enables client isolation when LAN list exists", async () => {
    const { applyQuickConfigFeature, readQuickConfig } = await import("@/lib/quick-config.server");
    const result = await applyQuickConfigFeature(conn, "clientIsolation", true);
    expect(result.enabled).toBe(true);
    expect(holder.store.firewall.some((r) => r.comment === "mm-client-isolation")).toBe(true);

    const snap = await readQuickConfig(conn);
    expect(snap.reachable).toBe(true);
    expect(snap.features.clientIsolation.enabled).toBe(true);
  });

  it("enables client isolation via CLI when REST firewall create fails", async () => {
    holder.store.restPostFails = true;
    const { applyQuickConfigFeature } = await import("@/lib/quick-config.server");
    const result = await applyQuickConfigFeature(conn, "clientIsolation", true);
    expect(result.enabled).toBe(true);
    expect(holder.store.executedScripts.some((s) => s.includes("/ip firewall filter add"))).toBe(
      true,
    );
  });

  it("throws when WAN list is missing for WAN Input Guard", async () => {
    holder.store.lists = holder.store.lists.filter((l) => l.name !== "WAN");
    const { applyQuickConfigFeature } = await import("@/lib/quick-config.server");
    await expect(applyQuickConfigFeature(conn, "wanInputGuard", true)).rejects.toThrow(
      /WAN.*interface list/i,
    );
  });

  it("enables auto backup scheduler on the router", async () => {
    const { applyQuickConfigFeature } = await import("@/lib/quick-config.server");
    const result = await applyQuickConfigFeature(conn, "autoBackup", true);
    expect(result.enabled).toBe(true);
    expect(holder.store.schedulers.some((s) => s.comment === "mm-auto-backup")).toBe(true);
  });

  it("enables auto backup via PUT when POST is rejected", async () => {
    holder.store.restPostFails = true;
    const { applyQuickConfigFeature } = await import("@/lib/quick-config.server");
    const result = await applyQuickConfigFeature(conn, "autoBackup", true);
    expect(result.enabled).toBe(true);
    expect(holder.store.schedulers.some((s) => s.comment === "mm-auto-backup")).toBe(true);
  });

  it("configures fair share QoS with an explicit guest CIDR and measured WAN rates", async () => {
    holder.store.restPostFails = true;
    const { configureFairShareQos } = await import("@/lib/quick-config.server");
    const result = await configureFairShareQos(conn, {
      guestCidr: "10.5.50.0/24",
      downloadMbps: 100,
      uploadMbps: 20,
    });
    expect(result.enabled).toBe(true);
    expect(holder.store.queues.some((q) => q.comment === "mm-fair-qos")).toBe(true);
    expect(holder.store.queueTypes.filter((t) => t.comment === "mm-fair-qos")).toHaveLength(2);
    expect(holder.store.queues[0]?.target).toBe("10.5.50.0/24");
    expect(holder.store.queues[0]?.["max-limit"]).toBe("20M/100M");
  });

  it("enables NTP via REST POST /system/ntp/client/set when supported", async () => {
    const { applyQuickConfigFeature } = await import("@/lib/quick-config.server");
    const result = await applyQuickConfigFeature(conn, "ntpSync", true);
    expect(result.enabled).toBe(true);
    expect(holder.store.ntpClient.enabled).toBe("true");
    expect(holder.store.ntpSets.some((s) => s.enabled === "yes")).toBe(true);
    expect(holder.store.schedulers.some((s) => s.comment === "mm-ntp-sync")).toBe(false);
  });

  it("falls back to single-line CLI when REST NTP set is rejected", async () => {
    holder.store.ntpSetFails = true;
    const { applyQuickConfigFeature } = await import("@/lib/quick-config.server");
    const result = await applyQuickConfigFeature(conn, "ntpSync", true);
    expect(result.enabled).toBe(true);
    expect(holder.store.ntpClient.enabled).toBe("true");
    expect(holder.store.executedScripts.some((s) => s.includes("enabled=yes"))).toBe(true);
    expect(holder.store.schedulers.some((s) => s.comment === "mm-ntp-sync")).toBe(false);
  });

  it("does not POST an invalid NTP marker scheduler (regression)", async () => {
    const { applyQuickConfigFeature } = await import("@/lib/quick-config.server");
    await applyQuickConfigFeature(conn, "ntpSync", true);
    expect(holder.store.schedulers.some((s) => s.name === "mm-ntp-sync-marker")).toBe(false);
  });

  it("requires RouterOS 7.1+ before enabling trial guest access", async () => {
    holder.store.rosVersion = "6.49.6";
    const { applyQuickConfigFeature } = await import("@/lib/quick-config.server");
    await expect(applyQuickConfigFeature(conn, "trialGuestAccess", true)).rejects.toThrow(
      /RouterOS 7\.1/i,
    );
  });

  it("requires hotspot profiles before enabling trial guest access", async () => {
    holder.store.hotspotProfiles = [];
    const { applyQuickConfigFeature } = await import("@/lib/quick-config.server");
    await expect(applyQuickConfigFeature(conn, "trialGuestAccess", true)).rejects.toThrow(
      /Hotspot server profile/i,
    );
  });

  it("enables trial guest access with 10 min and 1.5M/1.5M mm-trial profile", async () => {
    const { applyQuickConfigFeature } = await import("@/lib/quick-config.server");
    const result = await applyQuickConfigFeature(conn, "trialGuestAccess", true);
    expect(result.enabled).toBe(true);
    const trial = holder.store.userProfiles.find((p) => p.name === "mm-trial");
    expect(trial?.["session-timeout"]).toBe("10m");
    expect(trial?.["rate-limit"]).toBe("1.5M/1.5M");
    expect(holder.store.hotspotProfiles[0]?.["login-by"]).toContain("trial");
  });

  it("disables trial guest access without removing mm-trial profile", async () => {
    holder.store.userProfiles = [
      row(4, { name: "mm-trial", "session-timeout": "10m", "rate-limit": "1.5M/1.5M" }),
    ];
    holder.store.hotspotProfiles = [
      row(3, { name: "hsprof1", "login-by": "http-chap,http-pap,trial" }),
    ];
    const { applyQuickConfigFeature } = await import("@/lib/quick-config.server");
    const result = await applyQuickConfigFeature(conn, "trialGuestAccess", false);
    expect(result.enabled).toBe(false);
    expect(holder.store.userProfiles.some((p) => p.name === "mm-trial")).toBe(true);
    expect(holder.store.hotspotProfiles[0]?.["login-by"]).not.toContain("trial");
  });

  it("requires hotspot before enabling login flood guard", async () => {
    holder.store.hotspotProfiles = [];
    const { applyQuickConfigFeature } = await import("@/lib/quick-config.server");
    await expect(applyQuickConfigFeature(conn, "loginFloodGuard", true)).rejects.toThrow(
      /Hotspot server profile/i,
    );
  });

  it("enables login flood guard with firewall, MAC script, and schedulers", async () => {
    const { applyQuickConfigFeature, readQuickConfig } = await import("@/lib/quick-config.server");
    const result = await applyQuickConfigFeature(conn, "loginFloodGuard", true);
    expect(result.enabled).toBe(true);
    expect(holder.store.firewall.filter((r) => r.comment === "mm-login-flood")).toHaveLength(3);
    expect(holder.store.firewall.some((r) => r.hotspot === "http" && r.action === "drop")).toBe(
      true,
    );
    expect(holder.store.firewall.some((r) => r["src-address-list"] === "mm-login-flood")).toBe(
      true,
    );
    expect(holder.store.scripts.some((s) => s.name === "mm-login-flood")).toBe(true);
    expect(holder.store.scripts.some((s) => (s.source ?? "").includes("type=blocked"))).toBe(true);
    expect(holder.store.schedulers.some((s) => s.name === "mm-login-flood")).toBe(true);
    expect(holder.store.schedulers.some((s) => s.name === "mm-login-flood-expire")).toBe(true);

    const snap = await readQuickConfig(conn);
    expect(snap.features.loginFloodGuard.enabled).toBe(true);
  });

  it("disables login flood guard and removes tagged MAC bans", async () => {
    const { applyQuickConfigFeature } = await import("@/lib/quick-config.server");
    await applyQuickConfigFeature(conn, "loginFloodGuard", true);
    holder.store.bindings = [
      row(20, { "mac-address": "AA:BB:CC:DD:EE:FF", comment: "mm-login-flood" }),
    ];
    holder.store.addressLists = [row(21, { list: "mm-login-flood", address: "10.10.0.50" })];
    const off = await applyQuickConfigFeature(conn, "loginFloodGuard", false);
    expect(off.enabled).toBe(false);
    expect(holder.store.firewall.some((r) => r.comment === "mm-login-flood")).toBe(false);
    expect(
      holder.store.schedulers.some((s) => (s.comment ?? "").startsWith("mm-login-flood")),
    ).toBe(false);
    expect(holder.store.scripts.some((s) => s.name === "mm-login-flood")).toBe(false);
    expect(holder.store.bindings).toHaveLength(0);
    expect(holder.store.addressLists).toHaveLength(0);
  });
});
