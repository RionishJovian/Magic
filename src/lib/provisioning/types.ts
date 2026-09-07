// Provisioning domain — pure, browser-safe types shared by the planner, the
// server engine and the UI. No transport, no secrets, no side effects here.

export type IntentKind = "multi-wan";

/** RouterOS version, parsed from /system/resource. */
export type OsVersion = { major: number; minor: number; raw: string };

/** What the engine is allowed to do on a given device. */
export type Capabilities = {
  /** RouterOS REST API (7.1+). Without it we can only render a script. */
  rest: boolean;
  /** v7 moved routing rules to /routing/rule and added routing tables. */
  routingTables: boolean;
  /** Recursive next-hop lookup for gateway health checks. */
  recursiveGateway: boolean;
  /** Per-connection-classifier mangle (both v6 and v7). */
  pcc: boolean;
  /** Netwatch with up/down scripts. */
  netwatch: boolean;
};

export type WanProvider = "starlink" | "fiber" | "lte" | "other";

/** One internet uplink as the operator declares it. */
export type WanLinkIntent = {
  /** Stable key inside the intent — also used in routing-mark names. */
  key: string;
  label: string;
  /** RouterOS interface name, e.g. "ether1" or "pppoe-out1". */
  iface: string;
  provider: WanProvider;
  /** Static gateway; omit for DHCP/PPPoE where RouterOS learns it. */
  gateway?: string;
  /** Relative share of *new connections*, not of bandwidth. */
  weight: number;
  /** Recursive health-check probe target (must be reachable only via this WAN). */
  healthCheckTarget: string;
  /** Optional second probe. The link stays usable while either public target responds. */
  secondaryHealthCheckTarget?: string;
  /** Behind carrier-grade NAT — no usable inbound path. */
  cgnat: boolean;
  /** Operator wants inbound (port-forward / Cloud Remote) on this link. */
  wantsInbound: boolean;
  enabled: boolean;
};

export type FailoverPolicy = {
  /** Legacy policy fields retained for saved intents. Recursive routes own live detection. */
  failThreshold: number;
  /** Seconds between probes. */
  probeIntervalSec: number;
  /** Seconds a recovered link must stay healthy before traffic returns. */
  holdDownSec: number;
  /** false = manual failback only. */
  autoFailback: boolean;
};

export type MultiWanIntent = {
  kind: "multi-wan";
  routerId: string;
  /** "failover" = strict priority order; "balance" = connection-aware PCC. */
  mode: "failover" | "balance";
  links: WanLinkIntent[];
  policy: FailoverPolicy;
  /** LAN interface/bridge the marked traffic originates from. */
  lanInterface: string;
  /** Operator explicitly accepts touching the WAN carrying management access. */
  allowManagementPathChange: boolean;
};

export type Intent = MultiWanIntent;

// --------------------------------------------------------------------------
// Discovery
// --------------------------------------------------------------------------

export type SnapshotInterface = { name: string; type: string; running: boolean };
export type SnapshotAddress = { iface: string; address: string; dynamic: boolean };
export type SnapshotRoute = {
  dst: string;
  gateway: string;
  distance: number;
  comment?: string;
  routingMark?: string;
  dynamic?: boolean;
  /** Interface parsed from RouterOS immediate-gw when available. */
  iface?: string;
};

/** DHCP client on a WAN interface — its own default route fights failover. */
export type SnapshotDhcpClient = {
  iface: string;
  addDefaultRoute: boolean;
  gateway?: string;
};

/** PPPoE client whose add-default-route would fight managed failover. */
export type SnapshotPppoeClient = {
  name: string;
  addDefaultRoute: boolean;
};
export type SnapshotRule = {
  /** RouterOS section path, e.g. "/ip/firewall/mangle". */
  section: string;
  id?: string;
  comment?: string;
  detail?: string;
};

export type DeviceSnapshot = {
  routerId: string;
  identity: string;
  boardName: string;
  version: OsVersion;
  capabilities: Capabilities;
  interfaces: SnapshotInterface[];
  addresses: SnapshotAddress[];
  routes: SnapshotRoute[];
  /** DHCP clients whose add-default-route would fight managed failover. */
  dhcpClients?: SnapshotDhcpClient[];
  pppoeClients?: SnapshotPppoeClient[];
  /** Enabled FastTrack firewall rules; policy-routed PCC traffic must not use them. */
  fastTrackRules?: SnapshotRule[];
  /** Existing mangle / routing / netwatch rules relevant to provisioning. */
  rules: SnapshotRule[];
  /**
   * Interface the app's own management traffic arrives on. Changing routing on
   * this interface risks locking the operator out.
   */
  managementIface: string | null;
  /** Reported public address (MikroTik Cloud), used for CGNAT cross-checks. */
  publicAddress: string | null;
  /** true only for the in-memory test transport — production snapshots are always false. */
  sandbox: boolean;
  takenAt: string;
};

// --------------------------------------------------------------------------
// Plan / preflight
// --------------------------------------------------------------------------

export type StepAction = "add" | "modify" | "skip" | "remove";

export type PlanStep = {
  /** Deterministic id, stable across replans of an unchanged intent. */
  id: string;
  action: StepAction;
  section: string;
  tag: string;
  title: string;
  /** RouterOS command rendered for this device's capabilities. */
  command: string;
  /** Why this step is add / modify / skip. */
  reason: string;
};

export type Severity = "blocker" | "warning" | "info";

export type Finding = {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  remedy?: string;
};

export type ProvisioningPlan = {
  intentKind: IntentKind;
  routerId: string;
  /** Hash of the whole intent — the idempotency key for an apply. */
  intentHash: string;
  steps: PlanStep[];
  summary: Record<StepAction, number>;
  findings: Finding[];
  /** true when nothing would change on the device. */
  noop: boolean;
  /** true when at least one blocker finding is present. */
  blocked: boolean;
  snapshotTakenAt: string;
  sandbox: boolean;
};

// --------------------------------------------------------------------------
// Transport + engine boundary
// --------------------------------------------------------------------------

export type CommandResult = { ok: boolean; command: string; output?: string; error?: string };

/**
 * A provisioning transport. Live applies use RouterOS REST (via Local Connector
 * or Magic Hub). The in-memory sandbox exists for unit tests only.
 */
export interface ProvisioningTransport {
  readonly name: "routeros-rest" | "local-connector" | "hub" | "sandbox";
  discover(routerId: string): Promise<DeviceSnapshot>;
  /** Save a restorable configuration backup and return its identifier. */
  backup(routerId: string, label: string): Promise<{ id: string; name: string }>;
  run(routerId: string, commands: string[]): Promise<CommandResult[]>;
  /** Re-read state after apply so the caller can verify the intent landed. */
  verify(routerId: string, expectedTags: string[]): Promise<{ presentTags: string[] }>;
  restore(routerId: string, backupId: string): Promise<{ ok: boolean; error?: string }>;
}

export type ApplyOutcome = {
  ok: boolean;
  intentHash: string;
  backup: { id: string; name: string } | null;
  executed: CommandResult[];
  verified: boolean;
  missingTags: string[];
  rolledBack: boolean;
  error?: string;
  sandbox: boolean;
};
