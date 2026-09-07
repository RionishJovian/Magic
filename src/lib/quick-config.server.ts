/**
 * Quick Config — per-feature RouterOS REST read/apply/remove logic.
 *
 * Each feature is self-contained: a TAG comment written to every managed
 * resource so the feature can be cleanly removed when the toggle is turned off.
 * None of these features touch the magic-cloud interface, the www-ssl service,
 * the mikrotik-magic-rest firewall rule, or any other resource owned by the
 * Quick Setup wizard or the Magic Hub provisioner.
 */

import type { RouterConn } from "./mikrotik.server";

export type QuickConfigFeature =
  | "clientIsolation"
  | "wanInputGuard"
  | "loginFloodGuard"
  | "fairShareQos"
  | "autoBackup"
  | "trialGuestAccess"
  | "ntpSync";

export type FeatureStatus = {
  enabled: boolean;
  error: string | null;
  warning?: string | null;
};

export type QuickConfigState = Record<QuickConfigFeature, FeatureStatus>;

export type QuickConfigSnapshot = {
  reachable: boolean;
  reachError: string | null;
  features: QuickConfigState;
};

export type FairShareQosInput = {
  guestCidr: string;
  /** Actual WAN download capacity in Mbps. */
  downloadMbps: number;
  /** Actual WAN upload capacity in Mbps. */
  uploadMbps: number;
};

// ─── Tags ────────────────────────────────────────────────────────────────────
const TAG = {
  clientIsolation: "mm-client-isolation",
  wanInputGuard: "mm-wan-guard",
  loginFloodGuard: "mm-login-flood",
  fairShareQos: "mm-fair-qos",
  autoBackup: "mm-auto-backup",
  trialGuestAccess: "mm-trial",
  ntpSync: "mm-ntp-sync",
} as const satisfies Record<QuickConfigFeature, string>;

const FEATURE_LABEL: Record<QuickConfigFeature, string> = {
  clientIsolation: "Client Isolation",
  wanInputGuard: "WAN Input Guard",
  loginFloodGuard: "Login Flood Guard",
  fairShareQos: "Fair Share QoS",
  autoBackup: "Auto Daily Backup",
  trialGuestAccess: "Trial Guest Access",
  ntpSync: "NTP Time Sync",
};

const LOGIN_FLOOD_LIST = "mm-login-flood";
const LOGIN_FLOOD_SCRIPT_NAME = "mm-login-flood";
const LOGIN_FLOOD_JOB_NAME = "mm-login-flood";
const LOGIN_FLOOD_EXPIRE_JOB = "mm-login-flood-expire";

/** Maps flood-listed IPs to a blocked hotspot MAC, then kicks that host. */
const LOGIN_FLOOD_MAC_SCRIPT = [
  `:foreach e in=[/ip firewall address-list find where list="${LOGIN_FLOOD_LIST}"] do={`,
  `:local ip [/ip firewall address-list get $e address]`,
  `:local mac ""`,
  `:foreach h in=[/ip hotspot host find where address=$ip] do={`,
  `:set mac [/ip hotspot host get $h mac-address]`,
  `}`,
  `:if ($mac = "") do={`,
  `:foreach l in=[/ip dhcp-server lease find where address=$ip] do={`,
  `:set mac [/ip dhcp-server lease get $l mac-address]`,
  `}`,
  `}`,
  `:if ([:len $mac] = 17) do={`,
  `:if ([:len [/ip hotspot ip-binding find where mac-address=$mac]] = 0) do={`,
  `/ip hotspot ip-binding add mac-address=$mac type=blocked comment=${TAG.loginFloodGuard}`,
  `:log warning ("mm-login-flood blocked " . $mac)`,
  `}`,
  `:do { /ip hotspot host remove [find where mac-address=$mac] } on-error={}`,
  `:do { /ip hotspot active remove [find where mac-address=$mac] } on-error={}`,
  `}`,
  `}`,
].join("\r\n");

const INTERFACE_LIST_HINT =
  'Add WAN/LAN interface lists first (Scripts → "Magic Hub — 1) Starlink board prep" or Master config).';

type Ros = Awaited<ReturnType<typeof api>>;

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function api() {
  const { routerAPI } = await import("./mikrotik.server");
  return routerAPI;
}

function tagged(tag: string) {
  return (r: Record<string, string>) => (r["comment"] ?? "").startsWith(tag);
}

function parseRouterOsVersion(raw: string): { major: number; minor: number } {
  const m = /(\d+)\.(\d+)/.exec(raw ?? "");
  return { major: m ? Number(m[1]) : 0, minor: m ? Number(m[2]) : 0 };
}

async function requireRouterOs71(
  ros: Ros,
  c: RouterConn,
  feature: QuickConfigFeature,
): Promise<void> {
  const res = await ros.ping(c);
  const v = parseRouterOsVersion(String(res.version ?? ""));
  if (v.major < 7 || (v.major === 7 && v.minor < 1)) {
    throw featureError(
      feature,
      "This feature requires RouterOS 7.1 or newer. Upgrade the router or use vouchers only.",
    );
  }
}

async function restoreOnFailure(
  wasEnabled: boolean,
  wantedEnabled: boolean,
  restore: () => Promise<void>,
): Promise<void> {
  if (!wasEnabled || !wantedEnabled) return;
  try {
    await restore();
  } catch {
    // Best-effort — original error is rethrown by caller.
  }
}

function featureError(feature: QuickConfigFeature, message: string): Error {
  return new Error(`${FEATURE_LABEL[feature]}: ${message}`);
}

function emptyFeatures(error: string | null): QuickConfigState {
  const status: FeatureStatus = { enabled: false, error };
  return {
    clientIsolation: status,
    wanInputGuard: status,
    loginFloodGuard: status,
    fairShareQos: status,
    autoBackup: status,
    trialGuestAccess: status,
    ntpSync: status,
  };
}

async function pingRouter(c: RouterConn): Promise<void> {
  await (await api()).ping(c);
}

async function listRows(
  ros: Ros,
  c: RouterConn,
  endpoint: string,
): Promise<Record<string, string>[]> {
  return (await ros.raw<Array<Record<string, string>>>(c, endpoint)) ?? [];
}

/** PUT-first REST create; several boards reject bare POST with "no such command". */
async function addResource(
  ros: Ros,
  c: RouterConn,
  path: string,
  body: Record<string, string>,
): Promise<void> {
  try {
    await ros.raw(c, path, { method: "PUT", body: JSON.stringify(body) });
    return;
  } catch (first) {
    const msg = first instanceof Error ? first.message : String(first);
    if (!/400|406|no such command/i.test(msg)) throw first;
    await ros.raw(c, path, { method: "POST", body: JSON.stringify(body) });
  }
}

async function trySteps(steps: Array<() => Promise<unknown>>): Promise<void> {
  let last: unknown;
  for (const step of steps) {
    try {
      await step();
      return;
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

async function removeByTag(ros: Ros, c: RouterConn, endpoint: string, tag: string): Promise<void> {
  const listed =
    endpoint === "/ip/firewall/filter"
      ? ((await ros.listFirewallFilter(c)) ?? [])
      : await listRows(ros, c, endpoint);
  for (const r of listed.slice()) {
    if ((r["comment"] ?? "").startsWith(tag) && r[".id"]) {
      await ros.raw(c, `${endpoint}/${encodeURIComponent(r[".id"]!)}`, { method: "DELETE" });
    }
  }
}

async function requireInterfaceList(
  ros: Ros,
  c: RouterConn,
  name: "LAN" | "WAN",
  feature: QuickConfigFeature,
): Promise<void> {
  const lists = await listRows(ros, c, "/interface/list");
  if (!lists.some((row) => (row.name ?? "") === name)) {
    throw featureError(
      feature,
      `This router has no "${name}" interface list. ${INTERFACE_LIST_HINT}`,
    );
  }
}

async function assertTaggedRule(
  ros: Ros,
  c: RouterConn,
  tag: string,
  feature: QuickConfigFeature,
): Promise<void> {
  const rules = await ros.listFirewallFilter(c);
  if (!(rules ?? []).some(tagged(tag))) {
    throw featureError(
      feature,
      "The router rejected the firewall rule. Check interface lists and try again.",
    );
  }
}

function loginByHasTrial(loginBy: string | undefined): boolean {
  return (loginBy ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes("trial");
}

// ─── Client Isolation ────────────────────────────────────────────────────────
async function readClientIsolation(ros: Ros, c: RouterConn): Promise<FeatureStatus> {
  try {
    const rules = await ros.listFirewallFilter(c);
    const rule = (rules ?? []).find(tagged(TAG.clientIsolation));
    const correct =
      rule?.chain === "forward" &&
      rule.action === "drop" &&
      rule["in-interface-list"] === "LAN" &&
      rule["out-interface-list"] === "LAN";
    return correct
      ? {
          enabled: true,
          error: null,
          warning: "Rule shape is verified; confirm it remains above broad forward accept rules.",
        }
      : {
          enabled: false,
          error: rule
            ? "Client Isolation rule is incomplete or has been changed outside MikroTik Magic."
            : null,
        };
  } catch (e) {
    return { enabled: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function applyClientIsolation(ros: Ros, c: RouterConn, enabled: boolean) {
  await removeByTag(ros, c, "/ip/firewall/filter", TAG.clientIsolation);
  if (!enabled) return;
  await requireInterfaceList(ros, c, "LAN", "clientIsolation");
  await ros.addFirewallFilter(c, {
    chain: "forward",
    "in-interface-list": "LAN",
    "out-interface-list": "LAN",
    action: "drop",
    comment: TAG.clientIsolation,
  });
  await assertTaggedRule(ros, c, TAG.clientIsolation, "clientIsolation");
}

// ─── WAN Input Guard ──────────────────────────────────────────────────────────
async function readWanInputGuard(ros: Ros, c: RouterConn): Promise<FeatureStatus> {
  try {
    const rules = await ros.listFirewallFilter(c);
    const rule = (rules ?? []).find(tagged(TAG.wanInputGuard));
    const correct =
      rule?.chain === "input" && rule.action === "drop" && rule["in-interface-list"] === "WAN";
    return correct
      ? {
          enabled: true,
          error: null,
          warning: "Rule shape is verified; confirm it remains above broad input accept rules.",
        }
      : {
          enabled: false,
          error: rule
            ? "WAN Input Guard rule is incomplete or has been changed outside MikroTik Magic."
            : null,
        };
  } catch (e) {
    return { enabled: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function applyWanInputGuard(ros: Ros, c: RouterConn, enabled: boolean) {
  await removeByTag(ros, c, "/ip/firewall/filter", TAG.wanInputGuard);
  if (!enabled) return;
  await requireInterfaceList(ros, c, "WAN", "wanInputGuard");
  await ros.addFirewallFilter(c, {
    chain: "input",
    "in-interface-list": "WAN",
    action: "drop",
    comment: TAG.wanInputGuard,
  });
  await assertTaggedRule(ros, c, TAG.wanInputGuard, "wanInputGuard");
}

// ─── Login Flood Guard ────────────────────────────────────────────────────────
type FilterRule = Record<string, string>;

function loginFloodMatchHotspot(): FilterRule {
  return { hotspot: "http" };
}

function loginFloodMatchLan(): FilterRule {
  return { "in-interface-list": "LAN", protocol: "tcp", "dst-port": "80,443" };
}

function loginFloodFilterRules(match: FilterRule): FilterRule[] {
  return [
    {
      chain: "input",
      action: "drop",
      "src-address-list": LOGIN_FLOOD_LIST,
      comment: TAG.loginFloodGuard,
      ...match,
    },
    {
      chain: "input",
      action: "add-src-to-address-list",
      "address-list": LOGIN_FLOOD_LIST,
      "address-list-timeout": "30m",
      "connection-state": "new",
      "connection-limit": "12,32",
      comment: TAG.loginFloodGuard,
      ...match,
    },
    {
      chain: "input",
      action: "add-src-to-address-list",
      "address-list": LOGIN_FLOOD_LIST,
      "address-list-timeout": "30m",
      "dst-limit": "60,60,src-address/10s",
      comment: TAG.loginFloodGuard,
      ...match,
    },
  ];
}

async function addFilterBeforeFirst(ros: Ros, c: RouterConn, rule: FilterRule, firstId?: string) {
  await ros.addFirewallFilter(c, firstId ? { ...rule, "place-before": firstId } : rule);
}

async function installLoginFloodFilters(
  ros: Ros,
  c: RouterConn,
  match: FilterRule,
): Promise<number> {
  const existing = await ros.listFirewallFilter(c);
  const firstId = existing?.[0]?.[".id"];
  let lastError: unknown;
  for (const rule of loginFloodFilterRules(match)) {
    try {
      await addFilterBeforeFirst(ros, c, rule, firstId);
    } catch (e) {
      lastError = e;
    }
  }
  const after = await ros.listFirewallFilter(c);
  const count = (after ?? []).filter(tagged(TAG.loginFloodGuard)).length;
  if (count === 0 && lastError) throw lastError;
  return count;
}

async function removeLoginFloodBindings(ros: Ros, c: RouterConn): Promise<void> {
  const bindings = await listRows(ros, c, "/ip/hotspot/ip-binding");
  for (const row of bindings.slice()) {
    if ((row["comment"] ?? "").startsWith(TAG.loginFloodGuard) && row[".id"]) {
      await ros
        .raw(c, `/ip/hotspot/ip-binding/${encodeURIComponent(row[".id"]!)}`, {
          method: "DELETE",
        })
        .catch(() => null);
    }
  }
}

async function removeLoginFloodAddressList(ros: Ros, c: RouterConn): Promise<void> {
  const rows = await listRows(ros, c, "/ip/firewall/address-list");
  for (const row of rows.slice()) {
    if ((row.list ?? "") === LOGIN_FLOOD_LIST && row[".id"]) {
      await ros
        .raw(c, `/ip/firewall/address-list/${encodeURIComponent(row[".id"]!)}`, {
          method: "DELETE",
        })
        .catch(() => null);
    }
  }
}

async function readLoginFloodGuard(ros: Ros, c: RouterConn): Promise<FeatureStatus> {
  try {
    const [rules, jobs] = await Promise.all([
      ros.listFirewallFilter(c),
      listRows(ros, c, "/system/scheduler"),
    ]);
    const taggedRules = (rules ?? []).filter(tagged(TAG.loginFloodGuard));
    const scripts = await listRows(ros, c, "/system/script");
    const hasScript = scripts.some(
      (s) => s.name === LOGIN_FLOOD_SCRIPT_NAME && tagged(TAG.loginFloodGuard)(s),
    );
    const hasJobs = [LOGIN_FLOOD_JOB_NAME, LOGIN_FLOOD_EXPIRE_JOB].every((name) =>
      jobs.some((j) => j.name === name && tagged(TAG.loginFloodGuard)(j)),
    );
    const present = taggedRules.length > 0 || hasScript || jobs.some(tagged(TAG.loginFloodGuard));
    if (!present) return { enabled: false, error: null };
    return taggedRules.length >= 3 && hasScript && hasJobs
      ? { enabled: true, error: null }
      : {
          enabled: true,
          error: null,
          warning:
            "Some login flood resources are missing; run the toggle off, then on, to repair it.",
        };
  } catch (e) {
    return { enabled: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function removeLoginFloodGuardAll(ros: Ros, c: RouterConn): Promise<void> {
  await removeByTag(ros, c, "/ip/firewall/filter", TAG.loginFloodGuard);
  await removeByTag(ros, c, "/system/scheduler", TAG.loginFloodGuard);
  await removeByTag(ros, c, "/system/script", TAG.loginFloodGuard);
  await removeLoginFloodAddressList(ros, c);
  await removeLoginFloodBindings(ros, c);
}

async function installLoginFloodGuardEnabled(ros: Ros, c: RouterConn): Promise<void> {
  const hsProfiles = await ros.hotspotProfiles(c);
  if ((hsProfiles ?? []).length === 0) {
    throw featureError(
      "loginFloodGuard",
      "No Hotspot server profile found on this router. Set up Hotspot first.",
    );
  }

  let installed = 0;
  try {
    installed = await installLoginFloodFilters(ros, c, loginFloodMatchHotspot());
  } catch {
    installed = 0;
  }
  if (installed === 0) {
    await requireInterfaceList(ros, c, "LAN", "loginFloodGuard");
    installed = await installLoginFloodFilters(ros, c, loginFloodMatchLan());
  }
  if (installed === 0) {
    throw featureError("loginFloodGuard", "The router rejected the login flood firewall rules.");
  }

  const scriptBody = {
    name: LOGIN_FLOOD_SCRIPT_NAME,
    source: LOGIN_FLOOD_MAC_SCRIPT,
    policy: "read,write,test",
    comment: TAG.loginFloodGuard,
  };
  await trySteps([
    () => addResource(ros, c, "/system/script", scriptBody),
    () =>
      ros.execScript(
        c,
        `/system script add name=${LOGIN_FLOOD_SCRIPT_NAME} policy=read,write,test comment=${TAG.loginFloodGuard} source={${LOGIN_FLOOD_MAC_SCRIPT}}`,
      ),
  ]);

  const watchJob = {
    name: LOGIN_FLOOD_JOB_NAME,
    interval: "30s",
    "on-event": LOGIN_FLOOD_SCRIPT_NAME,
    policy: "read,write,test",
    comment: TAG.loginFloodGuard,
  };
  const expireJob = {
    name: LOGIN_FLOOD_EXPIRE_JOB,
    interval: "30m",
    "on-event": `/ip hotspot ip-binding remove [find where comment=${TAG.loginFloodGuard}]`,
    policy: "read,write,test",
    comment: TAG.loginFloodGuard,
  };
  await trySteps([
    () => addResource(ros, c, "/system/scheduler", watchJob),
    () =>
      ros.execScript(
        c,
        `/system scheduler add name=${LOGIN_FLOOD_JOB_NAME} interval=30s on-event=${LOGIN_FLOOD_SCRIPT_NAME} policy=read,write,test comment=${TAG.loginFloodGuard}`,
      ),
  ]);
  await trySteps([
    () => addResource(ros, c, "/system/scheduler", expireJob),
    () =>
      ros.execScript(
        c,
        `/system scheduler add name=${LOGIN_FLOOD_EXPIRE_JOB} interval=30m on-event="/ip hotspot ip-binding remove [find where comment=${TAG.loginFloodGuard}]" policy=read,write,test comment=${TAG.loginFloodGuard}`,
      ),
  ]);

  const jobs = await listRows(ros, c, "/system/scheduler");
  if (!jobs.some(tagged(TAG.loginFloodGuard))) {
    throw featureError("loginFloodGuard", "The router rejected the login flood scheduler.");
  }
}

async function applyLoginFloodGuard(ros: Ros, c: RouterConn, enabled: boolean) {
  const before = await readLoginFloodGuard(ros, c);
  await removeLoginFloodGuardAll(ros, c);
  if (!enabled) return;

  try {
    await installLoginFloodGuardEnabled(ros, c);
  } catch (e) {
    await restoreOnFailure(before.enabled, enabled, () => installLoginFloodGuardEnabled(ros, c));
    throw e;
  }
}

// ─── Fair Share QoS ───────────────────────────────────────────────────────────
async function readFairShareQos(ros: Ros, c: RouterConn): Promise<FeatureStatus> {
  try {
    const queues = await listRows(ros, c, "/queue/simple");
    const queue = queues.find(tagged(TAG.fairShareQos));
    if (!queue) return { enabled: false, error: null };
    const verified = Boolean(
      queue.target && queue.queue === "mm-pcq-upload/mm-pcq-download" && queue["max-limit"],
    );
    return verified
      ? { enabled: true, error: null }
      : {
          enabled: true,
          error: null,
          warning: "QoS queue exists but its guest network or WAN limits could not be verified.",
        };
  } catch (e) {
    return { enabled: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function removeFairShareQosAll(ros: Ros, c: RouterConn): Promise<void> {
  await removeByTag(ros, c, "/queue/simple", TAG.fairShareQos);
  await removeByTag(ros, c, "/queue/type", TAG.fairShareQos);
}

async function installFairShareQosEnabled(
  ros: Ros,
  c: RouterConn,
  input: FairShareQosInput,
): Promise<void> {
  const existingTypes = await listRows(ros, c, "/queue/type");
  const typeNames = existingTypes.map((t) => t["name"]);
  if (!typeNames.includes("mm-pcq-download")) {
    await trySteps([
      () =>
        addResource(ros, c, "/queue/type", {
          name: "mm-pcq-download",
          kind: "pcq",
          "pcq-classifier": "dst-address",
          "pcq-rate": "0",
          comment: TAG.fairShareQos,
        }),
      () =>
        ros.execScript(
          c,
          "/queue type add name=mm-pcq-download kind=pcq pcq-classifier=dst-address pcq-rate=0 comment=mm-fair-qos",
        ),
    ]);
  }
  if (!typeNames.includes("mm-pcq-upload")) {
    await trySteps([
      () =>
        addResource(ros, c, "/queue/type", {
          name: "mm-pcq-upload",
          kind: "pcq",
          "pcq-classifier": "src-address",
          "pcq-rate": "0",
          comment: TAG.fairShareQos,
        }),
      () =>
        ros.execScript(
          c,
          "/queue type add name=mm-pcq-upload kind=pcq pcq-classifier=src-address pcq-rate=0 comment=mm-fair-qos",
        ),
    ]);
  }

  await trySteps([
    () =>
      addResource(ros, c, "/queue/simple", {
        name: "mm-fair-share",
        target: input.guestCidr,
        queue: "mm-pcq-upload/mm-pcq-download",
        "max-limit": `${input.uploadMbps}M/${input.downloadMbps}M`,
        comment: TAG.fairShareQos,
      }),
    () =>
      ros.execScript(
        c,
        `/queue simple add name=mm-fair-share target=${input.guestCidr} queue=mm-pcq-upload/mm-pcq-download max-limit=${input.uploadMbps}M/${input.downloadMbps}M comment=mm-fair-qos`,
      ),
  ]);

  const queues = await listRows(ros, c, "/queue/simple");
  if (!queues.some(tagged(TAG.fairShareQos))) {
    throw featureError("fairShareQos", "The router rejected the fair-share queue.");
  }
}

async function applyFairShareQos(ros: Ros, c: RouterConn, enabled: boolean) {
  if (enabled)
    throw featureError(
      "fairShareQos",
      "Open Fair Share QoS setup and enter the guest CIDR and measured WAN speeds.",
    );
  await removeFairShareQosAll(ros, c);
}

export async function configureFairShareQos(
  c: RouterConn,
  input: FairShareQosInput,
): Promise<FeatureStatus> {
  await pingRouter(c);
  const ros = await api();
  const before = await readFairShareQos(ros, c);
  await removeFairShareQosAll(ros, c);
  try {
    await installFairShareQosEnabled(ros, c, input);
  } catch (e) {
    await restoreOnFailure(before.enabled, true, () => installFairShareQosEnabled(ros, c, input));
    throw e;
  }
  const result = await readFairShareQos(ros, c);
  assertApplied("fairShareQos", true, result);
  return result;
}

// ─── Auto Backup ──────────────────────────────────────────────────────────────
async function readAutoBackup(ros: Ros, c: RouterConn): Promise<FeatureStatus> {
  try {
    const jobs = await listRows(ros, c, "/system/scheduler");
    return { enabled: jobs.some(tagged(TAG.autoBackup)), error: null };
  } catch (e) {
    return { enabled: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function applyAutoBackup(ros: Ros, c: RouterConn, enabled: boolean) {
  await removeByTag(ros, c, "/system/scheduler", TAG.autoBackup);
  if (!enabled) return;
  const job = {
    name: "mm-daily-backup",
    interval: "1d",
    "start-time": "02:30:00",
    "on-event": "/system backup save name=mm-auto-backup dont-encrypt=yes",
    comment: TAG.autoBackup,
  };
  await trySteps([
    () => addResource(ros, c, "/system/scheduler", job),
    () =>
      ros.execScript(
        c,
        '/system scheduler add name=mm-daily-backup interval=1d start-time=02:30:00 on-event="/system backup save name=mm-auto-backup dont-encrypt=yes" comment=mm-auto-backup',
      ),
  ]);
  const jobs = await listRows(ros, c, "/system/scheduler");
  if (!jobs.some(tagged(TAG.autoBackup))) {
    throw featureError("autoBackup", "The router rejected the backup scheduler.");
  }
}

// ─── Trial Guest Access ───────────────────────────────────────────────────────
async function readTrialGuestAccess(ros: Ros, c: RouterConn): Promise<FeatureStatus> {
  try {
    const [profiles, hsProfiles] = await Promise.all([ros.profiles(c), ros.hotspotProfiles(c)]);
    const hasTrialProfile = (profiles ?? []).some((p) => (p.name ?? "") === "mm-trial");
    const trialEnabledOnServer = (hsProfiles ?? []).some((p) => loginByHasTrial(p["login-by"]));
    return { enabled: hasTrialProfile && trialEnabledOnServer, error: null };
  } catch (e) {
    return { enabled: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function applyTrialGuestAccess(ros: Ros, c: RouterConn, enabled: boolean) {
  const hsProfiles = await ros.hotspotProfiles(c);
  if (!enabled) {
    for (const p of hsProfiles ?? []) {
      const loginBy = (p["login-by"] ?? "")
        .split(",")
        .map((s: string) => s.trim())
        .filter((s: string) => s && s !== "trial")
        .join(",");
      if (p[".id"]) {
        await ros.patchHotspotProfile(c, p[".id"]!, { "login-by": loginBy });
      }
    }
    return;
  }

  if ((hsProfiles ?? []).length === 0) {
    throw featureError(
      "trialGuestAccess",
      "No Hotspot server profile found on this router. Set up Hotspot first.",
    );
  }

  await requireRouterOs71(ros, c, "trialGuestAccess");

  const { ensureHotspotTrialAccess } = await import("./portal/trial.server");
  const ids = (hsProfiles ?? []).map((p) => p[".id"]!).filter(Boolean);
  await ensureHotspotTrialAccess(c, { hotspotProfileIds: ids });

  const after = await readTrialGuestAccess(ros, c);
  if (!after.enabled) {
    throw featureError(
      "trialGuestAccess",
      "Trial login could not be enabled on the Hotspot profile.",
    );
  }
}

// ─── NTP Sync ─────────────────────────────────────────────────────────────────
const NTP_SERVER_LIST = "pool.ntp.org,asia.pool.ntp.org";

async function ntpClientSet(ros: Ros, c: RouterConn, fields: Record<string, string>) {
  await ros.raw(c, "/system/ntp/client/set", {
    method: "POST",
    body: JSON.stringify(fields),
  });
}

function ntpEnabledValue(row: Record<string, string> | undefined): boolean {
  const v = row?.enabled;
  return v === "true" || v === "yes";
}

async function readNtpClientEnabled(ros: Ros, c: RouterConn): Promise<boolean> {
  const data = await ros.raw<Record<string, string> | Array<Record<string, string>>>(
    c,
    "/system/ntp/client",
  );
  const row = Array.isArray(data) ? data[0] : data;
  return ntpEnabledValue(row);
}

/** Try RouterOS NTP configuration steps until one succeeds (boards differ by version). */
async function firstNtpStep(steps: Array<() => Promise<unknown>>): Promise<void> {
  let last: unknown;
  for (const step of steps) {
    try {
      await step();
      return;
    } catch (e) {
      last = e;
    }
  }
  const message = last instanceof Error ? last.message : String(last);
  throw featureError("ntpSync", message || "The router rejected the NTP configuration.");
}

async function tryConfigureNtpServers(ros: Ros, c: RouterConn): Promise<void> {
  try {
    const existing = await listRows(ros, c, "/system/ntp/client/servers");
    const configured = new Set(existing.map((row) => row.address).filter(Boolean));
    for (const address of NTP_SERVER_LIST.split(",")) {
      if (configured.has(address)) continue;
      try {
        await ros.raw(c, "/system/ntp/client/servers", {
          method: "PUT",
          body: JSON.stringify({ address }),
        });
      } catch {
        try {
          await ros.raw(c, "/system/ntp/client/servers/add", {
            method: "POST",
            body: JSON.stringify({ address }),
          });
        } catch {
          await ros.execScript(c, `/system/ntp/client/servers/add address=${address}`);
        }
      }
    }
  } catch {
    // Submenu absent on this board.
  }
}

async function readNtpSync(ros: Ros, c: RouterConn): Promise<FeatureStatus> {
  try {
    const data = await ros.raw<Record<string, string> | Array<Record<string, string>>>(
      c,
      "/system/ntp/client",
    );
    const row = Array.isArray(data) ? data[0] : data;
    const enabled = ntpEnabledValue(row);
    if (!enabled) return { enabled: false, error: null };
    let configured = `${row?.servers ?? ""},${row?.["server-dns-names"] ?? ""}`;
    try {
      configured += `,${(await listRows(ros, c, "/system/ntp/client/servers"))
        .map((server) => server.address ?? "")
        .join(",")}`;
    } catch {
      // Some RouterOS builds expose these settings only on the NTP client row.
    }
    const hasServers =
      configured.includes("pool.ntp.org") && configured.includes("asia.pool.ntp.org");
    return hasServers
      ? { enabled: true, error: null }
      : {
          enabled: true,
          error: null,
          warning:
            "NTP is enabled, but the router did not expose both configured time servers for verification.",
        };
  } catch (e) {
    // Legacy installs used a disabled scheduler marker before we read /system/ntp/client.
    try {
      const jobs = await listRows(ros, c, "/system/scheduler");
      return { enabled: jobs.some(tagged(TAG.ntpSync)), error: null };
    } catch {
      return { enabled: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

async function applyNtpSync(ros: Ros, c: RouterConn, enabled: boolean) {
  await removeByTag(ros, c, "/system/scheduler", TAG.ntpSync);
  if (!enabled) {
    await firstNtpStep([
      () => ntpClientSet(ros, c, { enabled: "no" }),
      () => ros.execScript(c, "/system ntp client set enabled=no"),
    ]);
    return;
  }

  await firstNtpStep([
    () => ntpClientSet(ros, c, { enabled: "yes" }),
    () => ros.execScript(c, "/system ntp client set enabled=yes"),
  ]);

  await tryConfigureNtpServers(ros, c);

  const { resolveRouterTimezone } = await import("./router-clock");
  const tz = resolveRouterTimezone();
  try {
    await ros.raw(c, "/system/clock", {
      method: "PATCH",
      body: JSON.stringify({
        "time-zone-autodetect": "no",
        "time-zone-name": tz,
      }),
    });
  } catch {
    try {
      await ros.execScript(c, `/system clock set time-zone-autodetect=no time-zone-name=${tz}`);
    } catch {
      // Timezone patch is best-effort; NTP still helps TLS.
    }
  }

  if (!(await readNtpClientEnabled(ros, c))) {
    throw featureError("ntpSync", "The router did not enable NTP time sync.");
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function readAllFeatures(ros: Ros, c: RouterConn): Promise<QuickConfigState> {
  const [
    clientIsolation,
    wanInputGuard,
    loginFloodGuard,
    fairShareQos,
    autoBackup,
    trialGuestAccess,
    ntpSync,
  ] = await Promise.all([
    readClientIsolation(ros, c),
    readWanInputGuard(ros, c),
    readLoginFloodGuard(ros, c),
    readFairShareQos(ros, c),
    readAutoBackup(ros, c),
    readTrialGuestAccess(ros, c),
    readNtpSync(ros, c),
  ]);
  return {
    clientIsolation,
    wanInputGuard,
    loginFloodGuard,
    fairShareQos,
    autoBackup,
    trialGuestAccess,
    ntpSync,
  };
}

/** Read current state of all quick-config features from the router. */
export async function readQuickConfig(c: RouterConn): Promise<QuickConfigSnapshot> {
  try {
    await pingRouter(c);
  } catch (e) {
    const reachError = e instanceof Error ? e.message : String(e);
    return { reachable: false, reachError, features: emptyFeatures(reachError) };
  }

  const ros = await api();
  return {
    reachable: true,
    reachError: null,
    features: await readAllFeatures(ros, c),
  };
}

function assertApplied(feature: QuickConfigFeature, wanted: boolean, got: FeatureStatus): void {
  if (got.error) throw new Error(got.error);
  if (got.enabled !== wanted) {
    throw featureError(
      feature,
      wanted
        ? "The router did not enable this setting. Run Test on the router card, then try again."
        : "The router did not disable this setting. Check WinBox for conflicting rules.",
    );
  }
}

/** Apply a single feature toggle change to the router. */
export async function applyQuickConfigFeature(
  c: RouterConn,
  feature: QuickConfigFeature,
  enabled: boolean,
): Promise<FeatureStatus> {
  await pingRouter(c);
  const ros = await api();

  switch (feature) {
    case "clientIsolation":
      await applyClientIsolation(ros, c, enabled);
      break;
    case "wanInputGuard":
      await applyWanInputGuard(ros, c, enabled);
      break;
    case "loginFloodGuard":
      await applyLoginFloodGuard(ros, c, enabled);
      break;
    case "fairShareQos":
      await applyFairShareQos(ros, c, enabled);
      break;
    case "autoBackup":
      await applyAutoBackup(ros, c, enabled);
      break;
    case "trialGuestAccess":
      await applyTrialGuestAccess(ros, c, enabled);
      break;
    case "ntpSync":
      await applyNtpSync(ros, c, enabled);
      break;
    default:
      throw new Error(`Unknown feature: ${feature as string}`);
  }

  const readers: Record<
    QuickConfigFeature,
    (ros: Ros, conn: RouterConn) => Promise<FeatureStatus>
  > = {
    clientIsolation: readClientIsolation,
    wanInputGuard: readWanInputGuard,
    loginFloodGuard: readLoginFloodGuard,
    fairShareQos: readFairShareQos,
    autoBackup: readAutoBackup,
    trialGuestAccess: readTrialGuestAccess,
    ntpSync: readNtpSync,
  };

  const result = await readers[feature](ros, c);
  assertApplied(feature, enabled, result);
  return result;
}
