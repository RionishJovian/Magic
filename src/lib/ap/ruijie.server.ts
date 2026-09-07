// Ruijie / Reyee driver — EWEB (self-hosted gateway or AP master) HTTP API.
// Endpoint paths follow the Reyee EWEB REST surface; the Test button reports
// exactly which of them answered on your hardware.
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
import { isRecord, nullableText, records, text, type UnknownRecord } from "../database.types";

const root = (c: ApConn) =>
  `https://${c.host}:${c.port}${(c.apiBasePath ?? "/api").replace(/\/+$/, "")}`;

type Session = { token: string; cookie: string };

async function login(c: ApConn): Promise<Session> {
  const res = await apFetch(c, `${root(c)}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: c.username, password: c.password }),
  });
  if (!res.ok) throw new Error(`Ruijie login failed: HTTP ${res.status}`);
  const raw: unknown = await res.json().catch(() => ({}));
  const body = isRecord(raw) ? raw : {};
  const data = isRecord(body.data) ? body.data : {};
  const token = String(
    data.token ?? body.token ?? data.stok ?? res.headers.get("x-auth-token") ?? "",
  );
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  const many = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  const cookie = (Array.isArray(many) ? many : []).map((x: string) => x.split(";")[0]).join("; ");
  if (!token && !cookie) throw new Error("Ruijie login returned no session token.");
  return { token, cookie };
}

async function call<T = unknown>(
  c: ApConn,
  s: Session,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (s.token) headers.set("x-auth-token", s.token);
  if (s.cookie) headers.set("cookie", s.cookie);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await apFetch(c, `${root(c)}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`Ruijie ${path} failed: HTTP ${res.status}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

const rows = (body: unknown): UnknownRecord[] => {
  if (Array.isArray(body)) return records(body);
  if (!isRecord(body)) return [];
  const data = isRecord(body.data) ? body.data : null;
  return records(data?.list ?? body.data ?? body.list);
};

const numOrNull = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export const ruijieDriver: ApDriver = {
  brand: "ruijie",
  capabilities: [
    "aps",
    "clients",
    "clientActions",
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
      const s = await login(c);
      const ok: string[] = [];
      const caps: ApDriver["capabilities"] = [];
      const checks: Array<[string, (typeof caps)[number]]> = [
        ["/device/list", "aps"],
        ["/sta/list", "clients"],
        ["/wlan/list", "ssids"],
        ["/radio/list", "radios"],
        ["/alarm/list", "alarms"],
      ];
      for (const [path, cap] of checks) {
        try {
          await call(c, s, path);
          ok.push(path);
          caps.push(cap);
          if (cap === "ssids") caps.push("ssidWrite", "ssidPassword", "ssidEnable", "ssidVlan");
          if (cap === "radios") caps.push("radioWrite");
          if (cap === "aps") caps.push("reboot", "traffic");
          if (cap === "clients") caps.push("clientActions");
        } catch {
          /* capability unavailable on this firmware */
        }
      }
      return { ok: true, info: { endpoints: ok }, capabilities: caps };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async listAps(c): Promise<ApDevice[]> {
    const s = await login(c);
    return rows(await call(c, s, "/device/list")).map((d) => ({
      mac: text(d.mac ?? d.sn),
      name: nullableText(d.hostname ?? d.name),
      model: nullableText(d.model ?? d.device_type),
      state: d.status === "online" || d.online === true || d.state === 1 ? "online" : "offline",
      version: nullableText(d.software_ver ?? d.version),
      clients: Number(d.sta_num ?? d.client_num ?? 0) || 0,
      uptime: Number(d.uptime ?? 0) || 0,
      cpu_pct: numOrNull(d.cpu ?? d.cpu_usage),
      mem_pct: numOrNull(d.memory ?? d.mem_usage),
      ip: nullableText(d.ip),
      ref: String(d.sn ?? d.mac ?? ""),
    }));
  },

  async listClients(c): Promise<ApClient[]> {
    const s = await login(c);
    return rows(await call(c, s, "/sta/list")).map((x) => ({
      mac: text(x.mac),
      hostname: nullableText(x.hostname ?? x.name),
      ip: nullableText(x.ip),
      ap_mac: nullableText(x.ap_mac ?? x.sn),
      ssid: nullableText(x.ssid),
      signal: numOrNull(x.rssi ?? x.signal),
      rx_bytes: Number(x.rx_bytes ?? 0) || 0,
      tx_bytes: Number(x.tx_bytes ?? 0) || 0,
      uptime: Number(x.online_time ?? 0) || 0,
      blocked: Boolean(x.blocked),
    }));
  },

  async listSsids(c): Promise<Ssid[]> {
    const s = await login(c);
    return rows(await call(c, s, "/wlan/list")).map((w) => ({
      ref: String(w.wlan_id ?? w.id ?? w.ssid),
      name: text(w.ssid),
      enabled: w.enable !== false && w.enable !== 0,
      security: nullableText(w.encryption ?? w.security),
      vlan: numOrNull(w.vlan_id),
      band: nullableText(w.band),
      hidden: Boolean(w.hide ?? w.hidden),
    }));
  },

  async saveSsid(c, input: SsidInput) {
    const s = await login(c);
    const body = {
      wlan_id: input.ref ?? undefined,
      ssid: input.name,
      enable: input.enabled ?? true,
      hide: input.hidden ?? false,
      ...(input.password ? { password: input.password, encryption: "wpa2" } : {}),
      ...(input.vlan != null ? { vlan_id: input.vlan } : {}),
    };
    await call(c, s, input.ref ? "/wlan/update" : "/wlan/add", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { ok: true as const };
  },

  async setSsidEnabled(c, ref, enabled) {
    const s = await login(c);
    await call(c, s, "/wlan/update", {
      method: "POST",
      body: JSON.stringify({ wlan_id: ref, enable: enabled }),
    });
    return { ok: true as const };
  },

  async setSsidPassword(c, ref, password) {
    const s = await login(c);
    await call(c, s, "/wlan/update", {
      method: "POST",
      body: JSON.stringify({ wlan_id: ref, password, encryption: "wpa2" }),
    });
    return { ok: true as const };
  },

  async setSsidVlan(c, ref, vlan) {
    const s = await login(c);
    await call(c, s, "/wlan/update", {
      method: "POST",
      body: JSON.stringify({ wlan_id: ref, vlan_id: vlan ?? 0 }),
    });
    return { ok: true as const };
  },

  async listRadios(c): Promise<Radio[]> {
    const s = await login(c);
    return rows(await call(c, s, "/radio/list")).map((r, i) => ({
      ref: String(r.radio_id ?? `${r.sn ?? ""}:${i}`),
      ap_mac: nullableText(r.mac ?? r.sn),
      band: nullableText(r.band) ?? (r.radio_type === 1 ? "5G" : "2.4G"),
      channel: r.channel != null ? String(r.channel) : null,
      width: r.bandwidth != null ? String(r.bandwidth) : null,
      tx_power: r.power != null ? String(r.power) : null,
    }));
  },

  async setRadio(c, input: RadioInput) {
    const s = await login(c);
    await call(c, s, "/radio/update", {
      method: "POST",
      body: JSON.stringify({
        radio_id: input.ref,
        ...(input.channel ? { channel: Number(input.channel) || input.channel } : {}),
        ...(input.width ? { bandwidth: Number(input.width) || input.width } : {}),
        ...(input.tx_power ? { power: Number(input.tx_power) || input.tx_power } : {}),
      }),
    });
    return { ok: true as const };
  },

  async rebootAp(c, ref, mac) {
    const s = await login(c);
    await call(c, s, "/device/reboot", {
      method: "POST",
      body: JSON.stringify({ sn: ref, mac }),
    });
    return { ok: true as const };
  },

  async listAlarms(c): Promise<ApAlarm[]> {
    const s = await login(c);
    return rows(await call(c, s, "/alarm/list"))
      .slice(0, 100)
      .map((a, i) => ({
        id: String(a.id ?? i),
        at: nullableText(a.time ?? a.timestamp),
        severity: String(a.level ?? a.severity ?? "warning"),
        message: text(a.desc ?? a.message, "Alarm"),
      }));
  },

  async trafficStats(c): Promise<TrafficStat[]> {
    const s = await login(c);
    return rows(await call(c, s, "/device/list")).map((d) => ({
      label: text(d.hostname ?? d.name ?? d.mac),
      rx_bytes: Number(d.rx_bytes ?? 0) || 0,
      tx_bytes: Number(d.tx_bytes ?? 0) || 0,
    }));
  },

  async clientAction(c, mac, action) {
    const s = await login(c);
    const path =
      action === "reconnect" ? "/sta/kick" : action === "block" ? "/sta/block" : "/sta/unblock";
    await call(c, s, path, { method: "POST", body: JSON.stringify({ mac }) });
    return { ok: true as const };
  },
};
