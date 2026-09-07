// UniFi driver — classic self-hosted controllers and UniFi OS consoles.
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
import {
  isRecord,
  nullableText,
  numberValue,
  records,
  text,
  type UnknownRecord,
} from "../database.types";

type Session = { cookie: string; csrf: string | null };

const base = (c: ApConn) => `https://${c.host}:${c.port}`;
const prefix = (c: ApConn) => (c.isUnifiOs ? "/proxy/network/api" : "/api");

async function login(c: ApConn): Promise<Session> {
  const url = c.isUnifiOs ? `${base(c)}/api/auth/login` : `${base(c)}/api/login`;
  const res = await apFetch(c, url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: c.username, password: c.password }),
  });
  if (!res.ok) throw new Error(`UniFi login failed: HTTP ${res.status}`);
  const cookies: string[] = [];
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  const many = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : null;
  if (many && Array.isArray(many)) cookies.push(...many);
  else {
    const single = res.headers.get("set-cookie");
    if (single) cookies.push(single);
  }
  return {
    cookie: cookies
      .map((x) => x.split(";")[0])
      .filter(Boolean)
      .join("; "),
    csrf: res.headers.get("x-csrf-token"),
  };
}

async function call<T = unknown>(
  c: ApConn,
  s: Session,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `${base(c)}${prefix(c)}/s/${encodeURIComponent(c.site)}${path}`;
  const headers = new Headers(init.headers);
  headers.set("cookie", s.cookie);
  if (s.csrf) headers.set("x-csrf-token", s.csrf);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const res = await apFetch(c, url, { ...init, headers });
  if (!res.ok) throw new Error(`UniFi ${path} failed: HTTP ${res.status}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null;

async function devices(c: ApConn, s: Session) {
  const out = await call<{ data: UnknownRecord[] }>(c, s, "/stat/device");
  return out.data ?? [];
}

export const unifiDriver: ApDriver = {
  brand: "unifi",
  capabilities: [
    "aps",
    "apMeta",
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
      const info = await call<{ data: UnknownRecord[] }>(c, s, "/stat/sysinfo");
      return { ok: true, info: info.data?.[0] ?? null, capabilities: unifiDriver.capabilities };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  async listAps(c): Promise<ApDevice[]> {
    const s = await login(c);
    return (await devices(c, s)).map((d) => ({
      mac: text(d.mac),
      name: nullableText(d.name ?? d.model),
      model: nullableText(d.model),
      state: d.state === 1 ? "online" : "offline",
      version: nullableText(d.version),
      clients: numberValue(d.num_sta),
      uptime: numberValue(d.uptime),
      cpu_pct: num(Number(isRecord(d["system-stats"]) ? d["system-stats"].cpu : undefined)),
      mem_pct: num(Number(isRecord(d["system-stats"]) ? d["system-stats"].mem : undefined)),
      ip: nullableText(d.ip),
      ref: nullableText(d._id),
    }));
  },

  async listClients(c): Promise<ApClient[]> {
    const s = await login(c);
    const out = await call<{ data: UnknownRecord[] }>(c, s, "/stat/sta");
    return (out.data ?? []).map((x) => ({
      mac: text(x.mac),
      hostname: nullableText(x.hostname ?? x.name),
      ip: nullableText(x.ip),
      ap_mac: nullableText(x.ap_mac),
      ssid: nullableText(x.essid),
      signal: x.signal == null ? null : numberValue(x.signal),
      rx_bytes: numberValue(x.rx_bytes),
      tx_bytes: numberValue(x.tx_bytes),
      uptime: numberValue(x.uptime),
      blocked: Boolean(x.blocked),
    }));
  },

  async listSsids(c): Promise<Ssid[]> {
    const s = await login(c);
    const out = await call<{ data: UnknownRecord[] }>(c, s, "/rest/wlanconf");
    return (out.data ?? []).map((w) => ({
      ref: text(w._id),
      name: text(w.name),
      enabled: Boolean(w.enabled),
      security: nullableText(w.security),
      vlan: w.vlan ? Number(w.vlan) : null,
      band: nullableText(w.wlan_band),
      hidden: Boolean(w.hide_ssid),
    }));
  },

  async saveSsid(c, input: SsidInput) {
    const s = await login(c);
    const body: Record<string, unknown> = {
      name: input.name,
      enabled: input.enabled ?? true,
      security: input.security ?? (input.password ? "wpapsk" : "open"),
      hide_ssid: input.hidden ?? false,
    };
    if (input.password) body["x_passphrase"] = input.password;
    if (input.vlan != null) {
      body["vlan_enabled"] = true;
      body["vlan"] = String(input.vlan);
    }
    if (input.ref) {
      await call(c, s, `/rest/wlanconf/${input.ref}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
    } else {
      await call(c, s, `/rest/wlanconf`, { method: "POST", body: JSON.stringify(body) });
    }
    return { ok: true as const };
  },

  async setSsidEnabled(c, ref, enabled) {
    const s = await login(c);
    await call(c, s, `/rest/wlanconf/${ref}`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    });
    return { ok: true as const };
  },

  async setSsidPassword(c, ref, password) {
    const s = await login(c);
    await call(c, s, `/rest/wlanconf/${ref}`, {
      method: "PUT",
      body: JSON.stringify({ x_passphrase: password, security: "wpapsk" }),
    });
    return { ok: true as const };
  },

  async setSsidVlan(c, ref, vlan) {
    const s = await login(c);
    await call(c, s, `/rest/wlanconf/${ref}`, {
      method: "PUT",
      body: JSON.stringify(
        vlan == null ? { vlan_enabled: false } : { vlan_enabled: true, vlan: String(vlan) },
      ),
    });
    return { ok: true as const };
  },

  async listRadios(c): Promise<Radio[]> {
    const s = await login(c);
    const out: Radio[] = [];
    for (const d of await devices(c, s)) {
      for (const r of records(d.radio_table)) {
        out.push({
          ref: `${d._id}:${r.radio ?? r.name}`,
          ap_mac: nullableText(d.mac),
          band: nullableText(r.radio),
          channel: r.channel != null ? String(r.channel) : null,
          width: r.ht != null ? String(r.ht) : null,
          tx_power: nullableText(r.tx_power_mode ?? r.tx_power),
        });
      }
    }
    return out;
  },

  async setRadio(c, input: RadioInput) {
    const s = await login(c);
    const [deviceId, radioName] = input.ref.split(":");
    const list = await devices(c, s);
    const dev = list.find((d) => d._id === deviceId);
    if (!dev) throw new Error("Access point not found on the controller.");
    const table = (Array.isArray(dev.radio_table) ? dev.radio_table : []).map(
      (r: UnknownRecord) => {
        if ((r.radio ?? r.name) !== radioName) return r;
        const next = { ...r };
        if (input.channel)
          next.channel = /^\d+$/.test(input.channel) ? Number(input.channel) : input.channel;
        if (input.width) next.ht = Number(input.width) || r.ht;
        if (input.tx_power) {
          next.tx_power_mode = input.tx_power;
          if (/^\d+$/.test(input.tx_power)) {
            next.tx_power_mode = "custom";
            next.tx_power = Number(input.tx_power);
          }
        }
        return next;
      },
    );
    await call(c, s, `/rest/device/${deviceId}`, {
      method: "PUT",
      body: JSON.stringify({ radio_table: table }),
    });
    return { ok: true as const };
  },

  async rebootAp(c, _ref, mac) {
    const s = await login(c);
    await call(c, s, `/cmd/devmgr`, {
      method: "POST",
      body: JSON.stringify({ cmd: "restart", mac }),
    });
    return { ok: true as const };
  },

  async listAlarms(c): Promise<ApAlarm[]> {
    const s = await login(c);
    const out = await call<{ data: UnknownRecord[] }>(c, s, "/stat/alarm");
    return (out.data ?? []).slice(0, 100).map((a, i) => ({
      id: text(a._id, String(i)),
      at: nullableText(a.datetime) ?? (a.time ? new Date(numberValue(a.time)).toISOString() : null),
      severity: a.archived ? "info" : "warning",
      message: text(a.msg ?? a.key, "Alarm"),
    }));
  },

  async trafficStats(c): Promise<TrafficStat[]> {
    const s = await login(c);
    return (await devices(c, s)).map((d) => ({
      label: text(d.name ?? d.model ?? d.mac),
      rx_bytes: numberValue(
        d.rx_bytes ?? (isRecord(d.stat) && isRecord(d.stat.ap) ? d.stat.ap.rx_bytes : 0),
      ),
      tx_bytes: numberValue(
        d.tx_bytes ?? (isRecord(d.stat) && isRecord(d.stat.ap) ? d.stat.ap.tx_bytes : 0),
      ),
    }));
  },

  async clientAction(c, mac, action) {
    const s = await login(c);
    const cmd =
      action === "block" ? "block-sta" : action === "unblock" ? "unblock-sta" : "kick-sta";
    await call(c, s, `/cmd/stamgr`, { method: "POST", body: JSON.stringify({ cmd, mac }) });
    return { ok: true as const };
  },
};
