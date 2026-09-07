// MikroTik driver — CAPsMAN-managed APs plus the router's own wireless radios.
// Reached over the existing RouterOS REST client (direct or tunnel).
import { routerAPI } from "../mikrotik.server";
import type {
  ApAlarm,
  ApClient,
  ApConn,
  ApDevice,
  ApDriver,
  Radio,
  RadioInput,
  Ssid,
  SsidInput,
  TrafficStat,
} from "./types";

type Row = Record<string, string>;

function conn(c: ApConn) {
  if (!c.routerConn)
    throw new Error(
      "Pick which of your routers manages these access points before using MikroTik mode.",
    );
  return c.routerConn;
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

const get = (c: ApConn, path: string) =>
  safe(routerAPI.raw<Row[]>(conn(c), path) as Promise<Row[]>, [] as Row[]);

const patch = (c: ApConn, path: string, body: Record<string, unknown>) =>
  routerAPI.raw(conn(c), path, { method: "PATCH", body: JSON.stringify(body) });

const post = (c: ApConn, path: string, body: Record<string, unknown>) =>
  routerAPI.raw(conn(c), path, { method: "POST", body: JSON.stringify(body) });

function splitRef(ref: string): { scope: "caps" | "local"; id: string } {
  const [scope, ...rest] = ref.split(":");
  return { scope: scope === "caps" ? "caps" : "local", id: rest.join(":") };
}

const toNum = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const mikrotikDriver: ApDriver = {
  brand: "mikrotik",
  capabilities: [
    "aps",
    "clients",
    "ssids",
    "ssidWrite",
    "ssidPassword",
    "ssidEnable",
    "ssidVlan",
    "radios",
    "radioWrite",
    "reboot",
    "alarms",
    "traffic",
  ],

  async probe(c) {
    try {
      const res = await routerAPI.raw<Record<string, string>>(conn(c), "/system/resource");
      return { ok: true, info: res, capabilities: mikrotikDriver.capabilities };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async listAps(c): Promise<ApDevice[]> {
    const [caps, resource, wireless] = await Promise.all([
      get(c, "/caps-man/remote-cap"),
      safe(routerAPI.raw<Row>(conn(c), "/system/resource") as Promise<Row>, {} as Row),
      get(c, "/interface/wireless"),
    ]);

    const out: ApDevice[] = caps.map((r) => ({
      mac: r["base-mac"] ?? r["mac-address"] ?? r[".id"] ?? "",
      name: r["name"] ?? r["identity"] ?? null,
      model: r["board"] ?? null,
      state: r["state"] === "Run" || r["state"] === "run" ? "online" : "offline",
      version: r["version"] ?? null,
      clients: 0,
      uptime: 0,
      cpu_pct: null,
      mem_pct: null,
      ip: r["address"]?.split(":")[0] ?? null,
      ref: `caps:${r[".id"] ?? ""}`,
    }));

    // No CAPsMAN CAPs → the router itself is the AP (local wireless).
    if (out.length === 0 && wireless.length > 0) {
      const total = toNum(resource["total-memory"]);
      const free = toNum(resource["free-memory"]);
      out.push({
        mac: wireless[0]?.["mac-address"] ?? "local",
        name: resource["board-name"] ?? "This router",
        model: resource["board-name"] ?? null,
        state: "online",
        version: resource["version"] ?? null,
        clients: 0,
        uptime: 0,
        cpu_pct: toNum(resource["cpu-load"]),
        mem_pct: total > 0 ? Math.round(((total - free) / total) * 1000) / 10 : null,
        ip: c.host,
        ref: "local:self",
      });
    }

    const regs = await safe(
      (async () => {
        const capsRegs = await get(c, "/caps-man/registration-table");
        if (capsRegs.length) return capsRegs;
        return get(c, "/interface/wireless/registration-table");
      })(),
      [] as Row[],
    );
    for (const dev of out) {
      dev.clients = regs.filter(
        (r) =>
          !dev.mac ||
          r["interface"]?.includes(dev.name ?? "") ||
          (r["ap"] ?? "").toLowerCase() === dev.mac.toLowerCase(),
      ).length;
    }
    if (out.length === 1 && out[0]) out[0].clients = regs.length;
    return out;
  },

  async listClients(c): Promise<ApClient[]> {
    let regs = await get(c, "/caps-man/registration-table");
    if (regs.length === 0) regs = await get(c, "/interface/wireless/registration-table");
    return regs.map((r) => ({
      mac: r["mac-address"] ?? "",
      hostname: r["comment"] ?? null,
      ip: null,
      ap_mac: r["ap"] ?? null,
      ssid: r["ssid"] ?? r["interface"] ?? null,
      signal: r["rx-signal"]
        ? Number(r["rx-signal"])
        : r["signal-strength"]
          ? parseInt(r["signal-strength"], 10)
          : null,
      rx_bytes: toNum((r["bytes"] ?? "0,0").split(",")[0]),
      tx_bytes: toNum((r["bytes"] ?? "0,0").split(",")[1]),
      uptime: 0,
      blocked: false,
    }));
  },

  async listSsids(c): Promise<Ssid[]> {
    const caps = await get(c, "/caps-man/configuration");
    if (caps.length) {
      return caps.map((r) => ({
        ref: `caps:${r[".id"]}`,
        name: r["ssid"] ?? r["name"] ?? "",
        enabled: r["disabled"] !== "true",
        security: r["security"] ?? null,
        vlan: r["vlan-id"] ? Number(r["vlan-id"]) : null,
        band: r["band"] ?? null,
        hidden: r["hide-ssid"] === "true",
      }));
    }
    const local = await get(c, "/interface/wireless");
    return local.map((r) => ({
      ref: `local:${r[".id"]}`,
      name: r["ssid"] ?? r["name"] ?? "",
      enabled: r["disabled"] !== "true",
      security: r["security-profile"] ?? null,
      vlan: r["vlan-id"] ? Number(r["vlan-id"]) : null,
      band: r["band"] ?? null,
      hidden: r["hide-ssid"] === "true",
    }));
  },

  async saveSsid(c, input: SsidInput) {
    if (!input.ref) {
      // New SSID: CAPsMAN configuration entry (works for CAP-managed fleets).
      await post(c, "/caps-man/configuration", {
        name: input.name,
        ssid: input.name,
        ...(input.vlan != null ? { "vlan-mode": "use-tag", "vlan-id": String(input.vlan) } : {}),
        ...(input.hidden ? { "hide-ssid": "yes" } : {}),
      });
      if (input.password) await mikrotikDriver.setSsidPassword(c, "", input.password);
      return { ok: true as const };
    }
    const { scope, id } = splitRef(input.ref);
    const path = scope === "caps" ? "/caps-man/configuration" : "/interface/wireless";
    await patch(c, `${path}/${encodeURIComponent(id)}`, {
      ssid: input.name,
      disabled: input.enabled === false ? "yes" : "no",
      ...(input.hidden != null ? { "hide-ssid": input.hidden ? "yes" : "no" } : {}),
      ...(input.vlan != null ? { "vlan-mode": "use-tag", "vlan-id": String(input.vlan) } : {}),
    });
    if (input.password) await mikrotikDriver.setSsidPassword(c, input.ref, input.password);
    return { ok: true as const };
  },

  async setSsidEnabled(c, ref, enabled) {
    const { scope, id } = splitRef(ref);
    const path = scope === "caps" ? "/caps-man/configuration" : "/interface/wireless";
    await patch(c, `${path}/${encodeURIComponent(id)}`, { disabled: enabled ? "no" : "yes" });
    return { ok: true as const };
  },

  async setSsidPassword(c, ref, password) {
    const { scope } = ref ? splitRef(ref) : { scope: "caps" as const };
    if (scope === "caps") {
      const secs = await get(c, "/caps-man/security");
      const target = secs[0];
      if (!target) throw new Error("No CAPsMAN security profile found to update.");
      await patch(c, `/caps-man/security/${encodeURIComponent(target[".id"] ?? "")}`, {
        passphrase: password,
        "authentication-types": "wpa2-psk",
      });
      return { ok: true as const };
    }
    const profiles = await get(c, "/interface/wireless/security-profiles");
    const target = profiles.find((p) => p["name"] !== "default") ?? profiles[0];
    if (!target) throw new Error("No wireless security profile found to update.");
    await patch(
      c,
      `/interface/wireless/security-profiles/${encodeURIComponent(target[".id"] ?? "")}`,
      { "wpa2-pre-shared-key": password, mode: "dynamic-keys", "authentication-types": "wpa2-psk" },
    );
    return { ok: true as const };
  },

  async setSsidVlan(c, ref, vlan) {
    const { scope, id } = splitRef(ref);
    const path = scope === "caps" ? "/caps-man/configuration" : "/interface/wireless";
    await patch(
      c,
      `${path}/${encodeURIComponent(id)}`,
      vlan == null
        ? { "vlan-mode": "no-tag" }
        : { "vlan-mode": "use-tag", "vlan-id": String(vlan) },
    );
    return { ok: true as const };
  },

  async listRadios(c): Promise<Radio[]> {
    const caps = await get(c, "/caps-man/radio");
    if (caps.length) {
      return caps.map((r) => ({
        ref: `caps:${r[".id"]}`,
        ap_mac: r["radio-mac"] ?? null,
        band: r["current-band"] ?? r["band"] ?? null,
        channel: r["current-channel"] ?? null,
        width: r["current-channel-width"] ?? null,
        tx_power: r["current-tx-power"] ?? null,
      }));
    }
    const local = await get(c, "/interface/wireless");
    return local.map((r) => ({
      ref: `local:${r[".id"]}`,
      ap_mac: r["mac-address"] ?? null,
      band: r["band"] ?? null,
      channel: r["frequency"] ?? null,
      width: r["channel-width"] ?? null,
      tx_power: r["tx-power"] ?? null,
    }));
  },

  async setRadio(c, input: RadioInput) {
    const { scope, id } = splitRef(input.ref);
    if (scope === "caps") {
      // CAPsMAN radios take their channel from the channel profile.
      const chans = await get(c, "/caps-man/channel");
      const target = chans[0];
      if (!target) throw new Error("No CAPsMAN channel profile found to update.");
      await patch(c, `/caps-man/channel/${encodeURIComponent(target[".id"] ?? "")}`, {
        ...(input.channel ? { frequency: input.channel } : {}),
        ...(input.width ? { width: input.width } : {}),
        ...(input.tx_power ? { "tx-power": input.tx_power } : {}),
      });
      return { ok: true as const };
    }
    await patch(c, `/interface/wireless/${encodeURIComponent(id)}`, {
      ...(input.channel ? { frequency: input.channel } : {}),
      ...(input.width ? { "channel-width": input.width } : {}),
      ...(input.tx_power ? { "tx-power": input.tx_power, "tx-power-mode": "all-rates-fixed" } : {}),
    });
    return { ok: true as const };
  },

  async rebootAp(c, ref, _mac) {
    const { scope, id } = splitRef(ref || "local:self");
    if (scope === "caps" && id && id !== "self") {
      await post(c, `/caps-man/remote-cap/provision`, { numbers: id });
      return { ok: true as const };
    }
    await post(c, "/system/reboot", {});
    return { ok: true as const };
  },

  async listAlarms(c): Promise<ApAlarm[]> {
    const rows = await get(c, "/log");
    return rows
      .filter((r) => /wireless|caps|dhcp|critical|error|warning/i.test(r["topics"] ?? ""))
      .slice(-100)
      .reverse()
      .map((r, i) => ({
        id: r[".id"] ?? String(i),
        at: r["time"] ?? null,
        severity: /critical|error/i.test(r["topics"] ?? "") ? "critical" : "warning",
        message: r["message"] ?? "",
      }));
  },

  async trafficStats(c): Promise<TrafficStat[]> {
    const rows = await get(c, "/interface");
    return rows
      .filter((r) => /wlan|cap|wifi/i.test(r["name"] ?? ""))
      .map((r) => ({
        label: r["name"] ?? "",
        rx_bytes: toNum(r["rx-byte"]),
        tx_bytes: toNum(r["tx-byte"]),
      }));
  },

  async clientAction(c, mac, action) {
    if (action === "reconnect") {
      let regs = await get(c, "/caps-man/registration-table");
      let path = "/caps-man/registration-table";
      if (regs.length === 0) {
        regs = await get(c, "/interface/wireless/registration-table");
        path = "/interface/wireless/registration-table";
      }
      const row = regs.find((r) => (r["mac-address"] ?? "").toLowerCase() === mac.toLowerCase());
      if (!row) throw new Error("That client is not connected right now.");
      await routerAPI.raw(conn(c), `${path}/${encodeURIComponent(row[".id"] ?? "")}`, {
        method: "DELETE",
      });
      return { ok: true as const };
    }
    if (action === "block") {
      await post(c, "/interface/wireless/access-list", {
        "mac-address": mac,
        authentication: "no",
        forwarding: "no",
        comment: "blocked via MikroTik Magic",
      });
      return { ok: true as const };
    }
    const list = await get(c, "/interface/wireless/access-list");
    const row = list.find((r) => (r["mac-address"] ?? "").toLowerCase() === mac.toLowerCase());
    if (row)
      await routerAPI.raw(
        conn(c),
        `/interface/wireless/access-list/${encodeURIComponent(row[".id"] ?? "")}`,
        { method: "DELETE" },
      );
    return { ok: true as const };
  },
};
