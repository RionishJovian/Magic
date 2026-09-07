// Multi-WAN intent: connection-aware distribution (PCC), recursive gateway
// health checks, hold-down / failback, and honest CGNAT limitations.
//
// Pure module: given an intent + a device snapshot it returns a plan. No I/O,
// so it is fully unit-testable and identical on server and client.

import { makeTag, parseTag } from "./tags";
import { parseIpv4, toDotted } from "../gateway-bootstrap/cidr";
import type {
  Capabilities,
  DeviceSnapshot,
  Finding,
  MultiWanIntent,
  OsVersion,
  PlanStep,
  ProvisioningPlan,
  StepAction,
  WanLinkIntent,
} from "./types";

export const INTENT = "multi-wan";

// --------------------------------------------------------------------------
// Capability gating
// --------------------------------------------------------------------------

export function parseOsVersion(raw: string): OsVersion {
  const m = /(\d+)\.(\d+)/.exec(raw ?? "");
  return { major: m ? Number(m[1]) : 0, minor: m ? Number(m[2]) : 0, raw: raw ?? "" };
}

export function capabilitiesFor(v: OsVersion): Capabilities {
  const v7 = v.major >= 7;
  const restCapable = v.major > 7 || (v.major === 7 && v.minor >= 1);
  return {
    rest: restCapable,
    routingTables: v7,
    recursiveGateway: v.major >= 6,
    pcc: v.major >= 6,
    netwatch: v.major >= 6,
  };
}

// --------------------------------------------------------------------------
// Command rendering (v6 / v7 aware)
// --------------------------------------------------------------------------

const markOf = (link: WanLinkIntent) => `mmagic-${link.key}`;

/** Next hop for a WAN: static gateway if the operator set one, else the iface. */
const nextHop = (link: WanLinkIntent) => (link.gateway?.trim() ? link.gateway.trim() : link.iface);

function probeHost(target: string): string {
  return target.trim().replace(/\/\d+$/, "");
}

function probeDst(target: string): string {
  const host = probeHost(target);
  return host.includes("/") ? host : `${host}/32`;
}

export function probeTargets(link: WanLinkIntent): string[] {
  return [...new Set([link.healthCheckTarget, link.secondaryHealthCheckTarget ?? ""])]
    .map(probeHost)
    .filter(Boolean);
}

function ipv4NetworkCidr(cidr: string): string | null {
  const [host, rawPrefix] = cidr.trim().split("/");
  const ip = parseIpv4(host ?? "");
  const prefix = Number(rawPrefix);
  if (ip === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return `${toDotted((ip & mask) >>> 0)}/${prefix}`;
}

function tableName(link: WanLinkIntent) {
  return markOf(link);
}

function routingTableCommand(link: WanLinkIntent, tag: string): string {
  const name = tableName(link);
  return (
    `:if ([:len [/routing table find name="${name}"]] = 0) do={` +
    `/routing table add name=${name} fib comment="${tag}"} else={` +
    `/routing table set [find name="${name}"] fib=yes comment="${tag}"}`
  );
}

/** /32 host route so the probe is only reachable through this uplink. */
function probeRouteCommand(link: WanLinkIntent, target: string, tag: string): string {
  return (
    `/ip route add dst-address=${probeDst(target)} gateway=${nextHop(link)} ` +
    `scope=10 comment="${tag}"`
  );
}

/**
 * Default route. Failover always uses the main table with recursive check-gateway
 * (distance = uplink order). Balance puts a copy in the per-WAN table as well.
 */
function defaultRouteCommand(
  link: WanLinkIntent,
  distance: number,
  caps: Capabilities,
  tag: string,
  where: "main" | "marked",
  target: string,
  tableOwner: WanLinkIntent = link,
): string {
  const gw = caps.recursiveGateway ? probeHost(target) : nextHop(link);
  const recursive = caps.recursiveGateway ? " scope=30 target-scope=11" : "";
  const table =
    where === "marked"
      ? caps.routingTables
        ? ` routing-table=${tableName(tableOwner)}`
        : ` routing-mark=${tableName(tableOwner)}`
      : "";
  return (
    `/ip route add dst-address=0.0.0.0/0 gateway=${gw} check-gateway=ping ` +
    `distance=${distance}${recursive}${table} comment="${tag}"`
  );
}

function pccCommand(
  link: WanLinkIntent,
  index: number,
  total: number,
  intent: MultiWanIntent,
  tag: string,
): string {
  return (
    `/ip firewall mangle add chain=prerouting in-interface=${intent.lanInterface} ` +
    `connection-state=new connection-mark=no-mark dst-address-type=!local ` +
    `per-connection-classifier=both-addresses-and-ports:${total}/${index} ` +
    `action=mark-connection new-connection-mark=${markOf(link)}-conn passthrough=yes comment="${tag}"`
  );
}

function connectedNetworkBypassCommand(
  network: string,
  intent: MultiWanIntent,
  tag: string,
): string {
  return (
    `/ip firewall mangle add chain=prerouting in-interface=${intent.lanInterface} ` +
    `dst-address=${network} action=accept comment="${tag}"`
  );
}

function inboundConnectionMarkCommand(link: WanLinkIntent, tag: string): string {
  return (
    `/ip firewall mangle add chain=prerouting in-interface=${link.iface} ` +
    `connection-state=new connection-mark=no-mark action=mark-connection ` +
    `new-connection-mark=${markOf(link)}-conn passthrough=yes comment="${tag}"`
  );
}

function outputRouteMarkCommand(link: WanLinkIntent, tag: string): string {
  return (
    `/ip firewall mangle add chain=output connection-mark=${markOf(link)}-conn ` +
    `action=mark-routing new-routing-mark=${markOf(link)} passthrough=no comment="${tag}"`
  );
}

function masqueradeCommand(link: WanLinkIntent, tag: string): string {
  return (
    `/ip firewall nat add chain=srcnat out-interface=${link.iface} ` +
    `action=masquerade comment="${tag}"`
  );
}

function routeMarkCommand(link: WanLinkIntent, intent: MultiWanIntent, tag: string): string {
  return (
    `/ip firewall mangle add chain=prerouting in-interface=${intent.lanInterface} ` +
    `connection-mark=${markOf(link)}-conn action=mark-routing ` +
    `new-routing-mark=${markOf(link)} passthrough=no comment="${tag}"`
  );
}

function dhcpDefaultRouteCommand(link: WanLinkIntent, tag: string): string {
  return `/ip dhcp-client set [find interface=${link.iface}] add-default-route=no comment="${tag}"`;
}

function pppoeDefaultRouteCommand(link: WanLinkIntent, tag: string): string {
  return `/interface pppoe-client set [find name=${link.iface}] add-default-route=no comment="${tag}"`;
}

// --------------------------------------------------------------------------
// Planner
// --------------------------------------------------------------------------

type DesiredRule = {
  section: string;
  title: string;
  payload: unknown;
  render: (tag: string) => string;
};

function desiredRules(intent: MultiWanIntent, snapshot: DeviceSnapshot): DesiredRule[] {
  const caps = snapshot.capabilities;
  const links = intent.links.filter((l) => l.enabled);
  const out: DesiredRule[] = [];
  const defaultRouteControls: DesiredRule[] = [];

  for (const link of links) {
    const dhcp = (snapshot.dhcpClients ?? []).find((c) => c.iface === link.iface);
    if (dhcp?.addDefaultRoute) {
      defaultRouteControls.push({
        section: "/ip/dhcp-client",
        title: `Stop ${link.label} DHCP from installing its own default route`,
        payload: { r: "dhcp-defroute", key: link.key, iface: link.iface },
        render: (tag) => dhcpDefaultRouteCommand(link, tag),
      });
    }
    const pppoe = (snapshot.pppoeClients ?? []).find((c) => c.name === link.iface);
    if (pppoe?.addDefaultRoute) {
      defaultRouteControls.push({
        section: "/interface/pppoe-client",
        title: `Stop ${link.label} PPPoE from installing its own default route`,
        payload: { r: "pppoe-defroute", key: link.key, iface: link.iface },
        render: (tag) => pppoeDefaultRouteCommand(link, tag),
      });
    }
    out.push({
      section: "/ip/firewall/nat",
      title: `Masquerade internet traffic on ${link.label}`,
      payload: { r: "masquerade", key: link.key, iface: link.iface },
      render: (tag) => masqueradeCommand(link, tag),
    });
  }

  if (intent.mode === "balance" && caps.routingTables) {
    for (const link of links) {
      out.push({
        section: "/routing/table",
        title: `Routing table for ${link.label}`,
        payload: { r: "rt-table", key: link.key },
        render: (tag) => routingTableCommand(link, tag),
      });
    }
  }

  links.forEach((link, i) => {
    probeTargets(link).forEach((target, probeIndex) => {
      out.push({
        section: "/ip/route",
        title: `Probe ${target} only via ${link.label}`,
        payload: {
          r: "probe",
          key: link.key,
          iface: link.iface,
          gw: link.gateway ?? null,
          target,
          probeIndex,
        },
        render: (tag) => probeRouteCommand(link, target, tag),
      });

      const mainPayload = {
        r: "route-main",
        key: link.key,
        iface: link.iface,
        gw: link.gateway ?? null,
        mode: intent.mode,
        order: i,
        probe: target,
        probeIndex,
      };
      out.push({
        section: "/ip/route",
        title: `Default route via ${link.label} probe ${probeIndex + 1} (distance ${i + 1})`,
        payload: mainPayload,
        render: (tag) => defaultRouteCommand(link, i + 1, caps, tag, "main", target),
      });
    });
  });

  if (intent.mode === "balance") {
    for (const tableOwner of links) {
      links.forEach((candidate, candidateIndex) => {
        const distance = candidate.key === tableOwner.key ? 1 : 10 + candidateIndex;
        probeTargets(candidate).forEach((target, probeIndex) => {
          const markedPayload = {
            r: "route-marked",
            table: tableOwner.key,
            candidate: candidate.key,
            iface: candidate.iface,
            gw: candidate.gateway ?? null,
            probe: target,
            probeIndex,
            distance,
            tables: caps.routingTables,
          };
          out.push({
            section: "/ip/route",
            title:
              candidate.key === tableOwner.key
                ? `${tableOwner.label} policy route via its preferred uplink`
                : `${tableOwner.label} policy backup via ${candidate.label}`,
            payload: markedPayload,
            render: (tag) =>
              defaultRouteCommand(candidate, distance, caps, tag, "marked", target, tableOwner),
          });
        });
      });
    }
  }

  if (intent.mode === "balance" && links.length > 1) {
    const connectedNetworks = [
      ...new Set(snapshot.addresses.map((a) => ipv4NetworkCidr(a.address)).filter(Boolean)),
    ] as string[];
    for (const network of connectedNetworks) {
      out.push({
        section: "/ip/firewall/mangle",
        title: `Keep connected network ${network} on the main routing table`,
        payload: { r: "connected-bypass", network, lan: intent.lanInterface },
        render: (tag) => connectedNetworkBypassCommand(network, intent, tag),
      });
    }

    for (const link of links) {
      out.push({
        section: "/ip/firewall/mangle",
        title: `Keep replies to inbound ${link.label} sessions on the same uplink`,
        payload: { r: "inbound-connection", key: link.key, iface: link.iface },
        render: (tag) => inboundConnectionMarkCommand(link, tag),
      });
    }

    // Weight is expressed as extra PCC buckets: a link with weight 2 receives
    // two of the classifier slots. This distributes *connections*, not bits.
    const buckets: Array<{ link: WanLinkIntent; slot: number }> = [];
    for (const link of links) {
      for (let w = 0; w < Math.max(1, Math.round(link.weight)); w++) {
        buckets.push({ link, slot: buckets.length });
      }
    }
    const total = buckets.length;
    for (const b of buckets) {
      out.push({
        section: "/ip/firewall/mangle",
        title: `Mark new connections for ${b.link.label} (bucket ${b.slot + 1}/${total})`,
        payload: { r: "pcc", key: b.link.key, slot: b.slot, total, lan: intent.lanInterface },
        render: (tag) => pccCommand(b.link, b.slot, total, intent, tag),
      });
    }
    for (const link of links) {
      out.push({
        section: "/ip/firewall/mangle",
        title: `Route LAN sessions out ${link.label}`,
        payload: { r: "mark-routing-lan", key: link.key, lan: intent.lanInterface },
        render: (tag) => routeMarkCommand(link, intent, tag),
      });
      out.push({
        section: "/ip/firewall/mangle",
        title: `Route router replies out ${link.label}`,
        payload: { r: "mark-routing-output", key: link.key },
        render: (tag) => outputRouteMarkCommand(link, tag),
      });
    }
  }

  // Keep the router's learned default route until all replacement routes,
  // NAT and policy rules exist. This avoids cutting off a remote apply midway.
  out.push(...defaultRouteControls);

  return out;
}

export function planMultiWan(intent: MultiWanIntent, snapshot: DeviceSnapshot): ProvisioningPlan {
  const desired = desiredRules(intent, snapshot);

  // Everything this intent already owns on the device, per section.
  const existing = snapshot.rules
    .map((r) => ({ rule: r, tag: parseTag(r.comment) }))
    .filter((x) => x.tag?.intent === INTENT);

  const addSteps: PlanStep[] = [];
  const removeSteps: PlanStep[] = [];
  const keptTags = new Set<string>();

  for (const d of desired) {
    const tag = makeTag(INTENT, d.payload);
    keptTags.add(tag);
    const already = existing.some(
      (e) => e.rule.section === d.section && `mmagic:${INTENT}:${e.tag!.hash}` === tag,
    );
    const sameSectionManaged = existing.filter((e) => e.rule.section === d.section);
    const action: StepAction = already ? "skip" : sameSectionManaged.length > 0 ? "modify" : "add";
    addSteps.push({
      id: `${d.section}:${tag}`,
      action,
      section: d.section,
      tag,
      title: d.title,
      command: d.render(tag),
      reason: already
        ? "Identical rule with this tag already exists — nothing to do."
        : action === "modify"
          ? "This section already holds rules from an earlier apply; they are replaced with the new definition."
          : "Rule does not exist yet.",
    });
  }

  // Managed rules that the new intent no longer wants — remove them first so
  // a re-apply cannot briefly leave two default routes at the same distance.
  for (const e of existing) {
    const tag = `mmagic:${INTENT}:${e.tag!.hash}`;
    if (keptTags.has(tag)) continue;
    // Never delete the operator's DHCP/PPPoE client — we only ever set
    // add-default-route=no on it.
    if (e.rule.section === "/ip/dhcp-client" || e.rule.section === "/interface/pppoe-client") {
      continue;
    }
    removeSteps.push({
      id: `${e.rule.section}:${tag}:remove`,
      action: "remove",
      section: e.rule.section,
      tag,
      title: `Remove stale rule in ${e.rule.section}`,
      command: `/${e.rule.section.replace(/^\//, "").split("/").join(" ")} remove [find comment="${tag}"]`,
      reason: "Created by a previous multi-WAN apply and no longer part of the intent.",
    });
  }

  const steps = [...removeSteps, ...addSteps];
  const findings = preflightMultiWan(intent, snapshot);
  const summary: Record<StepAction, number> = { add: 0, modify: 0, skip: 0, remove: 0 };
  for (const s of steps) summary[s.action]++;

  return {
    intentKind: INTENT,
    routerId: intent.routerId,
    intentHash: makeTag(INTENT, intent).split(":")[2]!,
    steps,
    summary,
    findings,
    noop: summary.add === 0 && summary.modify === 0 && summary.remove === 0,
    blocked: findings.some((f) => f.severity === "blocker"),
    snapshotTakenAt: snapshot.takenAt,
    sandbox: snapshot.sandbox,
  };
}

// --------------------------------------------------------------------------
// Preflight
// --------------------------------------------------------------------------

export function preflightMultiWan(intent: MultiWanIntent, snapshot: DeviceSnapshot): Finding[] {
  const f: Finding[] = [];
  const links = intent.links.filter((l) => l.enabled);

  if (links.length === 0) {
    f.push({
      id: "no-links",
      severity: "blocker",
      title: "No uplinks enabled",
      detail: "At least one internet uplink must be enabled before applying.",
    });
  } else if (links.length < 2) {
    f.push({
      id: "second-uplink-required",
      severity: "blocker",
      title: "A second internet uplink is required",
      detail: "Multi-WAN cannot provide failover or balancing with only one enabled WAN.",
      remedy: "Connect the backup ISP, then select its RouterOS interface here.",
    });
  }

  // --- RouterOS capability gating -----------------------------------------
  if (!snapshot.capabilities.rest) {
    f.push({
      id: "os-too-old",
      severity: "blocker",
      title: `RouterOS ${snapshot.version.raw || "unknown"} cannot be provisioned remotely`,
      detail:
        "Staged apply uses the RouterOS REST API, which exists from RouterOS 7.1. This router reports an older release.",
      remedy:
        "Upgrade the router (/system package update check-for-updates) or copy the generated commands into a terminal session manually.",
    });
  }
  if (!snapshot.capabilities.routingTables && intent.mode === "balance") {
    f.push({
      id: "legacy-routing-marks",
      severity: "warning",
      title: "Legacy routing marks in use",
      detail:
        "This RouterOS release has no named routing tables, so the plan falls back to routing-mark syntax. Behaviour is equivalent but the rules look different from a RouterOS 7 device.",
    });
  }
  if (intent.mode === "balance" && (snapshot.fastTrackRules?.length ?? 0) > 0) {
    f.push({
      id: "fasttrack-conflict",
      severity: "blocker",
      title: "FastTrack conflicts with PCC load balancing",
      detail:
        "This router has an enabled FastTrack firewall rule. FastTracked packets use only the main routing table and can bypass PCC routing marks.",
      remedy:
        "Disable or narrowly exclude the FastTrack rule for the customer LAN, then build a new dry run. MikroMagic will not change operator-created firewall rules automatically.",
    });
  }

  // --- Interfaces exist ----------------------------------------------------
  const known = new Set(snapshot.interfaces.map((i) => i.name));
  const interfaceOwners = new Map<string, string[]>();
  const keyOwners = new Map<string, string[]>();
  for (const l of links) {
    interfaceOwners.set(l.iface, [...(interfaceOwners.get(l.iface) ?? []), l.label]);
    keyOwners.set(l.key, [...(keyOwners.get(l.key) ?? []), l.label]);
    if (known.size > 0 && !known.has(l.iface)) {
      f.push({
        id: `missing-iface-${l.key}`,
        severity: "blocker",
        title: `Interface ${l.iface} not found`,
        detail: `${l.label} is mapped to "${l.iface}", which this router does not have.`,
        remedy: "Pick an interface from the discovered list.",
      });
    }
    const ifaceType =
      snapshot.interfaces.find((candidate) => candidate.name === l.iface)?.type ?? "";
    const pointToPoint =
      (snapshot.pppoeClients ?? []).some((client) => client.name === l.iface) ||
      /(pppoe|lte|wireguard|tunnel)/i.test(`${ifaceType} ${l.iface}`);
    if (!l.gateway?.trim() && l.iface && !pointToPoint) {
      f.push({
        id: `gateway-required-${l.key}`,
        severity: "blocker",
        title: `${l.label} gateway could not be detected`,
        detail: `RouterOS did not report a next-hop gateway for ${l.iface}. Using an Ethernet interface name as the gateway is not safe.`,
        remedy: "Open Advanced settings and enter the ISP gateway IPv4 address.",
      });
    }
    if (l.gateway?.trim() && parseIpv4(l.gateway.trim()) === null) {
      f.push({
        id: `invalid-gateway-${l.key}`,
        severity: "blocker",
        title: `${l.label} has an invalid gateway`,
        detail: `"${l.gateway}" is not a valid IPv4 next-hop address.`,
      });
    }
    if (l.iface === intent.lanInterface) {
      f.push({
        id: `wan-is-lan-${l.key}`,
        severity: "blocker",
        title: `${l.label} is using the LAN interface`,
        detail: `${l.iface} cannot be both the customer LAN and an internet uplink.`,
        remedy: "Select the physical or PPPoE interface connected to this ISP.",
      });
    }
  }
  for (const [iface, owners] of interfaceOwners) {
    if (!iface || owners.length < 2) continue;
    f.push({
      id: `duplicate-interface-${iface}`,
      severity: "blocker",
      title: "Two uplinks use the same interface",
      detail: `${owners.join(" and ")} are both mapped to ${iface}.`,
      remedy: "Select a different RouterOS interface for each ISP.",
    });
  }
  for (const [key, owners] of keyOwners) {
    if (owners.length < 2) continue;
    f.push({
      id: `duplicate-key-${key}`,
      severity: "blocker",
      title: "Two uplinks have the same internal key",
      detail: `${owners.join(" and ")} cannot share the key ${key}.`,
      remedy: "Remove and re-add one uplink to generate a unique key.",
    });
  }
  if (known.size > 0 && !known.has(intent.lanInterface)) {
    f.push({
      id: "missing-lan",
      severity: "blocker",
      title: `LAN interface ${intent.lanInterface} not found`,
      detail: "Connection marking needs a real LAN interface or bridge as its source.",
    });
  }

  // --- Management path -----------------------------------------------------
  const mgmt = snapshot.managementIface;
  if (mgmt) {
    const touched = links.find((l) => l.iface === mgmt);
    if (touched && !intent.allowManagementPathChange) {
      f.push({
        id: "management-path",
        severity: "blocker",
        title: "This change touches the link you are managing the router through",
        detail: `Management traffic currently arrives on ${mgmt}, which is also "${touched.label}". Re-routing it can cut your own access mid-apply.`,
        remedy:
          "Pair a Local Connector (out-of-band access) first, or tick the acknowledgement to continue with an automatic backup and rollback timer.",
      });
    }
    if (touched && intent.allowManagementPathChange) {
      f.push({
        id: "management-path-ack",
        severity: "warning",
        title: "Management path change acknowledged",
        detail: `A configuration backup is taken before apply and restored automatically if the router stops answering.`,
      });
    }
    const disabledMgmt = intent.links.find((l) => l.iface === mgmt && !l.enabled);
    if (disabledMgmt) {
      f.push({
        id: "management-path-disabled",
        severity: "blocker",
        title: "You are disabling the uplink you are connected through",
        detail: `${disabledMgmt.label} (${mgmt}) carries your management session.`,
        remedy: "Keep it enabled, or manage this router through a Local Connector first.",
      });
    }
  }

  // --- Health-check targets ------------------------------------------------
  const targets = new Map<string, string[]>();
  for (const l of links) {
    const linkTargets = probeTargets(l);
    if (linkTargets.length === 0) {
      f.push({
        id: `no-target-${l.key}`,
        severity: "blocker",
        title: `${l.label} has no health-check target`,
        detail: "Failover needs a probe address that is only reachable through this uplink.",
        remedy: "Use public probe IPs such as 1.1.1.1 and 9.9.9.9.",
      });
    }
    if (linkTargets.length < 2) {
      f.push({
        id: `single-target-${l.key}`,
        severity: "warning",
        title: `${l.label} has only one health-check target`,
        detail: "One unreachable public host could trigger a false WAN failure.",
        remedy: "Add a second public probe in Advanced settings.",
      });
    }
    for (const target of linkTargets) {
      targets.set(target, [...(targets.get(target) ?? []), l.label]);
      if (parseIpv4(target) === null) {
        f.push({
          id: `invalid-target-${l.key}-${target}`,
          severity: "blocker",
          title: `${l.label} has an invalid health-check target`,
          detail: `"${target}" is not a valid IPv4 address.`,
          remedy: "Enter a public IPv4 address that responds reliably to ping.",
        });
      }
    }
  }
  for (const [target, owners] of targets) {
    if (owners.length > 1) {
      f.push({
        id: `shared-target-${target}`,
        severity: "warning",
        title: "Uplinks share a health-check target",
        detail: `${owners.join(" and ")} probe ${target}. A shared target cannot tell you which uplink actually failed.`,
        remedy: "Give each uplink a distinct probe address (for example 1.1.1.1 and 8.8.8.8).",
      });
    }
  }

  // --- CGNAT / Starlink ----------------------------------------------------
  for (const l of links) {
    if (!l.cgnat) continue;
    f.push({
      id: `cgnat-${l.key}`,
      severity: l.wantsInbound ? "blocker" : "warning",
      title: `${l.label} is behind CGNAT — outbound only`,
      detail:
        l.provider === "starlink"
          ? "Starlink is CGNAT by default: there is no public address, so port forwarding, Cloud DDNS remote access and inbound VPN cannot work on this link. It is fine as an outbound / failover uplink."
          : "This uplink has no public address, so inbound connections and port forwarding cannot work on it.",
      remedy: l.wantsInbound
        ? "Turn off inbound on this uplink and use a public-IP uplink or a Local Connector for remote access."
        : "Keep remote management on a public-IP uplink or on the Local Connector.",
    });
  }
  const inboundCapable = links.filter((l) => l.wantsInbound && !l.cgnat);
  if (links.some((l) => l.wantsInbound) && inboundCapable.length === 0) {
    f.push({
      id: "no-inbound-path",
      severity: "warning",
      title: "No uplink can accept inbound connections",
      detail:
        "Every enabled uplink is behind CGNAT. Remote management must go through the Local Connector or the WireGuard tunnel.",
    });
  }

  if (intent.mode === "failover" && links.length > 1) {
    f.push({
      id: "failover-expectation",
      severity: "info",
      title: "First enabled uplink is primary",
      detail:
        "Traffic uses uplink 1 first. RouterOS moves to the next uplink only when both recursive public probes for the primary are unreachable, and returns automatically when either probe recovers.",
    });
  }

  const unmanagedDefaults = snapshot.routes.filter(
    (r) => r.dst === "0.0.0.0/0" && !parseTag(r.comment),
  );
  if (unmanagedDefaults.length > 0) {
    const staticDefaults = unmanagedDefaults.filter((r) => !r.dynamic);
    f.push({
      id: "existing-default",
      severity: staticDefaults.length > 0 ? "blocker" : "warning",
      title: "This router already has a default route we do not manage",
      detail: unmanagedDefaults
        .map(
          (r) =>
            `${r.dynamic ? "Dynamic" : "Static"} default via ${r.gateway || "unknown"} (distance ${r.distance})`,
        )
        .join(". "),
      remedy:
        staticDefaults.length > 0
          ? "Disable or remove the old static default route after confirming its purpose, then build a new dry run. MikroMagic will not delete operator-created routes automatically."
          : "DHCP and PPPoE clients on selected WANs will have add-default-route turned off during apply so they cannot fight the managed routes.",
    });
  }

  // --- Honest expectation setting -----------------------------------------
  if (intent.mode === "balance" && links.length > 1) {
    f.push({
      id: "balance-expectation",
      severity: "info",
      title: "Load balancing spreads sessions, it does not add bandwidth",
      detail:
        "Connection-aware balancing sends different sessions down different uplinks. A single download will not exceed the speed of the one uplink carrying it, and total throughput depends on how many sessions are active.",
    });
  }

  return f;
}
