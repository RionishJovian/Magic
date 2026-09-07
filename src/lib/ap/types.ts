// Brand-agnostic access point management contracts.
// Every driver in src/lib/ap/*.server.ts implements ApDriver.

import type { RouterConn } from "../mikrotik.server";

export const AP_BRANDS = ["unifi", "mikrotik", "ruijie", "generic"] as const;
export type ApBrand = (typeof AP_BRANDS)[number];

export const AP_BRAND_LABEL: Record<ApBrand, string> = {
  unifi: "Ubiquiti UniFi",
  mikrotik: "MikroTik (CAPsMAN / wireless)",
  ruijie: "Ruijie / Reyee",
  generic: "Other brand (manual profile)",
};

export type ApCapability =
  | "aps"
  | "apMeta"
  | "clients"
  | "clientActions"
  | "ssids"
  | "ssidWrite"
  | "ssidPassword"
  | "ssidEnable"
  | "ssidVlan"
  | "radios"
  | "radioWrite"
  | "reboot"
  | "alarms"
  | "traffic";

export const CAPABILITY_LABEL: Record<ApCapability, string> = {
  aps: "Access point list",
  apMeta: "Name & location",
  clients: "Connected clients",
  clientActions: "Kick / block clients",
  ssids: "SSID list",
  ssidWrite: "Create & edit SSID",
  ssidPassword: "Change Wi-Fi password",
  ssidEnable: "Enable / disable SSID",
  ssidVlan: "VLAN per SSID",
  radios: "Radio list",
  radioWrite: "Channel & TX power",
  reboot: "Reboot AP",
  alarms: "Alarms & events",
  traffic: "Traffic statistics",
};

/** Everything a driver needs to talk to one controller / device. */
export type ApConn = {
  id: string;
  brand: ApBrand;
  host: string;
  port: number;
  username: string;
  password: string;
  site: string;
  isUnifiOs: boolean;
  allowInsecureTls: boolean;
  /** Pinned SHA-256 certificate fingerprint used when proxied via a connector. */
  tlsFingerprint?: string | null;
  apiBasePath?: string | null;
  /**
   * When set, requests are routed through the customer's local connector
   * instead of dialling the device directly from the cloud.
   */
  connectorId?: string | null;
  /** Resolved by the server-function layer when brand === "mikrotik". */
  routerConn?: RouterConn;
};

export type ApDevice = {
  mac: string;
  name: string | null;
  model: string | null;
  state: "online" | "offline" | "unknown";
  version: string | null;
  clients: number;
  uptime: number;
  cpu_pct: number | null;
  mem_pct: number | null;
  ip: string | null;
  /** Driver-native id needed for writes (UniFi _id, RouterOS .id, …). */
  ref: string | null;
};

export type ApClient = {
  mac: string;
  hostname: string | null;
  ip: string | null;
  ap_mac: string | null;
  ssid: string | null;
  signal: number | null;
  rx_bytes: number;
  tx_bytes: number;
  uptime: number;
  blocked: boolean;
};

export type Ssid = {
  ref: string;
  name: string;
  enabled: boolean;
  security: string | null;
  vlan: number | null;
  band: string | null;
  hidden: boolean;
};

export type SsidInput = {
  ref?: string | null;
  name: string;
  password?: string | null;
  enabled?: boolean;
  vlan?: number | null;
  security?: string | null;
  hidden?: boolean;
};

export type Radio = {
  ref: string;
  ap_mac: string | null;
  band: string | null;
  channel: string | null;
  width: string | null;
  tx_power: string | null;
};

export type RadioInput = {
  ref: string;
  channel?: string | null;
  width?: string | null;
  tx_power?: string | null;
};

export type ApAlarm = {
  id: string;
  at: string | null;
  severity: string;
  message: string;
};

export type TrafficStat = {
  label: string;
  rx_bytes: number;
  tx_bytes: number;
};

export type ProbeResult = {
  ok: boolean;
  info?: unknown;
  error?: string;
  capabilities?: ApCapability[];
};

export interface ApDriver {
  brand: ApBrand;
  capabilities: ApCapability[];
  probe(c: ApConn): Promise<ProbeResult>;
  listAps(c: ApConn): Promise<ApDevice[]>;
  listClients(c: ApConn): Promise<ApClient[]>;
  listSsids(c: ApConn): Promise<Ssid[]>;
  saveSsid(c: ApConn, input: SsidInput): Promise<{ ok: true }>;
  setSsidEnabled(c: ApConn, ref: string, enabled: boolean): Promise<{ ok: true }>;
  setSsidPassword(c: ApConn, ref: string, password: string): Promise<{ ok: true }>;
  setSsidVlan(c: ApConn, ref: string, vlan: number | null): Promise<{ ok: true }>;
  listRadios(c: ApConn): Promise<Radio[]>;
  setRadio(c: ApConn, input: RadioInput): Promise<{ ok: true }>;
  rebootAp(c: ApConn, ref: string, mac: string): Promise<{ ok: true }>;
  listAlarms(c: ApConn): Promise<ApAlarm[]>;
  trafficStats(c: ApConn): Promise<TrafficStat[]>;
  clientAction(
    c: ApConn,
    mac: string,
    action: "block" | "unblock" | "reconnect",
  ): Promise<{ ok: true }>;
}

export function unsupported(brand: ApBrand, what: string): never {
  throw new Error(`${AP_BRAND_LABEL[brand]} does not support ${what} through this app.`);
}
