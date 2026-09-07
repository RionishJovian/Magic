// Generic driver — for brands without a first-class integration (Cisco WLC,
// TP-Link Omada, Aruba Instant, …) that expose a JSON HTTP API. Reads are
// attempted against conventional paths under the configured API base path;
// unavailable endpoints simply return empty instead of failing the page.
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
import { apFetch } from "./transport.server";
import { unsupported } from "./types";
import {
  isRecord,
  nullableText,
  numberValue,
  records,
  text,
  type UnknownRecord,
} from "../database.types";

const root = (c: ApConn) =>
  `https://${c.host}:${c.port}${(c.apiBasePath ?? "").replace(/\/+$/, "")}`;

function authHeaders(c: ApConn) {
  const token = Buffer.from(`${c.username}:${c.password}`).toString("base64");
  return { authorization: `Basic ${token}`, accept: "application/json" };
}

async function tryGet(c: ApConn, paths: string[]): Promise<UnknownRecord[]> {
  for (const p of paths) {
    try {
      const res = await apFetch(c, `${root(c)}${p}`, { headers: authHeaders(c) });
      if (!res.ok) continue;
      const body: unknown = await res.json();
      const list = isRecord(body) ? (body.data ?? body.list ?? body.result) : body;
      if (Array.isArray(list)) return records(list);
    } catch {
      /* try the next candidate path */
    }
  }
  return [];
}

export const genericDriver: ApDriver = {
  brand: "generic",
  capabilities: ["aps", "clients", "ssids", "alarms", "traffic"],

  async probe(c) {
    if (!c.apiBasePath)
      return {
        ok: false,
        error: "Set the API base path (for example /api/v1) for this controller.",
      };
    try {
      const res = await apFetch(c, `${root(c)}/`, { headers: authHeaders(c) });
      const aps = await tryGet(c, ["/devices", "/aps", "/ap/list"]);
      return {
        ok: res.ok || aps.length > 0,
        info: { reachable: res.ok, devices: aps.length },
        capabilities: aps.length ? ["aps", "clients", "ssids", "alarms", "traffic"] : ["clients"],
        ...(res.ok || aps.length ? {} : { error: `HTTP ${res.status} from ${root(c)}` }),
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async listAps(c): Promise<ApDevice[]> {
    return (await tryGet(c, ["/devices", "/aps", "/ap/list"])).map((d, i) => ({
      mac: text(d.mac ?? d.macAddress, String(i)),
      name: nullableText(d.name ?? d.hostname),
      model: nullableText(d.model),
      state: d.status === "online" || d.online || d.state === 1 ? "online" : "offline",
      version: nullableText(d.version ?? d.firmware),
      clients: numberValue(d.clients ?? d.num_sta),
      uptime: numberValue(d.uptime),
      cpu_pct: Number.isFinite(Number(d.cpu)) ? Number(d.cpu) : null,
      mem_pct: Number.isFinite(Number(d.mem ?? d.memory)) ? Number(d.mem ?? d.memory) : null,
      ip: nullableText(d.ip),
      ref: String(d.id ?? d.mac ?? i),
    }));
  },

  async listClients(c): Promise<ApClient[]> {
    return (await tryGet(c, ["/clients", "/stations", "/sta/list"])).map((x) => ({
      mac: text(x.mac),
      hostname: nullableText(x.hostname ?? x.name),
      ip: nullableText(x.ip),
      ap_mac: nullableText(x.ap_mac),
      ssid: nullableText(x.ssid),
      signal: Number.isFinite(Number(x.rssi ?? x.signal)) ? Number(x.rssi ?? x.signal) : null,
      rx_bytes: Number(x.rx_bytes ?? 0) || 0,
      tx_bytes: Number(x.tx_bytes ?? 0) || 0,
      uptime: Number(x.uptime ?? 0) || 0,
      blocked: Boolean(x.blocked),
    }));
  },

  async listSsids(c): Promise<Ssid[]> {
    return (await tryGet(c, ["/wlans", "/ssids", "/wlan/list"])).map((w, i) => ({
      ref: String(w.id ?? i),
      name: text(w.ssid ?? w.name),
      enabled: w.enabled !== false,
      security: nullableText(w.security),
      vlan: Number.isFinite(Number(w.vlan)) ? Number(w.vlan) : null,
      band: nullableText(w.band),
      hidden: Boolean(w.hidden),
    }));
  },

  async saveSsid(_c, _input: SsidInput) {
    return unsupported("generic", "editing SSIDs");
  },
  async setSsidEnabled() {
    return unsupported("generic", "enabling or disabling SSIDs");
  },
  async setSsidPassword() {
    return unsupported("generic", "changing the Wi-Fi password");
  },
  async setSsidVlan() {
    return unsupported("generic", "VLAN configuration");
  },
  async listRadios(): Promise<Radio[]> {
    return [];
  },
  async setRadio(_c, _input: RadioInput) {
    return unsupported("generic", "radio configuration");
  },
  async rebootAp() {
    return unsupported("generic", "rebooting access points");
  },

  async listAlarms(c): Promise<ApAlarm[]> {
    return (await tryGet(c, ["/alarms", "/events", "/alarm/list"])).slice(0, 100).map((a, i) => ({
      id: String(a.id ?? i),
      at: nullableText(a.time ?? a.timestamp),
      severity: String(a.severity ?? a.level ?? "info"),
      message: text(a.message ?? a.desc, "Event"),
    }));
  },

  async trafficStats(c): Promise<TrafficStat[]> {
    return (await tryGet(c, ["/devices", "/aps", "/ap/list"])).map((d, i) => ({
      label: text(d.name ?? d.hostname ?? d.mac, String(i)),
      rx_bytes: Number(d.rx_bytes ?? 0) || 0,
      tx_bytes: Number(d.tx_bytes ?? 0) || 0,
    }));
  },

  async clientAction() {
    return unsupported("generic", "client actions");
  },
};
