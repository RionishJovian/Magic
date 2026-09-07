/**
 * Hotspot Wi-Fi (SSID) — full hotspot setup on Routers: foundation (pool + profile +
 * server), guest SSID (wifiwave2), or LAN-port bridge mode. Tagged Magic objects only.
 */
import type { RouterConn } from "./mikrotik.server";
import { routerAPI, stripCommentParamsFromCli } from "./mikrotik.server";

export const MM_HOTSPOT_SSID_COMMENT = "mm-hotspot-ssid";
export const MM_HOTSPOT_SERVER_COMMENT = "mm-hotspot-server";
export const MM_HOTSPOT_FOUNDATION_COMMENT = "mm-hotspot-foundation";
export const MM_HOTSPOT_POOL_NAME = "hotspot-pool";
export const MM_HOTSPOT_PROFILE_NAME = "hsprof-vouchers";
export const MM_HOTSPOT_SERVER_NAME = "mm-hs-server";
export const MM_HOTSPOT_DNS_NAME = "login.hotspot.lan";
export const MM_HOTSPOT_WIFI_NAME_PREFIX = "mm-hs-";
export const MM_HOTSPOT_DHCP_SERVER_NAME = "mm-hs-dhcp";

type Row = Record<string, string>;

export type WifiStack = "wifiwave2" | "legacy-wireless" | "none";
export type HotspotSetupMode = "builtin-wifi" | "lan-port";

export type WifiInterfaceRow = {
  id: string;
  name: string;
  ssid: string | null;
  disabled: boolean;
  masterInterface: string | null;
  configuration: string | null;
  comment: string | null;
  band: "2.4" | "5" | "unknown";
  managedByMagic: boolean;
  configurationManager?: string | null;
};

export type HotspotServerRow = {
  id: string;
  name: string;
  interface: string;
  profile: string | null;
  addressPool: string | null;
  disabled: boolean;
  managedByMagic: boolean;
};

/** Prefer canonical mm-hs-server; if that name is on another bridge, use mm-hs-<bridge>. */
export function hotspotServerNameForBridge(
  bridge: string,
  existingServers: HotspotServerRow[],
): string {
  const onBridge = existingServers.find((s) => s.interface === bridge && !s.disabled);
  if (onBridge?.name) return onBridge.name;

  const canonicalTakenElsewhere = existingServers.some(
    (s) => s.name === MM_HOTSPOT_SERVER_NAME && s.interface !== bridge,
  );
  if (!canonicalTakenElsewhere) return MM_HOTSPOT_SERVER_NAME;

  const slug = bridge
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return `mm-hs-${slug || "br"}`;
}

export type BridgeOption = { name: string; label: string };
export type EtherPortOption = { name: string; label: string };

export type HotspotChecklist = {
  pool: boolean;
  profile: boolean;
  server: boolean;
  ssid: boolean;
};

/** Authentication path for Magic-generated voucher codes on the managed HotSpot profile. */
export type VoucherLoginMode = "local" | "radius" | "unknown";

export type WifiHotspotProbe = {
  reachable: boolean;
  reachError: string | null;
  stack: WifiStack;
  wifiInterfaces: WifiInterfaceRow[];
  hotspotServers: HotspotServerRow[];
  bridges: BridgeOption[];
  etherPorts: EtherPortOption[];
  suggestedBridge: string | null;
  capModeActive: boolean;
  defaultMode: HotspotSetupMode;
  canSetupBuiltin: boolean;
  canSetupLanPort: boolean;
  setupBlockedReason: string | null;
  hasHotspotPool: boolean;
  hasHotspotProfile: boolean;
  /** Magic-tagged DHCP server name present on router. */
  hasMagicDhcpServer: boolean;
  /** Bridges served by the Magic-tagged DHCP server. */
  magicDhcpServerBridges?: string[];
  /** Range of the Magic pool, when it can be read. */
  hotspotPoolRange?: string | null;
  /** DHCP network CIDRs already configured (e.g. 192.168.88.0/24). */
  dhcpNetworkCidrs: string[];
  /** Magic hotspot profile id + current auth settings (for safe repair). */
  hotspotProfile: { id: string; hotspotAddress: string | null; useRadius: boolean } | null;
  /** Voucher Workflow requires RouterOS-local validation, not RADIUS. */
  voucherLoginMode: VoucherLoginMode;
  /** Names on /interface/wifi/* menus — skip recreate on retry after partial apply. */
  existingWifiNames: string[];
  checklist: HotspotChecklist;
  foundation: {
    gatewayIp: string | null;
    gatewayCidr?: string | null;
    poolRange: string | null;
    hasDhcpOnBridge: boolean;
  };
  /** Per-bridge gateway/DHCP so plan uses the operator-selected bridge, not only suggested. */
  bridgeFoundations: Record<
    string,
    {
      gatewayIp: string | null;
      gatewayCidr?: string | null;
      poolRange: string | null;
      hasDhcpOnBridge: boolean;
    }
  >;
};

export type HotspotSetupInput = {
  mode: HotspotSetupMode;
  ssid: string;
  bridge: string;
  bands: Array<"2.4" | "5">;
  /** LAN ports for AP / switch (lan-port mode). Magic bridges any that are not already on the hotspot bridge. */
  lanPorts: string[];
  /** Operator confirmed the selected ports physically lead to an external guest AP/switch. */
  externalApConfirmed?: boolean;
  disableCapMode: boolean;
};

/** Normalize API / legacy single-port input into a deduped port list. */
export function normalizeLanPorts(input: {
  lanPorts?: string[] | null;
  lanPort?: string | null;
}): string[] {
  const fromList = (input.lanPorts ?? []).map((p) => p.trim()).filter(Boolean);
  if (fromList.length) return [...new Set(fromList)];
  const single = input.lanPort?.trim();
  return single ? [single] : [];
}

/** Recover ports from a successful app-managed LAN-port apply for safe UI suggestions. */
export function parseLanPortsFromHotspotAuditDetail(detail: string | null | undefined): string[] {
  const match = detail?.match(/\bports?\s+([^·]+)/i);
  if (!match?.[1]) return [];
  return [
    ...new Set(
      match[1]
        .split(",")
        .map((port) => port.trim())
        .filter(Boolean),
    ),
  ];
}

export type PlannedStep = {
  op: "put" | "patch";
  path: string;
  body: Record<string, string>;
  /** Exact prior values restored when a later step fails. */
  rollbackBody?: Record<string, string>;
  label: string;
};

export type ReviewPlanItem = {
  id: string;
  label: string;
  status: "create" | "skip" | "info" | "warn";
  detail?: string;
  kind: "pool" | "profile" | "server" | "wifi" | "bridge" | "port" | "cap" | "dhcp";
};

export type HotspotSetupPreview = {
  mode: HotspotSetupMode;
  ssid: string;
  bridge: string;
  lanPorts: string[];
  gatewayIp: string | null;
  poolRange: string | null;
  bands: Array<"2.4" | "5">;
  items: ReviewPlanItem[];
  warnings: string[];
  canApply: boolean;
  blockReason: string | null;
  steps: PlannedStep[];
};

export type HotspotStepOutcome = "created" | "skipped" | "failed";

export type HotspotApplyStepResult = {
  label: string;
  path: string;
  op: "put" | "patch";
  outcome: HotspotStepOutcome;
  /** rest = RouterOS REST write; cli = /execute fallback */
  transport: "rest" | "cli";
  /** Sanitized REST path or CLI command (no secrets). */
  command?: string;
  /** Why a step was skipped (duplicate name, already on router, etc.). */
  note?: string;
  error?: string;
};

export type HotspotApplyResult = {
  ok: boolean;
  steps: HotspotApplyStepResult[];
  /** Labels of steps that actually created or updated something. */
  created: string[];
  skipped: string[];
  warnings: string[];
  /** Labels rolled back after a mid-apply failure (best-effort). */
  rolledBack?: string[];
  error?: string;
};

const WAN_LIST_NAMES = new Set(["wan"]);

async function listRows(c: RouterConn, path: string): Promise<Row[]> {
  try {
    const rows = await routerAPI.raw<Row[]>(c, path);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

async function putRow(c: RouterConn, path: string, body: Record<string, string>) {
  const payload = JSON.stringify(body);
  const attempts = [
    () => routerAPI.raw(c, path, { method: "PUT", body: payload }),
    () => routerAPI.raw(c, `${path}/add`, { method: "POST", body: payload }),
    () => routerAPI.raw(c, path, { method: "POST", body: payload }),
  ];
  let last: unknown;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

function rosCliQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$")}"`;
}

const REST_TO_CLI_MENU: Record<string, string> = {
  "/ip/pool": "/ip pool",
  "/ip/hotspot/profile": "/ip hotspot profile",
  "/ip/hotspot": "/ip hotspot",
  "/ip/dhcp-server": "/ip dhcp-server",
  "/ip/dhcp-server/network": "/ip dhcp-server network",
  "/interface/bridge/port": "/interface bridge port",
  "/interface/wifi/security": "/interface wifi security",
  "/interface/wifi/datapath": "/interface wifi datapath",
  "/interface/wifi/configuration": "/interface wifi configuration",
  "/interface/wifi": "/interface wifi",
};

/** RouterOS wifi menus reject `comment` on CLI add (security/configuration/VAP). */
const CLI_OMIT_COMMENT_PATHS = new Set([
  "/interface/bridge/port",
  "/interface/wifi/security",
  "/interface/wifi/datapath",
  "/interface/wifi/configuration",
  "/interface/wifi",
  "/ip/pool",
  "/ip/hotspot/profile",
  "/ip/hotspot",
]);

export function isMagicHotspotWifiRow(input: {
  name?: string | null;
  configuration?: string | null;
  comment?: string | null;
}): boolean {
  const comment = input.comment ?? "";
  if (comment === MM_HOTSPOT_SSID_COMMENT) return true;
  const name = input.name ?? "";
  if (name.startsWith(MM_HOTSPOT_WIFI_NAME_PREFIX)) return true;
  const cfg = input.configuration ?? "";
  if (cfg.startsWith(`${MM_HOTSPOT_WIFI_NAME_PREFIX}cfg-`)) return true;
  return false;
}

/** Guest SSIDs Magic created on the board (for UI + print slips). */
export function guestSsidNamesFromProbe(probe: Pick<WifiHotspotProbe, "wifiInterfaces">): string[] {
  const names = new Set<string>();
  for (const w of probe.wifiInterfaces) {
    if (!w.managedByMagic) continue;
    const ssid = w.ssid?.trim();
    if (ssid) names.add(ssid);
  }
  return [...names];
}

export type HotspotGuestReadiness = {
  reachable: boolean;
  reachError: string | null;
  hasPool: boolean;
  hasProfile: boolean;
  hasServer: boolean;
  hasGuestSsid: boolean;
  capModeActive: boolean;
  guestSsids: string[];
  voucherLoginMode: VoucherLoginMode;
  /** Captive portal foundation ready (pool+profile+server). */
  foundationReady: boolean;
  /** Builtin guest radio ready (or CAP still blocking). */
  radioReady: boolean;
  /** Router-observable guest access path. External AP broadcasts require a real client test. */
  accessPathReady: boolean;
  level: "ok" | "warn" | "block";
  summary: string;
};

/** Shared gate for Vouchers / Portal after Hotspot Wi‑Fi apply. */
export function assessHotspotGuestReady(probe: WifiHotspotProbe): HotspotGuestReadiness {
  const guestSsids = guestSsidNamesFromProbe(probe);
  const hasPool = probe.checklist.pool;
  const hasProfile = probe.checklist.profile;
  const hasServer = probe.checklist.server;
  const hasGuestSsid = probe.checklist.ssid || guestSsids.length > 0;
  const foundationReady = hasPool && hasProfile && hasServer;
  const radioReady = hasGuestSsid && !probe.capModeActive;

  if (!probe.reachable) {
    return {
      reachable: false,
      reachError: probe.reachError,
      hasPool,
      hasProfile,
      hasServer,
      hasGuestSsid,
      capModeActive: probe.capModeActive,
      guestSsids,
      voucherLoginMode: probe.voucherLoginMode,
      foundationReady: false,
      radioReady: false,
      accessPathReady: false,
      level: "block",
      summary: probe.reachError ?? "Router unreachable — open Routers and Test the board first.",
    };
  }

  if (!foundationReady) {
    return {
      reachable: true,
      reachError: null,
      hasPool,
      hasProfile,
      hasServer,
      hasGuestSsid,
      capModeActive: probe.capModeActive,
      guestSsids,
      voucherLoginMode: probe.voucherLoginMode,
      foundationReady: false,
      radioReady,
      accessPathReady: false,
      level: "block",
      summary:
        "Hotspot foundation incomplete — open Routers → Hotspot Wi‑Fi and run Set up hotspot (pool, profile, captive portal).",
    };
  }

  if (probe.voucherLoginMode === "radius") {
    return {
      reachable: true,
      reachError: null,
      hasPool,
      hasProfile,
      hasServer,
      hasGuestSsid,
      capModeActive: probe.capModeActive,
      guestSsids,
      voucherLoginMode: "radius",
      foundationReady: true,
      radioReady,
      accessPathReady: false,
      level: "block",
      summary:
        "This Magic HotSpot profile is configured to use RADIUS. Local voucher codes will not validate until RADIUS is deliberately configured, or use-radius is set to no.",
    };
  }

  if (probe.capModeActive && !hasGuestSsid) {
    return {
      reachable: true,
      reachError: null,
      hasPool,
      hasProfile,
      hasServer,
      hasGuestSsid,
      capModeActive: true,
      guestSsids,
      voucherLoginMode: probe.voucherLoginMode,
      foundationReady: true,
      radioReady: false,
      accessPathReady: false,
      level: "block",
      summary:
        "Radios are still waiting on CAPsMAN — in Hotspot Wi‑Fi check “Use local AP mode”, then Apply again so a guest SSID can broadcast.",
    };
  }

  if (!hasGuestSsid) {
    // LAN-port / external-AP setups never create Magic wifi objects. Foundation
    // is observable, but AP cabling, SSID broadcast and captive redirect are not.
    return {
      reachable: true,
      reachError: null,
      hasPool,
      hasProfile,
      hasServer,
      hasGuestSsid: false,
      capModeActive: probe.capModeActive,
      guestSsids,
      voucherLoginMode: probe.voucherLoginMode,
      foundationReady: true,
      radioReady: false,
      accessPathReady: false,
      level: "warn",
      summary:
        "Hotspot foundation is ready, but the external AP is not verified. Confirm its LAN port, bridge/AP mode, DHCP off, matching SSID, then test captive login from a phone.",
    };
  }

  if (probe.capModeActive) {
    return {
      reachable: true,
      reachError: null,
      hasPool,
      hasProfile,
      hasServer,
      hasGuestSsid,
      capModeActive: true,
      guestSsids,
      voucherLoginMode: probe.voucherLoginMode,
      foundationReady: true,
      radioReady: false,
      accessPathReady: false,
      level: "warn",
      summary: `Guest SSID “${guestSsids.join(" / ")}” exists but CAP mode is still active — phones may not see it until local AP mode is applied.`,
    };
  }

  return {
    reachable: true,
    reachError: null,
    hasPool,
    hasProfile,
    hasServer,
    hasGuestSsid,
    capModeActive: false,
    guestSsids,
    voucherLoginMode: probe.voucherLoginMode,
    foundationReady: true,
    radioReady: true,
    accessPathReady: true,
    level: "ok",
    summary: `Guest Wi‑Fi ready: ${guestSsids.join(" / ")}`,
  };
}

function cliParamKey(key: string): string {
  return key.replace(/-/g, "-");
}

function cliParamValue(key: string, value: string): string {
  const k = cliParamKey(key);
  if (key === "comment" || key === "ssid" || key === "ranges" || /[\s,=]/.test(value)) {
    return `${k}=${rosCliQuote(value)}`;
  }
  return `${k}=${value}`;
}

/** Exported for tests — RouterOS REST often rejects profile create; CLI is the fallback. */
export function isCapsmanWifiManager(value: string | undefined | null): boolean {
  const mgr = (value ?? "").trim().toLowerCase();
  return mgr === "capsman" || mgr === "capsman-or-local";
}

/** Exported for tests — RouterOS REST often rejects profile create; CLI is the fallback. */
export function plannedStepToCli(step: PlannedStep): string | null {
  if (step.path === "/interface/wifi/cap") {
    const enabled = step.body.enabled ?? "no";
    return `/interface wifi cap set enabled=${enabled}`;
  }
  if (step.op === "patch" && step.body["configuration.manager"] && step.body.name) {
    return `/interface wifi set ${step.body.name} configuration.manager=${step.body["configuration.manager"]}`;
  }
  const menu = REST_TO_CLI_MENU[step.path];
  if (!menu) return null;
  const parts = Object.entries(step.body)
    .filter(([, v]) => v !== "")
    .filter(([key]) => !(CLI_OMIT_COMMENT_PATHS.has(step.path) && key === "comment"))
    .map(([key, value]) => cliParamValue(key, value));
  return `${menu} add ${parts.join(" ")}`;
}

function stepResultBase(step: PlannedStep): Pick<HotspotApplyStepResult, "label" | "path" | "op"> {
  return { label: step.label, path: step.path, op: step.op };
}

function isDuplicateNameError(msg: string): boolean {
  return /must use unique name|already have such|already exists/i.test(msg);
}

/**
 * RouterOS errors are normalized by routerAPI.raw before they reach this
 * workflow. Keep the fallback decision compatible with both the raw REST
 * response and the normalized operator-facing message.
 */
function isCliFallbackError(msg: string): boolean {
  return /400|406|no such command|bad request|unsupported menu|menu missing|RouterOS too old/i.test(
    msg,
  );
}

/** Exported for tests — audit-friendly description of a planned step. */
export function describePlannedStep(step: PlannedStep): string {
  if (step.op === "patch") {
    const cli = plannedStepToCli(step);
    return cli ?? `${step.path} PATCH ${JSON.stringify(step.body)}`;
  }
  const cli = plannedStepToCli(step);
  return cli ?? `${step.path} PUT ${JSON.stringify(step.body)}`;
}

async function applyPlannedStep(c: RouterConn, step: PlannedStep): Promise<HotspotApplyStepResult> {
  const base = stepResultBase(step);
  try {
    if (step.op === "put") {
      await putRow(c, step.path, step.body);
      return {
        ...base,
        outcome: "created",
        transport: "rest",
        command: describePlannedStep(step),
      };
    }
    await patchRow(c, step.path, step.body);
    return {
      ...base,
      outcome: "created",
      transport: "rest",
      command: describePlannedStep(step),
    };
  } catch (first) {
    const msg = first instanceof Error ? first.message : String(first);
    if (isDuplicateNameError(msg)) {
      return {
        ...base,
        outcome: "skipped",
        transport: "rest",
        command: describePlannedStep(step),
        note: "Object already exists on router (duplicate name).",
      };
    }
    if (!isCliFallbackError(msg)) {
      return {
        ...base,
        outcome: "failed",
        transport: "rest",
        command: describePlannedStep(step),
        error: msg,
      };
    }
    const cli = plannedStepToCli(step);
    if (!cli) {
      return {
        ...base,
        outcome: "failed",
        transport: "rest",
        command: describePlannedStep(step),
        error: msg,
      };
    }
    try {
      await routerAPI.execScript(c, cli);
      return { ...base, outcome: "created", transport: "cli", command: cli };
    } catch (cliErr) {
      const cliMsg = cliErr instanceof Error ? cliErr.message : String(cliErr);
      if (isDuplicateNameError(cliMsg)) {
        return {
          ...base,
          outcome: "skipped",
          transport: "cli",
          command: cli,
          note: "Object already exists on router (duplicate name).",
        };
      }
      if (/bad parameter comment/i.test(cliMsg) && /\bcomment=/.test(cli)) {
        const stripped = stripCommentParamsFromCli(cli);
        if (stripped !== cli) {
          try {
            await routerAPI.execScript(c, stripped);
            return {
              ...base,
              outcome: "created",
              transport: "cli",
              command: stripped,
              note: "Retried without comment= (hAP ax² CLI limit).",
            };
          } catch (retryErr) {
            const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
            if (isDuplicateNameError(retryMsg)) {
              return {
                ...base,
                outcome: "skipped",
                transport: "cli",
                command: stripped,
                note: "Object already exists on router (duplicate name).",
              };
            }
            return {
              ...base,
              outcome: "failed",
              transport: "cli",
              command: stripped,
              error: retryMsg,
            };
          }
        }
      }
      return { ...base, outcome: "failed", transport: "cli", command: cli, error: cliMsg };
    }
  }
}

async function patchRow(c: RouterConn, path: string, body: Record<string, string>) {
  await routerAPI.raw(c, path, { method: "PATCH", body: JSON.stringify(body) });
}

export function slugFromSsid(ssid: string): string {
  const base = ssid
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  return base || "guest";
}

function ipv4ToInt(value: string): number | null {
  const parts = value.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null;
  }
  return parts.reduce((result, part) => (result * 256 + part) >>> 0, 0);
}

function intToIpv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

function parseIpv4Cidr(value: string): {
  host: number;
  prefix: number;
  network: number;
  broadcast: number;
} {
  const [hostText, prefixText = "24"] = value.split("/");
  const host = ipv4ToInt(hostText ?? "");
  const prefix = Number(prefixText);
  if (host == null || !Number.isInteger(prefix) || prefix < 0 || prefix > 30) {
    throw new Error(`Bridge gateway ${value} must be a valid IPv4 CIDR with prefix /0 to /30.`);
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (host & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  return { host, prefix, network, broadcast };
}

/** Derive a pool contained by the bridge CIDR, excluding gateway and broadcast. */
export function derivePoolRange(gatewayCidr: string): string {
  const { host, network, broadcast } = parseIpv4Cidr(gatewayCidr);
  let start = Math.min(network + 10, broadcast - 1) >>> 0;
  if (start <= network || start === host) start = (network + 1) >>> 0;
  if (start === host) start++;
  const end = (broadcast - 1) >>> 0;
  if (start > end) throw new Error(`Bridge gateway ${gatewayCidr} leaves no address for DHCP.`);
  return `${intToIpv4(start)}-${intToIpv4(end)}`;
}

/** Derive the actual network from the bridge gateway CIDR. */
export function deriveNetworkCidr(gatewayCidr: string): string {
  const { network, prefix } = parseIpv4Cidr(gatewayCidr);
  return `${intToIpv4(network)}/${prefix}`;
}

function inferBand(name: string, row: Row): "2.4" | "5" | "unknown" {
  const band = (row.band ?? row["current-band"] ?? "").toLowerCase();
  if (/2\.?4|2ghz/.test(band)) return "2.4";
  if (/5ghz|5\s*ghz|a\/n\/ac/.test(band)) return "5";
  if (/wifi1|wlan1|2g/.test(name.toLowerCase())) return "2.4";
  if (/wifi2|wlan2|5g/.test(name.toLowerCase())) return "5";
  return "unknown";
}

function mapWifiRow(row: Row, configurations: Map<string, string>): WifiInterfaceRow {
  const name = row.name ?? "";
  const cfgName = row.configuration ?? null;
  const ssidFromCfg = cfgName ? (configurations.get(cfgName) ?? null) : null;
  const comment = row.comment ?? null;
  return {
    id: row[".id"] ?? name,
    name,
    ssid: row.ssid ?? ssidFromCfg,
    disabled: row.disabled === "true",
    masterInterface: row["master-interface"] ?? null,
    configuration: cfgName,
    comment,
    band: inferBand(name, row),
    managedByMagic: isMagicHotspotWifiRow({ name, configuration: cfgName, comment }),
    configurationManager: row["configuration.manager"] ?? null,
  };
}

function mapLegacyWireless(row: Row): WifiInterfaceRow {
  const name = row.name ?? "";
  const comment = row.comment ?? null;
  return {
    id: row[".id"] ?? name,
    name,
    ssid: row.ssid ?? null,
    disabled: row.disabled === "true",
    masterInterface: row["master-interface"] ?? null,
    configuration: row["security-profile"] ?? null,
    comment,
    band: inferBand(name, row),
    managedByMagic: isMagicHotspotWifiRow({
      name,
      configuration: row["security-profile"] ?? null,
      comment,
    }),
    configurationManager: null,
  };
}

export function pickSuggestedBridge(
  bridges: BridgeOption[],
  hotspotServers: HotspotServerRow[],
): string | null {
  if (hotspotServers.length > 0) {
    const magic =
      hotspotServers.find((s) => !s.disabled && s.name === MM_HOTSPOT_SERVER_NAME) ??
      hotspotServers.find((s) => !s.disabled && s.managedByMagic) ??
      hotspotServers.find((s) => !s.disabled);
    const iface = (magic ?? hotspotServers[0])?.interface;
    if (iface) return iface;
  }
  // Prefer common LAN names including hAP default bridgeLocal (does not match /lan/).
  const preferred = bridges.find(
    (b) =>
      /^(bridge|bridgelocal)$/i.test(b.name) || /bridge-lan|bridge_local|hotspot/i.test(b.name),
  );
  if (preferred) return preferred.name;
  const lanish = bridges.find((b) => /lan/i.test(b.name));
  if (lanish) return lanish.name;
  return bridges[0]?.name ?? null;
}

export function foundationForBridge(
  addresses: Array<{ interface?: string; address?: string }>,
  dhcpServers: Array<{ interface?: string; disabled?: string }>,
  bridgeName: string,
): {
  gatewayIp: string | null;
  gatewayCidr: string | null;
  poolRange: string | null;
  hasDhcpOnBridge: boolean;
} {
  const gatewayCidr = parseGatewayOnBridge(addresses as Row[], bridgeName);
  const gatewayIp = gatewayCidr?.split("/")[0] ?? null;
  return {
    gatewayIp,
    gatewayCidr,
    poolRange: gatewayCidr ? derivePoolRange(gatewayCidr) : null,
    hasDhcpOnBridge: dhcpServers.some((d) => d.interface === bridgeName && d.disabled !== "true"),
  };
}

function parseGatewayOnBridge(addresses: Row[], bridgeName: string): string | null {
  for (const a of addresses) {
    if (a.interface !== bridgeName) continue;
    const addr = a.address ?? "";
    if (addr) return addr.includes("/") ? addr : `${addr}/24`;
  }
  return null;
}

export function isLikelyWanInterface(row: { name?: string; comment?: string }): boolean {
  const label = `${row.name ?? ""} ${row.comment ?? ""}`.toLowerCase();
  return /(^|[^a-z0-9])(wan|uplink|internet|isp)([^a-z0-9]|$)/i.test(label);
}

async function wanInterfaceNames(c: RouterConn): Promise<Set<string>> {
  const lists = await listRows(c, "/interface/list");
  const wanListIds = new Set(
    lists
      .filter((l) => WAN_LIST_NAMES.has((l.name ?? "").toLowerCase()))
      .map((l) => l[".id"] ?? ""),
  );
  const wanIfaces = new Set<string>();
  if (wanListIds.size > 0) {
    const members = await listRows(c, "/interface/list/member");
    for (const m of members) {
      if (wanListIds.has(m.list ?? "") && m.interface) wanIfaces.add(m.interface);
    }
  }
  const dhcpClients = await listRows(c, "/ip/dhcp-client");
  for (const client of dhcpClients) {
    if (client.interface && client.disabled !== "true") wanIfaces.add(client.interface);
  }
  return wanIfaces;
}

async function bridgeOptions(c: RouterConn, wanMembers: Set<string>): Promise<BridgeOption[]> {
  const bridges = await listRows(c, "/interface/bridge");
  return bridges
    .filter((b) => b.name && !wanMembers.has(b.name))
    .map((b) => ({
      name: b.name!,
      label: b.comment ? `${b.name} (${b.comment})` : b.name!,
    }));
}

async function etherPortOptions(
  c: RouterConn,
  wanMembers: Set<string>,
): Promise<EtherPortOption[]> {
  const ifaces = await listRows(c, "/interface/ethernet");
  const rows = ifaces.length ? ifaces : await listRows(c, "/interface");
  return rows
    .filter((r) => {
      const n = r.name ?? "";
      return (
        /^ether\d/i.test(n) && !wanMembers.has(n) && !isLikelyWanInterface(r) && r.type !== "bridge"
      );
    })
    .map((r) => ({
      name: r.name!,
      label: r.comment ? `${r.name} (${r.comment})` : r.name!,
    }));
}

async function loadConfigurations(c: RouterConn): Promise<Map<string, string>> {
  const rows = await listRows(c, "/interface/wifi/configuration");
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.name && r.ssid) map.set(r.name, r.ssid);
  }
  return map;
}

function planFoundationSteps(
  probe: WifiHotspotProbe,
  bridge: string,
  gatewayIp: string,
): { steps: PlannedStep[]; items: ReviewPlanItem[] } {
  const steps: PlannedStep[] = [];
  const items: ReviewPlanItem[] = [];
  const poolRange = probe.bridgeFoundations[bridge]?.poolRange ?? derivePoolRange(gatewayIp);
  const serverName = hotspotServerNameForBridge(bridge, probe.hotspotServers);

  if (!probe.hasHotspotPool) {
    steps.push({
      op: "put",
      path: "/ip/pool",
      body: {
        name: MM_HOTSPOT_POOL_NAME,
        ranges: poolRange,
        comment: MM_HOTSPOT_FOUNDATION_COMMENT,
      },
      label: `IP pool ${MM_HOTSPOT_POOL_NAME}`,
    });
    items.push({
      id: "pool",
      kind: "pool",
      status: "create",
      label: "IP pool",
      detail: `${MM_HOTSPOT_POOL_NAME} (${poolRange})`,
    });
  } else {
    items.push({
      id: "pool",
      kind: "pool",
      status: "skip",
      label: "IP pool",
      detail: `${MM_HOTSPOT_POOL_NAME} already exists`,
    });
  }

  if (!probe.hasHotspotProfile) {
    steps.push({
      op: "put",
      path: "/ip/hotspot/profile",
      body: {
        name: MM_HOTSPOT_PROFILE_NAME,
        "hotspot-address": gatewayIp,
        "dns-name": MM_HOTSPOT_DNS_NAME,
        "html-directory": "hotspot",
        "login-by": "http-chap,http-pap",
        // Magic vouchers are RouterOS-local HotSpot users. Do not make a new
        // gateway depend on an external RADIUS service.
        "use-radius": "no",
        comment: MM_HOTSPOT_FOUNDATION_COMMENT,
      },
      label: `Hotspot profile ${MM_HOTSPOT_PROFILE_NAME}`,
    });
    items.push({
      id: "profile",
      kind: "profile",
      status: "create",
      label: "Hotspot profile",
      detail: `${MM_HOTSPOT_PROFILE_NAME} @ ${gatewayIp}`,
    });
  } else {
    const existingAddr = probe.hotspotProfile?.hotspotAddress ?? null;
    const profilePatch: Record<string, string> = {};
    if (probe.hotspotProfile?.useRadius) profilePatch["use-radius"] = "no";
    if (existingAddr && existingAddr !== gatewayIp) profilePatch["hotspot-address"] = gatewayIp;
    if (probe.hotspotProfile?.id && Object.keys(profilePatch).length > 0) {
      steps.push({
        op: "patch",
        path: `/ip/hotspot/profile/${encodeURIComponent(probe.hotspotProfile.id)}`,
        body: profilePatch,
        rollbackBody: existingAddr ? { "hotspot-address": existingAddr } : undefined,
        label: probe.hotspotProfile.useRadius
          ? "Switch Magic vouchers to local authentication"
          : `Refresh profile gateway → ${gatewayIp}`,
      });
      items.push({
        id: "profile",
        kind: "profile",
        status: "create",
        label: "Hotspot profile",
        detail: [
          probe.hotspotProfile.useRadius ? "use-radius=no" : null,
          existingAddr && existingAddr !== gatewayIp
            ? `hotspot-address ${existingAddr} → ${gatewayIp}`
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    } else {
      items.push({
        id: "profile",
        kind: "profile",
        status: "skip",
        label: "Hotspot profile",
        detail: `${MM_HOTSPOT_PROFILE_NAME} already exists`,
      });
    }
  }

  const activeServer = probe.hotspotServers.find(
    (server) => server.interface === bridge && !server.disabled,
  );
  if (!activeServer) {
    steps.push({
      op: "put",
      path: "/ip/hotspot",
      body: {
        name: serverName,
        interface: bridge,
        "address-pool": MM_HOTSPOT_POOL_NAME,
        profile: MM_HOTSPOT_PROFILE_NAME,
        disabled: "no",
        comment: MM_HOTSPOT_SERVER_COMMENT,
      },
      label: `Hotspot server on ${bridge}`,
    });
    items.push({
      id: "server",
      kind: "server",
      status: "create",
      label: "Hotspot server",
      detail: `Captive portal on ${bridge} (${serverName})`,
    });
  } else if (
    activeServer.id &&
    activeServer.profile &&
    activeServer.profile !== MM_HOTSPOT_PROFILE_NAME
  ) {
    steps.push({
      op: "patch",
      path: `/ip/hotspot/${encodeURIComponent(activeServer.id)}`,
      body: { profile: MM_HOTSPOT_PROFILE_NAME },
      rollbackBody: { profile: activeServer.profile },
      label: "Bind running Hotspot to the local voucher profile",
    });
    items.push({
      id: "server",
      kind: "server",
      status: "create",
      label: "Hotspot server",
      detail: `${activeServer.name}: ${activeServer.profile} → ${MM_HOTSPOT_PROFILE_NAME}`,
    });
  } else {
    items.push({
      id: "server",
      kind: "server",
      status: "skip",
      label: "Hotspot server",
      detail: `Already running on ${bridge}`,
    });
  }

  return { steps, items };
}

function bridgeFoundation(
  probe: WifiHotspotProbe,
  bridge: string,
): {
  gatewayIp: string | null;
  gatewayCidr?: string | null;
  poolRange: string | null;
  hasDhcpOnBridge: boolean;
} | null {
  return (
    probe.bridgeFoundations[bridge] ?? (bridge === probe.suggestedBridge ? probe.foundation : null)
  );
}

function planDhcpSteps(
  probe: WifiHotspotProbe,
  bridge: string,
  gatewayIp: string,
): { steps: PlannedStep[]; items: ReviewPlanItem[] } {
  const found = bridgeFoundation(probe, bridge);
  if (found?.hasDhcpOnBridge) {
    return {
      steps: [],
      items: [
        {
          id: "dhcp",
          kind: "dhcp",
          status: "skip",
          label: "DHCP server",
          detail: `Already serving ${bridge}`,
        },
      ],
    };
  }

  const networkCidr = deriveNetworkCidr(found?.gatewayCidr ?? `${gatewayIp}/24`);
  const steps: PlannedStep[] = [];
  const items: ReviewPlanItem[] = [];

  const magicDhcpOnBridge = (probe.magicDhcpServerBridges ?? []).includes(bridge);
  if (!magicDhcpOnBridge) {
    steps.push({
      op: "put",
      path: "/ip/dhcp-server",
      body: {
        name: MM_HOTSPOT_DHCP_SERVER_NAME,
        interface: bridge,
        "address-pool": MM_HOTSPOT_POOL_NAME,
        "lease-time": "1h",
        disabled: "no",
        comment: MM_HOTSPOT_FOUNDATION_COMMENT,
      },
      label: `DHCP server on ${bridge}`,
    });
  }

  if (!probe.dhcpNetworkCidrs.includes(networkCidr)) {
    steps.push({
      op: "put",
      path: "/ip/dhcp-server/network",
      body: {
        address: networkCidr,
        gateway: gatewayIp,
        "dns-server": gatewayIp,
        domain: "hotspot.lan",
        comment: MM_HOTSPOT_FOUNDATION_COMMENT,
      },
      label: `DHCP network ${networkCidr}`,
    });
  }

  if (steps.length === 0) {
    return {
      steps: [],
      items: [
        {
          id: "dhcp",
          kind: "dhcp",
          status: "skip",
          label: "DHCP server",
          detail: `${MM_HOTSPOT_DHCP_SERVER_NAME} and ${networkCidr} already on router`,
        },
      ],
    };
  }

  items.push({
    id: "dhcp",
    kind: "dhcp",
    status: "create",
    label: "DHCP server",
    detail: `${MM_HOTSPOT_DHCP_SERVER_NAME} · pool ${MM_HOTSPOT_POOL_NAME} · gateway ${gatewayIp}`,
  });
  return { steps, items };
}

function wifiNameExists(probe: WifiHotspotProbe, name: string): boolean {
  return probe.existingWifiNames.includes(name);
}

function planBuiltinWifiSteps(
  probe: WifiHotspotProbe,
  input: HotspotSetupInput,
): { steps: PlannedStep[]; items: ReviewPlanItem[]; warnings: string[] } {
  const warnings: string[] = [];
  const steps: PlannedStep[] = [];
  const items: ReviewPlanItem[] = [];
  const slug = slugFromSsid(input.ssid.trim());
  const secName = `mm-hs-open-${slug}`;
  const dpName = `mm-hs-dp-${slug}`;
  const cfgName = `mm-hs-cfg-${slug}`;

  if (probe.stack !== "wifiwave2") {
    return {
      steps: [],
      items: [],
      warnings: ["Built-in Wi-Fi mode requires RouterOS wifiwave2 (/interface/wifi)."],
    };
  }

  if (!input.bands.length) {
    return { steps: [], items: [], warnings: ["Pick at least one band (2.4 GHz and/or 5 GHz)."] };
  }

  const masters = probe.wifiInterfaces.filter((w) => !w.masterInterface);
  const master2 =
    masters.find((m) => m.band === "2.4") ?? masters.find((m) => /wifi1/i.test(m.name));
  const master5 = masters.find((m) => m.band === "5") ?? masters.find((m) => /wifi2/i.test(m.name));

  if (input.bands.includes("2.4") && !master2) {
    return { steps: [], items: [], warnings: ["No 2.4 GHz master radio (wifi1) found."] };
  }
  if (input.bands.includes("5") && !master5) {
    return { steps: [], items: [], warnings: ["No 5 GHz master radio (wifi2) found."] };
  }

  if (probe.capModeActive && !input.disableCapMode) {
    warnings.push(
      "Check “Use local AP mode” below — wifi1/wifi2 are waiting on CAPsMAN in WinBox.",
    );
    return { steps, items, warnings };
  }

  if (probe.capModeActive && input.disableCapMode) {
    steps.push({
      op: "patch",
      path: "/interface/wifi/cap",
      body: { enabled: "no" },
      rollbackBody: { enabled: "yes" },
      label: "Disable CAP client",
    });
    const masterIfaces = probe.wifiInterfaces.filter((w) => !w.masterInterface);
    for (const master of masterIfaces) {
      steps.push({
        op: "patch",
        path: `/interface/wifi/${encodeURIComponent(master.id)}`,
        body: { name: master.name, "configuration.manager": "local" },
        rollbackBody: {
          name: master.name,
          "configuration.manager": master.configurationManager ?? "capsman",
        },
        label: `Local AP on ${master.name}`,
      });
    }
    items.push({
      id: "cap",
      kind: "cap",
      status: "create",
      label: "Local AP mode",
      detail:
        masterIfaces.length > 0
          ? `CAP off · ${masterIfaces.map((m) => m.name).join(", ")} → local`
          : "Disable CAP client on this router",
    });
  }

  steps.push(
    ...(wifiNameExists(probe, secName)
      ? []
      : [
          {
            op: "put" as const,
            path: "/interface/wifi/security",
            body: {
              name: secName,
              // Explicit open network — empty authentication-types (no WPA).
              "authentication-types": "",
              comment: MM_HOTSPOT_SSID_COMMENT,
            },
            label: "Open security profile",
          },
        ]),
    ...(wifiNameExists(probe, dpName)
      ? []
      : [
          {
            op: "put" as const,
            path: "/interface/wifi/datapath",
            body: {
              name: dpName,
              bridge: input.bridge,
              comment: MM_HOTSPOT_SSID_COMMENT,
            },
            label: `Datapath → ${input.bridge}`,
          },
        ]),
    ...(wifiNameExists(probe, cfgName)
      ? []
      : [
          {
            op: "put" as const,
            path: "/interface/wifi/configuration",
            body: {
              name: cfgName,
              ssid: input.ssid.trim(),
              mode: "ap",
              security: secName,
              datapath: dpName,
              comment: MM_HOTSPOT_SSID_COMMENT,
            },
            label: `SSID ${input.ssid.trim()}`,
          },
        ]),
  );

  const bandLabels: string[] = [];
  const vap2g = `mm-hs-2g-${slug}`;
  if (input.bands.includes("2.4") && master2 && !wifiNameExists(probe, vap2g)) {
    steps.push({
      op: "put",
      path: "/interface/wifi",
      body: {
        name: vap2g,
        "master-interface": master2.name,
        configuration: cfgName,
        disabled: "no",
        comment: MM_HOTSPOT_SSID_COMMENT,
      },
      label: `Virtual AP ${master2.name} (2.4 GHz)`,
    });
    bandLabels.push("2.4 GHz");
  }
  const vap5g = `mm-hs-5g-${slug}`;
  if (input.bands.includes("5") && master5 && !wifiNameExists(probe, vap5g)) {
    steps.push({
      op: "put",
      path: "/interface/wifi",
      body: {
        name: vap5g,
        "master-interface": master5.name,
        configuration: cfgName,
        disabled: "no",
        comment: MM_HOTSPOT_SSID_COMMENT,
      },
      label: `Virtual AP ${master5.name} (5 GHz)`,
    });
    bandLabels.push("5 GHz");
  }

  items.push({
    id: "wifi",
    kind: "wifi",
    status:
      wifiNameExists(probe, secName) &&
      wifiNameExists(probe, dpName) &&
      wifiNameExists(probe, cfgName) &&
      (!input.bands.includes("2.4") || !master2 || wifiNameExists(probe, vap2g)) &&
      (!input.bands.includes("5") || !master5 || wifiNameExists(probe, vap5g))
        ? "skip"
        : "create",
    label: "Guest Wi-Fi",
    detail: `"${input.ssid.trim()}" · ${bandLabels.join(" + ") || "already on router"}`,
  });

  return { steps, items, warnings };
}

function planLanPortSteps(
  input: HotspotSetupInput,
  lanPortsOnBridge: Set<string>,
): { steps: PlannedStep[]; items: ReviewPlanItem[]; warnings: string[] } {
  const warnings: string[] = [];
  const steps: PlannedStep[] = [];
  const items: ReviewPlanItem[] = [];
  const ports = normalizeLanPorts(input);

  if (!ports.length) {
    return { steps, items, warnings: ["Pick at least one LAN port for your AP or switch."] };
  }

  for (const port of ports) {
    if (!lanPortsOnBridge.has(port)) {
      steps.push({
        op: "put",
        path: "/interface/bridge/port",
        body: {
          bridge: input.bridge,
          interface: port,
        },
        label: `Add ${port} → ${input.bridge}`,
      });
      items.push({
        id: `port-${port}`,
        kind: "port",
        status: "create",
        label: "Bridge port",
        detail: `${port} → ${input.bridge}`,
      });
    } else {
      items.push({
        id: `port-${port}`,
        kind: "port",
        status: "skip",
        label: "Bridge port",
        detail: `${port} already on ${input.bridge}`,
      });
    }
  }

  const apHint =
    ports.length > 1
      ? `Set "${input.ssid.trim()}" on every external AP (bridge mode, no DHCP)`
      : `Set "${input.ssid.trim()}" on your external AP (bridge mode)`;

  items.push({
    id: "ap-ssid",
    kind: "wifi",
    status: "info",
    label: ports.length > 1 ? "Access point SSIDs" : "Access point SSID",
    detail: apHint,
  });

  return { steps, items, warnings };
}

/** Build full setup plan + visual review items. */
export function planHotspotSetup(
  probe: WifiHotspotProbe,
  input: HotspotSetupInput,
  opts?: { lanPortsOnBridge?: Set<string> },
): HotspotSetupPreview {
  const lanPorts = normalizeLanPorts(input);
  const setupInput: HotspotSetupInput = { ...input, lanPorts };
  const warnings: string[] = [];
  const steps: PlannedStep[] = [];
  const items: ReviewPlanItem[] = [];

  if (input.mode === "lan-port" && lanPorts.length === 0) {
    return {
      mode: input.mode,
      ssid: input.ssid.trim(),
      bridge: input.bridge,
      lanPorts,
      gatewayIp: probe.foundation.gatewayIp,
      poolRange: probe.foundation.poolRange,
      bands: input.bands,
      items: [],
      warnings: ["Pick at least one LAN port physically connected to your guest AP or switch."],
      canApply: false,
      blockReason: "Select at least one external-AP LAN port.",
      steps: [],
    };
  }

  if (input.mode === "lan-port" && input.externalApConfirmed !== true) {
    return {
      mode: input.mode,
      ssid: input.ssid.trim(),
      bridge: input.bridge,
      lanPorts,
      gatewayIp: probe.foundation.gatewayIp,
      poolRange: probe.foundation.poolRange,
      bands: input.bands,
      items: [],
      warnings: [
        "Confirm the selected port physically leads to the external guest AP or switch before applying.",
      ],
      canApply: false,
      blockReason: "Confirm the external AP connection and matching SSID.",
      steps: [],
    };
  }

  if (!input.ssid.trim()) {
    return {
      mode: input.mode,
      ssid: input.ssid,
      bridge: input.bridge,
      lanPorts,
      gatewayIp: probe.foundation.gatewayIp,
      poolRange: probe.foundation.poolRange,
      bands: input.bands,
      items: [],
      warnings: ["Enter a guest SSID name."],
      canApply: false,
      blockReason: "Enter a guest SSID name.",
      steps: [],
    };
  }

  const selectedFoundation =
    probe.bridgeFoundations[input.bridge] ??
    (input.bridge === probe.suggestedBridge ? probe.foundation : undefined);
  const gatewayIp = selectedFoundation?.gatewayIp ?? null;
  if (!gatewayIp) {
    return {
      mode: input.mode,
      ssid: input.ssid.trim(),
      bridge: input.bridge,
      lanPorts,
      gatewayIp: null,
      poolRange: null,
      bands: input.bands,
      items: [],
      warnings: [
        `Bridge ${input.bridge} needs an IP address (e.g. 192.168.88.1/24) before hotspot setup.`,
      ],
      canApply: false,
      blockReason: `Add an IP address to ${input.bridge} first.`,
      steps: [],
    };
  }

  const expectedPoolRange = selectedFoundation.poolRange ?? derivePoolRange(gatewayIp);
  if (
    probe.hasHotspotPool &&
    probe.hotspotPoolRange &&
    probe.hotspotPoolRange !== expectedPoolRange
  ) {
    return {
      mode: input.mode,
      ssid: input.ssid.trim(),
      bridge: input.bridge,
      lanPorts,
      gatewayIp,
      poolRange: expectedPoolRange,
      bands: input.bands,
      items: [],
      warnings: [
        `The existing ${MM_HOTSPOT_POOL_NAME} range (${probe.hotspotPoolRange}) does not match ${input.bridge} (${expectedPoolRange}). Choose a different bridge or repair the pool before continuing.`,
      ],
      canApply: false,
      blockReason: "Hotspot pool network does not match the selected bridge.",
      steps: [],
    };
  }

  if (input.mode === "builtin-wifi" && !probe.canSetupBuiltin) {
    return {
      mode: input.mode,
      ssid: input.ssid.trim(),
      bridge: input.bridge,
      lanPorts,
      gatewayIp,
      poolRange: probe.foundation.poolRange,
      bands: input.bands,
      items: [],
      warnings: [probe.setupBlockedReason ?? "Built-in Wi-Fi is not available on this router."],
      canApply: false,
      blockReason: probe.setupBlockedReason,
      steps: [],
    };
  }

  if (input.mode === "lan-port" && !probe.canSetupLanPort) {
    return {
      mode: input.mode,
      ssid: input.ssid.trim(),
      bridge: input.bridge,
      lanPorts,
      gatewayIp,
      poolRange: probe.foundation.poolRange,
      bands: input.bands,
      items: [],
      warnings: ["LAN port mode needs at least one bridge and one ethernet port."],
      canApply: false,
      blockReason: "No LAN bridge or ethernet port found.",
      steps: [],
    };
  }

  // Builtin Wi-Fi: detect hard blocks (CAP / missing radio / wrong stack) before
  // foundation so we never apply pool/portal while radios cannot be configured.
  // Idempotent wifi skips (objects already exist) must NOT block foundation.

  if (input.mode === "builtin-wifi") {
    const wifi = planBuiltinWifiSteps(probe, input);
    const wifiHardBlocked =
      wifi.warnings.length > 0 &&
      wifi.steps.length === 0 &&
      !wifi.items.some((i) => i.status === "skip" || i.status === "create");
    if (wifiHardBlocked) {
      return {
        mode: input.mode,
        ssid: input.ssid.trim(),
        bridge: input.bridge,
        lanPorts,
        gatewayIp,
        poolRange:
          (probe.bridgeFoundations[input.bridge] ?? probe.foundation).poolRange ??
          derivePoolRange(gatewayIp),
        bands: input.bands,
        items: wifi.items,
        warnings: wifi.warnings,
        canApply: false,
        blockReason: wifi.warnings[0] ?? "Guest Wi-Fi cannot be created.",
        steps: [],
      };
    }

    const foundation = planFoundationSteps(probe, input.bridge, gatewayIp);
    steps.push(...foundation.steps);
    items.push(...foundation.items);

    const dhcp = planDhcpSteps(probe, input.bridge, gatewayIp);
    steps.push(...dhcp.steps);
    items.push(...dhcp.items);

    warnings.push(...wifi.warnings);
    steps.push(...wifi.steps);
    items.push(...wifi.items);
  } else {
    const foundation = planFoundationSteps(probe, input.bridge, gatewayIp);
    steps.push(...foundation.steps);
    items.push(...foundation.items);

    const dhcp = planDhcpSteps(probe, input.bridge, gatewayIp);
    steps.push(...dhcp.steps);
    items.push(...dhcp.items);

    const lan = planLanPortSteps(setupInput, opts?.lanPortsOnBridge ?? new Set());
    warnings.push(...lan.warnings);
    steps.push(...lan.steps);
    items.push(...lan.items);
  }

  const canApply = steps.length > 0;

  return {
    mode: input.mode,
    ssid: input.ssid.trim(),
    bridge: input.bridge,
    lanPorts,
    gatewayIp,
    poolRange:
      (probe.bridgeFoundations[input.bridge] ?? probe.foundation).poolRange ??
      derivePoolRange(gatewayIp),
    bands: input.bands,
    items,
    warnings,
    canApply,
    blockReason: canApply
      ? null
      : (warnings[0] ?? "Already configured — nothing new to apply. Use Vouchers / Portal next."),
    steps,
  };
}

export async function probeWifiHotspot(c: RouterConn): Promise<WifiHotspotProbe> {
  const emptyProbe = (reason: string, reachError?: string): WifiHotspotProbe => ({
    reachable: false,
    reachError: reachError ?? reason,
    stack: "none",
    wifiInterfaces: [],
    hotspotServers: [],
    bridges: [],
    etherPorts: [],
    suggestedBridge: null,
    capModeActive: false,
    defaultMode: "lan-port",
    canSetupBuiltin: false,
    canSetupLanPort: false,
    setupBlockedReason: reason,
    hasHotspotPool: false,
    hasHotspotProfile: false,
    hasMagicDhcpServer: false,
    dhcpNetworkCidrs: [],
    hotspotProfile: null,
    voucherLoginMode: "unknown",
    existingWifiNames: [],
    checklist: { pool: false, profile: false, server: false, ssid: false },
    foundation: { gatewayIp: null, poolRange: null, hasDhcpOnBridge: false },
    bridgeFoundations: {},
  });

  try {
    await routerAPI.ping(c);
  } catch (e) {
    return emptyProbe("Router unreachable", e instanceof Error ? e.message : String(e));
  }

  const wanMembers = await wanInterfaceNames(c);
  const [
    wifiRows,
    wirelessRows,
    hotspotRows,
    capRows,
    wifiSecurityRows,
    wifiDatapathRows,
    wifiConfigRows,
    pools,
    hsProfiles,
    addresses,
    dhcpServers,
    dhcpNetworks,
    bridgePorts,
  ] = await Promise.all([
    listRows(c, "/interface/wifi"),
    listRows(c, "/interface/wireless"),
    listRows(c, "/ip/hotspot"),
    listRows(c, "/interface/wifi/cap"),
    listRows(c, "/interface/wifi/security"),
    listRows(c, "/interface/wifi/datapath"),
    listRows(c, "/interface/wifi/configuration"),
    listRows(c, "/ip/pool"),
    listRows(c, "/ip/hotspot/profile"),
    listRows(c, "/ip/address"),
    listRows(c, "/ip/dhcp-server"),
    listRows(c, "/ip/dhcp-server/network"),
    listRows(c, "/interface/bridge/port"),
  ]);

  const stack: WifiStack =
    wifiRows.length > 0 ? "wifiwave2" : wirelessRows.length > 0 ? "legacy-wireless" : "none";

  const cfgMap = new Map<string, string>();
  for (const r of wifiConfigRows) {
    if (r.name && r.ssid) cfgMap.set(r.name, r.ssid);
  }
  const existingWifiNames = [
    ...wifiSecurityRows.map((r) => r.name),
    ...wifiDatapathRows.map((r) => r.name),
    ...wifiConfigRows.map((r) => r.name),
    ...wifiRows.map((r) => r.name),
  ].filter((n): n is string => Boolean(n));
  const wifiInterfaces =
    stack === "wifiwave2"
      ? wifiRows.map((r) => mapWifiRow(r, cfgMap))
      : wirelessRows.map(mapLegacyWireless);

  const hotspotServers: HotspotServerRow[] = hotspotRows.map((r) => ({
    id: r[".id"] ?? r.name ?? "",
    name: r.name ?? "",
    interface: r.interface ?? "",
    profile: r.profile ?? null,
    addressPool: r["address-pool"] ?? null,
    disabled: r.disabled === "true",
    managedByMagic: (r.comment ?? "") === MM_HOTSPOT_SERVER_COMMENT,
  }));

  const bridges = await bridgeOptions(c, wanMembers);
  const etherPorts = await etherPortOptions(c, wanMembers);
  const suggestedBridge = pickSuggestedBridge(bridges, hotspotServers);

  const bridgeFoundations: WifiHotspotProbe["bridgeFoundations"] = {};
  for (const b of bridges) {
    bridgeFoundations[b.name] = foundationForBridge(addresses, dhcpServers, b.name);
  }
  const foundation = suggestedBridge
    ? (bridgeFoundations[suggestedBridge] ?? {
        gatewayIp: null,
        poolRange: null,
        hasDhcpOnBridge: false,
      })
    : { gatewayIp: null, poolRange: null, hasDhcpOnBridge: false };
  const { gatewayIp, poolRange, hasDhcpOnBridge } = foundation;

  const capClientEnabled = capRows.some((r) => r.enabled === "true" || r.enabled === "yes");
  const radiosWaitingOnCapsman = wifiRows
    .filter((r) => !r["master-interface"])
    .some((r) => isCapsmanWifiManager(r["configuration.manager"] ?? r.manager));
  const capModeActive = capClientEnabled || radiosWaitingOnCapsman;
  const hasMasters = wifiInterfaces.some((w) => !w.masterInterface);
  const magicSsids = wifiInterfaces.filter((w) => w.managedByMagic);
  const hasGuestSsid = magicSsids.length > 0;

  const hasHotspotPool = pools.some((p) => p.name === MM_HOTSPOT_POOL_NAME);
  const magicDhcpServerBridges = dhcpServers
    .filter((d) => d.name === MM_HOTSPOT_DHCP_SERVER_NAME && d.disabled !== "true")
    .map((d) => d.interface)
    .filter((name): name is string => Boolean(name));
  const hasMagicDhcpServer = magicDhcpServerBridges.length > 0;
  const hotspotPoolRange = pools.find((p) => p.name === MM_HOTSPOT_POOL_NAME)?.ranges ?? null;
  const dhcpNetworkCidrs = dhcpNetworks
    .map((n) => n.address ?? "")
    .filter((a): a is string => Boolean(a));
  const magicProfileRow = hsProfiles.find((p) => p.name === MM_HOTSPOT_PROFILE_NAME) ?? null;
  const hasHotspotProfile = Boolean(magicProfileRow);
  const hotspotProfile = magicProfileRow
    ? {
        id: magicProfileRow[".id"] ?? magicProfileRow.name ?? "",
        hotspotAddress: magicProfileRow["hotspot-address"] ?? null,
        useRadius: /^(yes|true|on|1)$/i.test(magicProfileRow["use-radius"] ?? "no"),
      }
    : null;
  const voucherLoginMode: VoucherLoginMode = !magicProfileRow
    ? "unknown"
    : /^(yes|true|on|1)$/i.test(magicProfileRow["use-radius"] ?? "no")
      ? "radius"
      : "local";
  // Captive portal is ready when any enabled Magic (or mm-hs-server) server exists,
  // not only when one happens to sit on the suggested bridge.
  const hasServer = hotspotServers.some(
    (s) =>
      !s.disabled &&
      (s.name === MM_HOTSPOT_SERVER_NAME ||
        s.name.startsWith("mm-hs-") ||
        s.managedByMagic ||
        (suggestedBridge ? s.interface === suggestedBridge : true)),
  );

  const canSetupBuiltin = stack === "wifiwave2" && hasMasters;
  const canSetupLanPort = bridges.length > 0 && etherPorts.length > 0 && Boolean(suggestedBridge);
  const defaultMode: HotspotSetupMode = canSetupBuiltin ? "builtin-wifi" : "lan-port";

  let setupBlockedReason: string | null = null;
  if (!canSetupBuiltin && !canSetupLanPort) {
    if (stack === "legacy-wireless") {
      setupBlockedReason =
        "Legacy wireless only — use LAN port mode with an external AP, or upgrade to RouterOS wifiwave2.";
    } else {
      setupBlockedReason = "No Wi-Fi radios or LAN ports found for hotspot setup.";
    }
  }

  return {
    reachable: true,
    reachError: null,
    stack,
    wifiInterfaces,
    hotspotServers,
    bridges,
    etherPorts,
    suggestedBridge,
    capModeActive,
    defaultMode,
    canSetupBuiltin,
    canSetupLanPort,
    setupBlockedReason,
    hasHotspotPool,
    hasHotspotProfile,
    hasMagicDhcpServer,
    magicDhcpServerBridges,
    hotspotPoolRange,
    dhcpNetworkCidrs,
    hotspotProfile,
    voucherLoginMode,
    existingWifiNames,
    checklist: {
      pool: hasHotspotPool,
      profile: hasHotspotProfile,
      server: hasServer,
      ssid: hasGuestSsid,
    },
    foundation: { gatewayIp, poolRange, hasDhcpOnBridge },
    bridgeFoundations,
  };
}

async function bridgeMemberPorts(c: RouterConn, bridge: string): Promise<Set<string>> {
  const rows = await listRows(c, "/interface/bridge/port");
  return new Set(
    rows.filter((r) => r.bridge === bridge && r.interface).map((r) => r.interface as string),
  );
}

export async function previewHotspotSetup(
  c: RouterConn,
  input: HotspotSetupInput,
): Promise<HotspotSetupPreview> {
  const lanPorts = normalizeLanPorts(input);
  const setupInput: HotspotSetupInput = { ...input, lanPorts };
  const probe = await probeWifiHotspot(c);
  if (!probe.reachable) {
    return {
      mode: setupInput.mode,
      ssid: setupInput.ssid,
      bridge: setupInput.bridge,
      lanPorts,
      gatewayIp: null,
      poolRange: null,
      bands: setupInput.bands,
      items: [],
      warnings: [probe.reachError ?? "Router unreachable"],
      canApply: false,
      blockReason: probe.reachError,
      steps: [],
    };
  }
  const wan = await wanInterfaceNames(c);
  if (wan.has(setupInput.bridge)) {
    return {
      mode: setupInput.mode,
      ssid: setupInput.ssid,
      bridge: setupInput.bridge,
      lanPorts,
      gatewayIp: probe.foundation.gatewayIp,
      poolRange: probe.foundation.poolRange,
      bands: setupInput.bands,
      items: [],
      warnings: ["Cannot attach hotspot to a WAN bridge."],
      canApply: false,
      blockReason: "Cannot attach hotspot to a WAN bridge.",
      steps: [],
    };
  }
  if (setupInput.mode === "lan-port") {
    const allowedPorts = new Set(probe.etherPorts.map((port) => port.name));
    const rejectedPorts = lanPorts.filter((port) => !allowedPorts.has(port));
    if (rejectedPorts.length) {
      const names = rejectedPorts.join(", ");
      return {
        mode: setupInput.mode,
        ssid: setupInput.ssid,
        bridge: setupInput.bridge,
        lanPorts,
        gatewayIp: probe.foundation.gatewayIp,
        poolRange: probe.foundation.poolRange,
        bands: setupInput.bands,
        items: [],
        warnings: [`Cannot attach WAN or unavailable port(s): ${names}.`],
        canApply: false,
        blockReason: `Cannot attach WAN or unavailable port(s): ${names}.`,
        steps: [],
      };
    }
  }
  let lanPortsOnBridge = new Set<string>();
  if (setupInput.mode === "lan-port" && lanPorts.length) {
    const members = await bridgeMemberPorts(c, setupInput.bridge);
    lanPortsOnBridge = new Set(lanPorts.filter((p) => members.has(p)));
  }
  return planHotspotSetup(probe, setupInput, { lanPortsOnBridge });
}

async function deleteRowById(c: RouterConn, path: string, id: string): Promise<void> {
  await routerAPI.raw(c, `${path}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function rollbackPlannedStep(c: RouterConn, step: PlannedStep): Promise<boolean> {
  try {
    if (step.op === "patch") {
      if (!step.rollbackBody) return false;
      await patchRow(c, step.path, step.rollbackBody);
      return true;
    }
    if (step.path === "/ip/dhcp-server/network" && step.body.address) {
      const rows = await listRows(c, step.path);
      const row = rows.find((r) => r.address === step.body.address);
      if (!row?.[".id"]) return false;
      await deleteRowById(c, step.path, row[".id"]);
      return true;
    }
    if (step.path === "/interface/bridge/port") {
      const rows = await listRows(c, step.path);
      const row = rows.find(
        (r) => r.bridge === step.body.bridge && r.interface === step.body.interface,
      );
      if (!row?.[".id"]) return false;
      await deleteRowById(c, step.path, row[".id"]);
      return true;
    }
    const name = step.body.name;
    if (!name) return false;
    const rows = await listRows(c, step.path);
    const row = rows.find((r) => r.name === name);
    if (!row?.[".id"]) return false;
    await deleteRowById(c, step.path, row[".id"]);
    return true;
  } catch {
    return false;
  }
}

async function rollbackCreatedSteps(
  c: RouterConn,
  planned: PlannedStep[],
  createdLabels: Set<string>,
): Promise<string[]> {
  const rolledBack: string[] = [];
  for (let i = planned.length - 1; i >= 0; i--) {
    const step = planned[i]!;
    if (!createdLabels.has(step.label)) continue;
    if (await rollbackPlannedStep(c, step)) rolledBack.push(step.label);
  }
  return rolledBack;
}

export type HotspotRemoveResult = {
  ok: boolean;
  removed: string[];
  errors: string[];
};

/** Remove Magic-tagged guest Wi‑Fi objects (VAPs, cfg, datapath, security) for a clean re-apply. */
export async function removeMagicHotspotGuest(c: RouterConn): Promise<HotspotRemoveResult> {
  const removed: string[] = [];
  const errors: string[] = [];

  async function removeFrom(path: string, row: Row) {
    const id = row[".id"];
    const label = row.name ?? id ?? path;
    if (!id) return;
    try {
      await deleteRowById(c, path, id);
      removed.push(String(label));
    } catch (e) {
      errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const wifiRows = await listRows(c, "/interface/wifi");
  const magicVaps = wifiRows.filter((r) => {
    if (!r["master-interface"]) return false;
    return isMagicHotspotWifiRow({
      name: r.name,
      configuration: r.configuration ?? null,
      comment: r.comment ?? null,
    });
  });
  for (const row of magicVaps) await removeFrom("/interface/wifi", row);

  for (const path of [
    "/interface/wifi/configuration",
    "/interface/wifi/datapath",
    "/interface/wifi/security",
  ] as const) {
    const rows = await listRows(c, path);
    for (const row of rows) {
      const name = row.name ?? "";
      const comment = row.comment ?? "";
      if (comment !== MM_HOTSPOT_SSID_COMMENT && !name.startsWith(MM_HOTSPOT_WIFI_NAME_PREFIX)) {
        continue;
      }
      await removeFrom(path, row);
    }
  }

  return { ok: errors.length === 0, removed, errors };
}

export async function applyHotspotSetup(
  c: RouterConn,
  input: HotspotSetupInput,
): Promise<HotspotApplyResult> {
  const preview = await previewHotspotSetup(c, input);
  if (!preview.canApply || !preview.steps.length) {
    throw new Error(preview.blockReason ?? preview.warnings[0] ?? "Nothing to apply.");
  }

  const backupName = `mm-hotspot-${Date.now()}`;
  await routerAPI.execScript(
    c,
    `/system backup save name=${backupName}\n/export file=${backupName}`,
  );

  const steps: HotspotApplyStepResult[] = [];
  const created: string[] = [];
  const skipped: string[] = [];
  const createdLabels = new Set<string>();

  for (const step of preview.steps) {
    const result = await applyPlannedStep(c, step);
    steps.push(result);
    if (result.outcome === "created") {
      created.push(step.label);
      createdLabels.add(step.label);
    } else if (result.outcome === "skipped") {
      skipped.push(step.label);
    } else {
      const rolledBack = await rollbackCreatedSteps(c, preview.steps, createdLabels);
      const errMsg = `${step.label} failed (${result.transport}): ${result.error ?? "unknown error"}`;
      return {
        ok: false,
        steps,
        created,
        skipped,
        warnings: preview.warnings,
        rolledBack,
        error: rolledBack.length
          ? `${errMsg} — rolled back ${rolledBack.length} earlier step(s).`
          : `${errMsg} — some earlier steps may remain on the router.`,
      };
    }
  }

  return { ok: true, steps, created, skipped, warnings: preview.warnings };
}

/** @deprecated Use applyHotspotSetup — kept for compatibility. */
export async function applyHotspotSsidCreate(
  c: RouterConn,
  input: {
    ssid: string;
    bands: Array<"2.4" | "5">;
    bridge: string;
    createHotspotServer: boolean;
    disableCapMode: boolean;
  },
): Promise<HotspotApplyResult> {
  return applyHotspotSetup(c, {
    mode: "builtin-wifi",
    ssid: input.ssid,
    bridge: input.bridge,
    bands: input.bands,
    lanPorts: [],
    disableCapMode: input.disableCapMode,
  });
}
