// Transport-aware router connectivity testing.
//
// A router row can be reached through four very different transports. Testing
// the public host with DNS/TCP/TLS only makes sense for the direct path — for
// connector and cloud routers the public host is usually a LAN address or does
// not exist at all, so dialling it produces slow, misleading "TCP closed"
// errors. This module picks the right branch and returns structured,
// sanitized, method-appropriate failures.

export type RouterInfo = {
  version?: string;
  [k: string]: string | number | boolean | null | undefined;
};

export type TestMethod = "direct" | "connector" | "hub" | "sandbox";

export type TestStepLite = {
  name: string;
  status: "ok" | "fail" | "warn" | "skip";
  detail?: string;
};

export type TransportTestResult = {
  ok: boolean;
  method: TestMethod;
  endpoint: string;
  steps: TestStepLite[];
  remediation: string[];
  /** Stable machine-readable failure code (absent when ok). */
  reason?: TransportFailureReason;
  error?: string;
  info?: RouterInfo;
};

export type TransportFailureReason =
  // connector
  | "connector_unpaired"
  | "connector_disabled"
  | "connector_offline"
  | "connector_stale_heartbeat"
  | "connector_job_timeout"
  | "connector_target_unreachable"
  // cloud
  | "cloud_not_configured"
  | "cloud_peer_missing"
  | "cloud_handshake_stale"
  | "cloud_hub_unavailable"
  | "cloud_proxy_route"
  | "sandbox_unavailable"
  // shared
  | "routeros_unauthorized"
  | "routeros_forbidden"
  | "routeros_not_found"
  | "unknown";

export type RouterTestRow = {
  id: string;
  host: string;
  port: number;
  username: string;
  use_tls: boolean;
  connector_id?: string | null;
  cloud_peer_id?: string | null;
  connection_mode?: string | null;
};

/** Which transport a router row must actually be tested through. */
export function selectTestMethod(row: {
  connector_id?: string | null;
  connection_mode?: string | null;
}): TestMethod {
  if (row.connection_mode === "sandbox") return "sandbox";
  // Hub (and legacy "cloud") before a leftover connector_id — CGNAT hosts
  // must never be tested as a public dial.
  if (row.connection_mode === "hub" || row.connection_mode === "cloud") return "hub";
  if (row.connector_id) return "connector";
  return "direct";
}

/** Never let credentials or bearer material reach a step detail or the audit. */
export function sanitizeReason(message: string, secrets: Array<string | null | undefined> = []) {
  let out = message ?? "";
  for (const s of secrets) {
    if (s && s.length >= 3) out = out.split(s).join("***");
  }
  return out
    .replace(/\/\/[^/\s:@]+:[^/\s@]+@/g, "//***:***@")
    .replace(/\bbearer\s+\S+/gi, "Bearer ***")
    .replace(/(authorization|apikey|api-key|password|token)\s*[:=]\s*\S+/gi, "$1: ***")
    .slice(0, 500);
}

function classifyRouterOs(msg: string): TransportFailureReason | null {
  if (/\b401\b|unauthorized/i.test(msg)) return "routeros_unauthorized";
  if (/\b403\b|forbidden/i.test(msg)) return "routeros_forbidden";
  if (/\b404\b/.test(msg)) return "routeros_not_found";
  return null;
}

export function classifyConnectorFailure(msg: string): TransportFailureReason {
  const ros = classifyRouterOs(msg);
  if (ros) return ros;
  if (/did not answer in time|timed out waiting/i.test(msg)) return "connector_job_timeout";
  if (/offline/i.test(msg)) return "connector_offline";
  if (/could not reach|ECONNREFUSED|EHOSTUNREACH|ETIMEDOUT|unreachable/i.test(msg))
    return "connector_target_unreachable";
  return "unknown";
}

export function classifyCloudFailure(msg: string): TransportFailureReason {
  if (/not configured/i.test(msg)) return "cloud_not_configured";
  // Control-plane / signed Router Manager failures
  if (/Router Manager API 40[24]|no route|peer .*not found/i.test(msg)) return "cloud_proxy_route";
  if (/Router Manager API 5\d\d|did not respond in time|ECONNREFUSED|ENOTFOUND/i.test(msg))
    return "cloud_hub_unavailable";
  // Humanized Hub / REST failures (after error-message.ts) — keep classifying for Fix checklist.
  if (
    /Magic Hub could not reach|Magic Hub is not answering|Could not reach the router through Magic Hub/i.test(
      msg,
    )
  ) {
    return /not answering/i.test(msg) ? "cloud_hub_unavailable" : "cloud_proxy_route";
  }
  // Data-plane: nginx HTML or gateway errors through /peers/.../rest — not "upgrade RouterOS".
  if (
    /nginx/i.test(msg) ||
    /<!doctype html|<html[\s>]/i.test(msg) ||
    /RouterOS API 40[24]/i.test(msg) ||
    /RouterOS API 50[234]/i.test(msg) ||
    /bad gateway|gateway time-?out/i.test(msg)
  ) {
    return "cloud_proxy_route";
  }
  const ros = classifyRouterOs(msg);
  if (ros) return ros;
  // Humanized RouterOS auth (no bare status digit required).
  if (/Router rejected the username or password|Logged in but not allowed to use REST/i.test(msg)) {
    return /not allowed to use REST/i.test(msg) ? "routeros_forbidden" : "routeros_unauthorized";
  }
  if (/Router REST path not found/i.test(msg)) return "routeros_not_found";
  return "unknown";
}

const REMEDIATION: Record<TransportFailureReason, string[]> = {
  connector_unpaired: [
    "This router is bound to a Local Connector that no longer exists. Re-pair the connector or clear the binding on the Routers page.",
  ],
  connector_disabled: [
    "The Local Connector for this router is disabled. Enable it on the Connectors page.",
  ],
  connector_offline: [
    "The Local Connector is not connected. Start the connector service on the site PC and confirm it can reach the internet over HTTPS.",
  ],
  connector_stale_heartbeat: [
    "The Local Connector last checked in too long ago. Restart the connector service and watch for a fresh heartbeat.",
  ],
  connector_job_timeout: [
    "The connector accepted the job but did not answer in time. Check that the connector process is running and not blocked.",
  ],
  connector_target_unreachable: [
    "The connector is online but could not reach the router on the LAN. Verify the router's local address/port and that the REST service is enabled.",
  ],
  cloud_not_configured: [
    "Magic Hub is not configured for this deployment. The app owner must set VPS_ROUTER_* secrets and republish.",
  ],
  cloud_peer_missing: [
    "This router is on Magic Hub but has no WireGuard peer yet. Tap Connect via Hub and paste the script from the paste window.",
  ],
  cloud_handshake_stale: [
    "Confirm the board has WAN internet (default route; WinBox ping 8.8.8.8). Without WAN, WireGuard cannot reach the hub.",
    "Open Show paste window and paste the latest Connect script into WinBox New Terminal — do not use the Scripts library for the key script.",
    "Wait ~30s, then Check now. Good = last-handshake a few seconds ago. Ignore ping timeouts to the hub or 10.77.0.1.",
  ],
  cloud_hub_unavailable: [
    "The Magic Hub control plane did not answer. The app owner should check the VPS service, TLS cert, and VPS_ROUTER_* secrets.",
  ],
  cloud_proxy_route: [
    "WireGuard may be fine, but the hub REST proxy failed — this is not a RouterOS version problem (7.1+ is already enough).",
    "Confirm Routers → Edit password matches WinBox, and the user group includes rest-api.",
    "Re-paste the latest Connect script from Show paste window (it enables www-ssl + magic-https), then Check now → Test.",
    "If Test still returns nginx 404/502 after a fresh handshake, the hosted hub /peers/.../rest data-plane needs an ops fix — contact the app owner.",
  ],
  sandbox_unavailable: [
    "The in-app sandbox lab has been removed. Add a physical MikroTik on Routers (Magic Hub, Local Connector, or public IP), or use Test Lab → Real routers.",
  ],
  routeros_unauthorized: [
    "Auth rejected by RouterOS. Verify the API user and password stored for this router.",
    "Ensure the user's group has 'api,rest-api,read,write' policies.",
  ],
  routeros_forbidden: [
    "Authenticated but forbidden. Add the 'rest-api' policy to the user's group.",
  ],
  routeros_not_found: ["/rest not found. RouterOS 7.1+ is required."],
  unknown: [
    "Re-paste the latest Magic Hub Connect script from Show paste window, confirm WAN + last-handshake, then Check now → Test.",
    "Ignore ping to the hub or 10.77.0.1. If handshake is fresh but Test still fails, contact the app owner about the hub REST proxy.",
  ],
};

export function remediationFor(reason: TransportFailureReason): string[] {
  return [...(REMEDIATION[reason] ?? [])];
}

export type ConnectorLike = {
  id: string;
  name?: string | null;
  enabled?: boolean | null;
  status?: string | null;
  last_seen_at?: string | null;
};

export type ConnectorTestDeps = {
  loadConnector: (id: string) => Promise<ConnectorLike | null>;
  ping: () => Promise<RouterInfo>;
  onlineWindowMs?: number;
  now?: () => number;
  secrets?: Array<string | null | undefined>;
};

/** Test a router that is reached through an on-site Local Connector. */
export async function testViaConnector(
  row: RouterTestRow,
  deps: ConnectorTestDeps,
): Promise<TransportTestResult> {
  const steps: TestStepLite[] = [];
  const endpoint = "connector:/rest/system/resource";
  const windowMs = deps.onlineWindowMs ?? 90_000;
  const now = deps.now ?? (() => Date.now());

  const fail = (reason: TransportFailureReason, error: string): TransportTestResult => ({
    ok: false,
    method: "connector",
    endpoint,
    steps,
    remediation: remediationFor(reason),
    reason,
    error: sanitizeReason(error, deps.secrets),
  });

  const connector = await deps.loadConnector(row.connector_id as string);
  if (!connector) {
    steps.push({ name: "Local Connector", status: "fail", detail: "Connector not paired" });
    return fail("connector_unpaired", "Connector not paired");
  }
  if (!connector.enabled) {
    steps.push({
      name: `Local Connector (${connector.name ?? "unnamed"})`,
      status: "fail",
      detail: "Disabled",
    });
    return fail("connector_disabled", "Connector is disabled");
  }
  const lastSeen = connector.last_seen_at ? new Date(connector.last_seen_at).getTime() : null;
  if (connector.status !== "online" || lastSeen === null) {
    steps.push({
      name: `Local Connector (${connector.name ?? "unnamed"})`,
      status: "fail",
      detail: `status=${connector.status ?? "unknown"}`,
    });
    return fail("connector_offline", "Connector is offline");
  }
  const age = now() - lastSeen;
  if (age >= windowMs) {
    steps.push({
      name: `Local Connector (${connector.name ?? "unnamed"})`,
      status: "fail",
      detail: `last heartbeat ${Math.round(age / 1000)}s ago`,
    });
    return fail("connector_stale_heartbeat", "Connector heartbeat is stale");
  }
  steps.push({
    name: `Local Connector (${connector.name ?? "unnamed"})`,
    status: "ok",
    detail: `heartbeat ${Math.round(age / 1000)}s ago`,
  });

  try {
    const info = await deps.ping();
    steps.push({
      name: "RouterOS GET /system/resource via connector",
      status: "ok",
      detail: info?.version ? `RouterOS ${info.version}` : "200 OK",
    });
    return { ok: true, method: "connector", endpoint, steps, remediation: [], info };
  } catch (e) {
    const msg = sanitizeReason(e instanceof Error ? e.message : String(e), deps.secrets);
    const reason = classifyConnectorFailure(msg);
    steps.push({
      name: "RouterOS GET /system/resource via connector",
      status: "fail",
      detail: msg,
    });
    return fail(reason, msg);
  }
}

export type CloudTestDeps = {
  isConfigured: () => boolean;
  restBase: (peerId: string) => string;
  peerStatus?: (peerId: string) => Promise<{
    status?: string | null;
    lastHandshakeAt?: string | null;
  }>;
  ping: (restBase: string) => Promise<RouterInfo>;
  secrets?: Array<string | null | undefined>;
};

/** Test a router that is reached through the cloud WireGuard hub. */
export async function testViaCloud(
  row: RouterTestRow,
  deps: CloudTestDeps,
): Promise<TransportTestResult> {
  const steps: TestStepLite[] = [];
  const peerId = row.cloud_peer_id ?? null;
  const endpoint = peerId && deps.isConfigured() ? `${deps.restBase(peerId)}/system/resource` : "";

  const fail = (reason: TransportFailureReason, error: string): TransportTestResult => ({
    ok: false,
    method: "hub",
    endpoint,
    steps,
    remediation: remediationFor(reason),
    reason,
    error: sanitizeReason(error, deps.secrets),
  });

  if (!deps.isConfigured()) {
    steps.push({ name: "Cloud hub", status: "fail", detail: "Not configured" });
    return fail("cloud_not_configured", "Magic Hub is not configured");
  }
  if (!peerId) {
    steps.push({ name: "Cloud peer", status: "fail", detail: "No peer provisioned" });
    return fail("cloud_peer_missing", "This router has no cloud peer");
  }
  steps.push({ name: "Cloud peer", status: "ok", detail: peerId });

  if (deps.peerStatus) {
    try {
      const st = await deps.peerStatus(peerId);
      const hs = st.lastHandshakeAt ? new Date(st.lastHandshakeAt).getTime() : null;
      const stale = hs !== null && Date.now() - hs > 5 * 60_000;
      // "connecting" with no handshake must fail here — otherwise Test green-checks
      // handshake and blames the REST proxy (502) when the tunnel never came up.
      const notReady =
        hs === null ||
        stale ||
        st.status === "offline" ||
        st.status === "connecting" ||
        st.status === "error";
      if (notReady) {
        steps.push({
          name: "WireGuard handshake",
          status: "fail",
          detail:
            hs === null
              ? "no handshake yet"
              : stale
                ? `last handshake ${st.lastHandshakeAt}`
                : `status=${st.status ?? "unknown"}`,
        });
        return fail(
          "cloud_handshake_stale",
          hs === null ? "WireGuard handshake not established yet" : "WireGuard handshake is stale",
        );
      }
      steps.push({
        name: "WireGuard handshake",
        status: "ok",
        detail: st.lastHandshakeAt ? `last handshake ${st.lastHandshakeAt}` : "online",
      });
    } catch (e) {
      const msg = sanitizeReason(e instanceof Error ? e.message : String(e), deps.secrets);
      steps.push({ name: "Cloud hub", status: "fail", detail: msg });
      return fail(classifyCloudFailure(msg), msg);
    }
  }

  try {
    const info = await deps.ping(deps.restBase(peerId));
    steps.push({
      name: "RouterOS GET /system/resource via cloud hub",
      status: "ok",
      detail: info?.version ? `RouterOS ${info.version}` : "200 OK",
    });
    return { ok: true, method: "hub", endpoint, steps, remediation: [], info };
  } catch (e) {
    const msg = sanitizeReason(e instanceof Error ? e.message : String(e), deps.secrets);
    const reason = classifyCloudFailure(msg);
    steps.push({
      name: "RouterOS GET /system/resource via cloud hub",
      status: "fail",
      detail: msg,
    });
    return fail(reason, msg);
  }
}

export type SandboxTestDeps = {
  secrets?: Array<string | null | undefined>;
};

/** Leftover virtual-lab rows never dial a host — they fail closed. */
export async function testViaSandbox(
  _row: RouterTestRow,
  deps: SandboxTestDeps = {},
): Promise<TransportTestResult> {
  const { SANDBOX_REMOVED_MESSAGE } = await import("./test-router");
  const steps: TestStepLite[] = [
    {
      name: "Sandbox lab",
      status: "fail",
      detail: SANDBOX_REMOVED_MESSAGE,
    },
  ];
  return {
    ok: false,
    method: "sandbox",
    endpoint: "sandbox:/rest/system/resource",
    steps,
    remediation: remediationFor("sandbox_unavailable"),
    reason: "sandbox_unavailable",
    error: sanitizeReason(SANDBOX_REMOVED_MESSAGE, deps.secrets),
  };
}
