import { normalizeRestList } from "./ros-rest-list";

export const CAPTIVE_SECURITY_STATUSES = [
  "PROTECTED",
  "MITIGATED",
  "WARNING",
  "UNVERIFIED",
  "FAILED",
] as const;
export type CaptiveSecurityStatus = (typeof CAPTIVE_SECURITY_STATUSES)[number];
export type CaptiveSecuritySeverity = "low" | "medium" | "high" | "critical";

export type CaptiveSecurityControl = {
  key: string;
  label: string;
  status: CaptiveSecurityStatus;
  severity: CaptiveSecuritySeverity;
  evidence: string[];
  expected: string;
  actual: string;
  reason: string;
  remediation: string;
  packetTestRequired: boolean;
};

export type CaptiveSecurityReport = {
  checkedAt: string;
  score: number;
  scoreLabel: string;
  controls: CaptiveSecurityControl[];
  endpointErrors: string[];
};

export type PreAuthGuardRisk = {
  key: string;
  severity: CaptiveSecuritySeverity;
  status: "WARNING" | "UNVERIFIED" | "FAILED";
  title: string;
  detail: string;
  evidence: string[];
};

export type PreAuthGuardRule = {
  order: number;
  chain: string;
  placement: string;
  action: "accept" | "drop";
  protocol: string;
  ports: string;
  sourceScope: string;
  destinationScope: string;
  interfaceScope: string;
  purpose: string;
  threatMitigated: string;
  dependency: string;
  possibleSideEffect: string;
  marker: string;
  rollback: string;
  verification: string;
};

export type PreAuthGuardPlan = {
  status: "READY FOR REVIEW" | "BLOCKED / UNVERIFIED";
  runnable: false;
  reason: string;
  topology: Record<string, string>;
  risks: PreAuthGuardRisk[];
  rules: PreAuthGuardRule[];
  rollback: string[];
};

export type RouterSnapshot = {
  [key: string]: Array<Record<string, string>> | Record<string, string> | undefined;
  errors?: Record<string, string>;
};

const empty = (snapshot: RouterSnapshot, key: string): Array<Record<string, string>> =>
  Array.isArray(snapshot[key]) ? (snapshot[key] as Array<Record<string, string>>) : [];
const hasError = (snapshot: RouterSnapshot, key: string) => Boolean(snapshot.errors?.[key]);
const enabled = (row: Record<string, string>) => row.disabled !== "true" && row.disabled !== "yes";
const lower = (v: unknown) => String(v ?? "").toLowerCase();
const ports = (row: Record<string, string>) =>
  new Set(
    (row["dst-port"] ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );

function control(
  input: Omit<CaptiveSecurityControl, "packetTestRequired"> & { packetTestRequired?: boolean },
) {
  return { packetTestRequired: true, ...input };
}

function unavailable(
  key: string,
  label: string,
  snapshot: RouterSnapshot,
  endpoint: string,
  severity: CaptiveSecuritySeverity,
): CaptiveSecurityControl {
  return control({
    key,
    label,
    status: "UNVERIFIED",
    severity,
    evidence: snapshot.errors?.[endpoint]
      ? [`${endpoint}: ${snapshot.errors[endpoint]}`]
      : [`${endpoint}: no readable evidence`],
    expected: "The relevant RouterOS state is readable and meets the stated pre-auth policy.",
    actual: "The required RouterOS evidence could not be read.",
    reason:
      "A health check cannot claim protection without inspecting the effective configuration.",
    remediation:
      "Restore read access and run the health check again; validate behavior with an isolated packet test.",
  });
}

function firewallPortControl(
  snapshot: RouterSnapshot,
  key: string,
  label: string,
  protocol: string,
  port: string,
  severity: CaptiveSecuritySeverity,
) {
  if (hasError(snapshot, "firewallFilter"))
    return unavailable(key, label, snapshot, "firewallFilter", severity);
  const rules = empty(snapshot, "firewallFilter");
  const matching = rules.filter(
    (r) =>
      enabled(r) &&
      lower(r.chain) === "forward" &&
      lower(r.protocol) === protocol &&
      ports(r).has(port),
  );
  const drops = matching.filter((r) => lower(r.action) === "drop");
  const firstDrop = rules.findIndex(
    (r) =>
      enabled(r) &&
      lower(r.chain) === "forward" &&
      lower(r.protocol) === protocol &&
      ports(r).has(port) &&
      lower(r.action) === "drop",
  );
  const earlierAccept =
    firstDrop >= 0 &&
    rules
      .slice(0, firstDrop)
      .some(
        (r) =>
          enabled(r) &&
          lower(r.chain) === "forward" &&
          ["accept", "fasttrack-connection"].includes(lower(r.action)),
      );
  if (!drops.length) {
    return control({
      key,
      label,
      status: "WARNING",
      severity,
      evidence: [
        `forward ${protocol}/${port}: no enabled drop rule found`,
        `inspected ${rules.length} IPv4 filter rules`,
      ],
      expected: `Unauthenticated guest traffic using ${protocol}/${port} is denied before normal forwarding.`,
      actual: "No matching enabled forward drop was observed.",
      reason:
        "The current configuration does not demonstrate a deny control for this bypass channel.",
      remediation:
        "Define and verify a narrowly scoped pre-auth deny rule, then run a packet test; do not rely on a rule comment alone.",
    });
  }
  const scoped = drops.some(
    (r) => r["in-interface"] || r["in-interface-list"] || r["src-address-list"] || r["src-address"],
  );
  return control({
    key,
    label,
    status: earlierAccept ? "WARNING" : scoped ? "MITIGATED" : "UNVERIFIED",
    severity,
    evidence: [
      `${drops.length} enabled forward drop rule(s) for ${protocol}/${port}`,
      scoped
        ? "at least one rule has an ingress/source scope"
        : "drop rule has no visible guest/pre-auth scope",
      ...(earlierAccept ? ["an earlier enabled accept/fasttrack rule may win"] : []),
    ],
    expected:
      "A correctly ordered, enabled, guest/pre-auth-scoped deny rule must win before conflicting accepts.",
    actual: `${earlierAccept ? "Ordering conflict observed; " : "No earlier matching accept observed; "}${scoped ? "scope present." : "scope not proven."}`,
    reason:
      "Static rule inspection cannot prove the HotSpot pre-auth state or packet path; an unscoped rule may affect the wrong clients.",
    remediation:
      "Verify chain, order, enabled state, source/interface scope, and earlier accepts on the real router, then test from an unauthenticated client.",
  });
}

export function evaluateCaptivePortalSecurity(
  snapshot: RouterSnapshot,
  checkedAt = new Date().toISOString(),
): CaptiveSecurityReport {
  const controls: CaptiveSecurityControl[] = [];
  const filter = empty(snapshot, "firewallFilter");
  const hotspotProfiles = empty(snapshot, "hotspotProfiles");
  const users = empty(snapshot, "hotspotUsers");

  controls.push(
    hasError(snapshot, "hotspotProfiles")
      ? unavailable("hotspot", "HotSpot authentication", snapshot, "hotspotProfiles", "critical")
      : control({
          key: "hotspot",
          label: "HotSpot authentication",
          status: hotspotProfiles.length ? "MITIGATED" : "FAILED",
          severity: "critical",
          evidence: hotspotProfiles.map(
            (p) =>
              `profile ${p.name ?? "(unnamed)"}: login-by=${p["login-by"] ?? "unset"}, use-radius=${p["use-radius"] ?? "unset"}`,
          ),
          expected:
            "Guest networks use an enabled HotSpot profile with explicit authentication settings.",
          actual: hotspotProfiles.length
            ? `${hotspotProfiles.length} HotSpot server profile(s) readable.`
            : "No HotSpot server profiles were found.",
          reason:
            "RouterOS-native HotSpot authentication is observable, but this check does not prove that every guest interface is covered or that Magic is in the live login path.",
          remediation:
            "Verify HotSpot servers, networks, profiles, and redirect behavior on an isolated guest VLAN.",
        }),
    hasError(snapshot, "firewallFilter")
      ? unavailable("ipv4-filter", "IPv4 firewall coverage", snapshot, "firewallFilter", "critical")
      : control({
          key: "ipv4-filter",
          label: "IPv4 firewall coverage",
          status: filter.length ? "UNVERIFIED" : "FAILED",
          severity: "critical",
          evidence: [
            `${filter.length} IPv4 filter rule(s) read`,
            ...filter
              .slice(0, 8)
              .map(
                (r, i) =>
                  `#${i + 1} ${r.chain ?? "?"}/${r.action ?? "?"} ${r.comment ? `comment=${r.comment}` : ""}`,
              ),
          ],
          expected:
            "Guest pre-auth traffic is default-deny with only explicitly justified exceptions.",
          actual:
            "Rule inventory is available, but effective pre-auth default-deny cannot be proven from inventory alone.",
          reason:
            "Rule order and packet matching depend on interface lists, address lists, HotSpot state, and earlier rules.",
          remediation:
            "Inspect all scopes and run a real unauthenticated packet matrix before claiming protection.",
        }),
    hasError(snapshot, "ipv6Filter")
      ? unavailable("ipv6", "IPv6 pre-auth coverage", snapshot, "ipv6Filter", "critical")
      : control({
          key: "ipv6",
          label: "IPv6 pre-auth coverage",
          status: empty(snapshot, "ipv6Filter").length ? "UNVERIFIED" : "WARNING",
          severity: "critical",
          evidence: [
            `${empty(snapshot, "ipv6Filter").length} IPv6 filter rule(s) read`,
            `${empty(snapshot, "ipv6Addresses").length} IPv6 address record(s) read`,
          ],
          expected:
            "IPv6 is disabled for the guest path or has equivalent verified pre-auth enforcement.",
          actual: "IPv6 enforcement equivalence is not demonstrated.",
          reason:
            "An IPv6-capable client may bypass IPv4 HotSpot controls unless RouterOS IPv6 policy is explicitly verified.",
          remediation: "Decide and verify guest IPv6 policy with an isolated IPv6 packet test.",
        }),
    firewallPortControl(snapshot, "dns-udp", "Arbitrary DNS over UDP", "udp", "53", "high"),
    firewallPortControl(snapshot, "dns-tcp", "Arbitrary DNS over TCP", "tcp", "53", "high"),
    firewallPortControl(snapshot, "dot-tcp", "DNS over TLS", "tcp", "853", "high"),
    firewallPortControl(snapshot, "dot-udp", "DNS over TLS/UDP", "udp", "853", "high"),
    firewallPortControl(snapshot, "quic", "QUIC / UDP 443", "udp", "443", "high"),
  );

  const shield = filter.filter((r) => lower(r.comment).startsWith("mm-login-shield"));
  controls.push(
    control({
      key: "shield",
      label: "Magic Shield rule integrity",
      status: shield.length ? "MITIGATED" : "WARNING",
      severity: "high",
      evidence: shield.length
        ? shield.map(
            (r, i) =>
              `#${filter.indexOf(r) + 1} enabled=${enabled(r)} chain=${r.chain ?? "?"} protocol=${r.protocol ?? "any"} action=${r.action ?? "?"} scope=${r["in-interface-list"] ?? r["in-interface"] ?? r["src-address-list"] ?? "none"}`,
          )
        : ["No Magic Shield-tagged rules observed"],
      expected:
        "Security rules are enabled, correctly ordered, correctly scoped, and not defeated by earlier accepts.",
      actual: shield.length
        ? "Tagged rules exist; complete semantic and packet effectiveness is not proven."
        : "No tagged rules were observed.",
      reason:
        "A Magic comment is metadata, not evidence that RouterOS will match the intended unauthenticated packets.",
      remediation:
        "Use the control-level findings and an isolated packet test; do not treat tag presence as PROTECTED.",
    }),
  );

  const dns = empty(snapshot, "dns");
  controls.push(
    control({
      key: "router-dns",
      label: "Router DNS / controlled resolver",
      status: hasError(snapshot, "dns") ? "UNVERIFIED" : dns.length ? "WARNING" : "UNVERIFIED",
      severity: "high",
      evidence: dns.length
        ? dns.map(
            (r) =>
              `allow-remote-requests=${r["allow-remote-requests"] ?? "unset"}, servers=${r.servers ?? "unset"}`,
          )
        : ["DNS configuration unreadable or empty"],
      expected:
        "Guests use only the intended resolver path; arbitrary external DNS is denied before authentication.",
      actual: dns.length
        ? "DNS configuration is readable, but resolver reachability and pre-auth enforcement are not proven."
        : "No DNS configuration evidence.",
      reason: "DNS settings alone do not establish what unauthenticated clients can reach.",
      remediation:
        "Verify DHCP-provided resolver, router DNS policy, TCP/UDP 53 controls, and tunnel resistance with packets.",
    }),
    control({
      key: "walled-garden",
      label: "Walled garden / access scope",
      status: hasError(snapshot, "walledGarden") ? "UNVERIFIED" : "UNVERIFIED",
      severity: "high",
      evidence: empty(snapshot, "walledGarden").map(
        (r) =>
          `IP/hostname=${r["dst-address"] ?? r["dst-host"] ?? r["dst-address-list"] ?? "any"} action=${r.action ?? "allow"}`,
      ),
      expected: "Only minimum portal/auth destinations are allowed before authentication.",
      actual: `${empty(snapshot, "walledGarden").length} walled-garden rule(s) read; effective destination scope is not validated.`,
      reason:
        "Broad FQDNs, IP ranges, CDNs, or authentication-free exceptions can create an Internet path.",
      remediation:
        "Review every exception and validate from an unauthenticated guest; remove broad or unnecessary entries after approval.",
    }),
    control({
      key: "bindings",
      label: "IP bindings / bypass exceptions",
      status: hasError(snapshot, "bindings")
        ? "UNVERIFIED"
        : empty(snapshot, "bindings").some((r) => lower(r.type) === "bypassed")
          ? "WARNING"
          : "MITIGATED",
      severity: "high",
      evidence: empty(snapshot, "bindings").map(
        (r) =>
          `address=${r.address ?? "any"} mac=${r["mac-address"] ?? "any"} type=${r.type ?? "regular"} disabled=${r.disabled ?? "false"}`,
      ),
      expected: "No unintended unauthenticated bypass bindings exist in the guest scope.",
      actual: `${empty(snapshot, "bindings").length} binding(s) read; ${empty(snapshot, "bindings").filter((r) => lower(r.type) === "bypassed").length} bypassed binding(s) observed.`,
      reason:
        "IP/MAC bindings can bypass HotSpot authentication and must be explicitly owned and scoped.",
      remediation:
        "Review each binding against the guest network and operator intent; test bypass behavior.",
    }),
    control({
      key: "mac-cookies",
      label: "MAC-cookie / shared-user policy",
      status: hasError(snapshot, "hotspotProfiles") ? "UNVERIFIED" : "WARNING",
      severity: "high",
      evidence: hotspotProfiles.map(
        (p) =>
          `profile ${p.name ?? "?"}: shared-users=${p["shared-users"] ?? "unset"}, add-mac-cookie=${p["add-mac-cookie"] ?? "unset"}`,
      ),
      expected:
        "MAC cookies and shared-user limits do not become the sole proof of Magic authorization.",
      actual: `${users.length} persistent HotSpot user(s) read; RouterOS profile identity controls are present but not a cryptographic session identity.`,
      reason:
        "MAC spoofing, cookie reuse, and shared credentials can create session cloning or re-entry risk.",
      remediation:
        "Keep Magic session/accounting authoritative and test reuse, cloning, expiry, and reconnect behavior.",
    }),
    control({
      key: "icmp",
      label: "Pre-auth ICMP",
      status: hasError(snapshot, "firewallFilter") ? "UNVERIFIED" : "UNVERIFIED",
      severity: "high",
      evidence: [
        `${filter.filter((r) => lower(r.protocol) === "icmp").length} IPv4 ICMP filter rule(s) observed`,
      ],
      expected:
        "Unauthenticated ICMP is denied unless a specific captive-portal requirement justifies it.",
      actual: "No effective pre-auth ICMP behavior is proven by static inventory.",
      reason:
        "ICMP may be used for tunneling or reachability and requires packet-level verification.",
      remediation:
        "Test ICMP from an unauthenticated client and define the least-permissive policy after review.",
    }),
    hasError(snapshot, "nat")
      ? unavailable("nat", "NAT path scope", snapshot, "nat", "high")
      : control({
          key: "nat",
          label: "NAT path scope",
          status: "UNVERIFIED",
          severity: "high",
          evidence: empty(snapshot, "nat").map(
            (r, i) =>
              `#${i + 1} chain=${r.chain ?? "?"} action=${r.action ?? "?"} src=${r["src-address"] ?? "any"} out=${r["out-interface-list"] ?? r["out-interface"] ?? "any"}`,
          ),
          expected: "NAT does not create an unintended pre-auth path around HotSpot enforcement.",
          actual: `${empty(snapshot, "nat").length} NAT rule(s) read; pre-auth interaction is not proven.`,
          reason:
            "NAT is not itself authorization, but broad rules can conceal or enable an unexpected forwarding path.",
          remediation:
            "Correlate NAT with HotSpot interfaces and firewall order, then validate with unauthenticated traffic.",
        }),
    hasError(snapshot, "interfaces") ||
      hasError(snapshot, "interfaceLists") ||
      hasError(snapshot, "interfaceListMembers")
      ? unavailable("scope", "Interface-list and guest scope", snapshot, "interfaces", "critical")
      : control({
          key: "scope",
          label: "Interface-list and guest scope",
          status: "UNVERIFIED",
          severity: "critical",
          evidence: [
            `${empty(snapshot, "interfaces").length} interfaces`,
            `${empty(snapshot, "interfaceLists").length} interface lists`,
            `${empty(snapshot, "interfaceListMembers").length} list members`,
          ],
          expected:
            "All guest ingress interfaces are explicitly covered by HotSpot and pre-auth policy.",
          actual:
            "Interface inventory is read, but guest membership and rule coverage require operator correlation.",
          reason: "A correctly tagged rule on the wrong interface list does not protect guests.",
          remediation:
            "Map guest SSID/VLAN/bridge to interface-list membership and test an unauthenticated client on each path.",
        }),
    hasError(snapshot, "dhcpServers") || hasError(snapshot, "dhcpNetworks")
      ? unavailable("dhcp", "DHCP and guest subnet", snapshot, "dhcpServers", "high")
      : control({
          key: "dhcp",
          label: "DHCP and guest subnet",
          status:
            empty(snapshot, "dhcpServers").length && empty(snapshot, "dhcpNetworks").length
              ? "UNVERIFIED"
              : "WARNING",
          severity: "high",
          evidence: [
            `${empty(snapshot, "dhcpServers").length} DHCP server(s)`,
            `${empty(snapshot, "dhcpNetworks").length} DHCP network(s)`,
          ],
          expected:
            "Guest DHCP scope maps only to the intended HotSpot network and controlled resolver.",
          actual:
            "DHCP evidence is available, but subnet-to-HotSpot and resolver behavior is not packet-verified.",
          reason: "An uncovered or overlapping subnet can bypass captive enforcement.",
          remediation:
            "Correlate DHCP networks, addresses, HotSpot servers, and bridge/VLAN scope; test each guest subnet.",
        }),
    hasError(snapshot, "hotspotServers") || hasError(snapshot, "addresses")
      ? unavailable("coverage", "IPv4 captive coverage", snapshot, "hotspotServers", "critical")
      : control({
          key: "coverage",
          label: "IPv4 captive coverage",
          status: empty(snapshot, "hotspotServers").length ? "UNVERIFIED" : "WARNING",
          severity: "critical",
          evidence: [
            `${empty(snapshot, "hotspotServers").length} HotSpot server(s)`,
            `${empty(snapshot, "addresses").length} IPv4 address record(s)`,
          ],
          expected: "Every guest IPv4 segment is attached to the intended HotSpot server/profile.",
          actual:
            "HotSpot and address inventories are readable, but complete guest coverage is not proven.",
          reason:
            "A guest VLAN or address range outside HotSpot scope can obtain unrestricted access.",
          remediation:
            "Map every guest subnet to a HotSpot server and validate redirect/default-deny behavior on each segment.",
        }),
  );

  const weights: Record<CaptiveSecurityStatus, number> = {
    PROTECTED: 100,
    MITIGATED: 70,
    WARNING: 40,
    UNVERIFIED: 20,
    FAILED: 0,
  };
  const score = controls.length
    ? Math.round(controls.reduce((sum, c) => sum + weights[c.status], 0) / controls.length)
    : 0;
  return {
    checkedAt,
    score,
    scoreLabel:
      score >= 85 ? "strong evidence" : score >= 65 ? "partial evidence" : "insufficient evidence",
    controls,
    endpointErrors: Object.values(snapshot.errors ?? {}),
  };
}

export function normalizeSnapshotValue(value: unknown): Array<Record<string, string>> {
  return normalizeRestList<Record<string, string>>(value).map(
    (row) =>
      Object.fromEntries(Object.entries(row).map(([key, v]) => [key, String(v ?? "")])) as Record<
        string,
        string
      >,
  );
}

function firstValue(rows: Array<Record<string, string>>, ...keys: string[]): string {
  for (const row of rows) for (const key of keys) if (row[key]) return row[key];
  return "unknown";
}

function hasEnabledActionBefore(rules: Array<Record<string, string>>, action: string): boolean {
  return rules.some(
    (rule) => enabled(rule) && lower(rule.chain) === "forward" && lower(rule.action) === action,
  );
}

function isBroadGardenRule(row: Record<string, string>): boolean {
  const target = row["dst-address"] ?? row["dst-host"] ?? row["dst-address-list"] ?? "";
  return (
    !target ||
    target === "0.0.0.0/0" ||
    target === "::/0" ||
    target.includes("*") ||
    target.includes(",")
  );
}

export function generatePreAuthGuardPlan(
  snapshot: RouterSnapshot,
  marker = "mm-preauth-guard",
): PreAuthGuardPlan {
  const rules = empty(snapshot, "firewallFilter");
  const servers = empty(snapshot, "hotspotServers");
  const profiles = empty(snapshot, "hotspotProfiles");
  const bindings = empty(snapshot, "bindings");
  const gardens = [...empty(snapshot, "walledGarden"), ...empty(snapshot, "walledGardenIp")];
  const interfaces = empty(snapshot, "interfaces");
  const lists = empty(snapshot, "interfaceLists");
  const members = empty(snapshot, "interfaceListMembers");
  const ipv6Addresses = empty(snapshot, "ipv6Addresses");
  const ipv6Rules = empty(snapshot, "ipv6Filter");
  const risks: PreAuthGuardRisk[] = [];
  const topology: Record<string, string> = {
    routerOsVersion: firstValue(empty(snapshot, "systemResource"), "version"),
    hotspotServer: firstValue(servers, "name"),
    hotspotInterface: firstValue(servers, "interface"),
    hotspotProfile: firstValue(servers, "profile", "user-profile"),
    dynamicHotspotChains:
      rules
        .filter(
          (r) => ["true", "yes"].includes(lower(r.dynamic)) && lower(r.chain).startsWith("hs-"),
        )
        .map((r) => r.chain ?? "unknown")
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(", ") || "none observed",
    guestInterfaces:
      members
        .filter((m) => lower(m.list).includes("guest") || lower(m.list).includes("lan"))
        .map((m) => m.interface ?? "unknown")
        .filter(Boolean)
        .join(", ") || "not identified",
    guestSubnet: firstValue(empty(snapshot, "dhcpNetworks"), "address", "gateway"),
    dhcp: firstValue(empty(snapshot, "dhcpServers"), "name"),
    routerDns: firstValue(empty(snapshot, "dns"), "servers", "allow-remote-requests"),
    ipv4AddressCount: String(empty(snapshot, "addresses").length),
    ipv6AddressCount: String(ipv6Addresses.length),
    ipv6FilterCount: String(ipv6Rules.length),
  };

  const required = [
    "firewallFilter",
    "hotspotServers",
    "hotspotProfiles",
    "interfaces",
    "interfaceLists",
    "interfaceListMembers",
    "dhcpServers",
    "dhcpNetworks",
    "dns",
    "addresses",
    "ipv6Filter",
    "ipv6Addresses",
  ];
  for (const key of required) {
    if (hasError(snapshot, key))
      risks.push({
        key: `missing-${key}`,
        severity: "critical",
        status: "UNVERIFIED",
        title: `Unreadable ${key} evidence`,
        detail: "The plan cannot safely determine topology or effective scope.",
        evidence: [snapshot.errors?.[key] ?? `${key}: no readable evidence`],
      });
  }

  const hsChains = rules
    .filter((r) => ["true", "yes"].includes(lower(r.dynamic)))
    .map((r) => lower(r.chain))
    .filter((chain) =>
      ["hs-unauth", "hs-auth", "pre-hotspot", "hotspot", "hs-unauth-to", "hs-auth-to"].includes(
        chain,
      ),
    );
  if (!servers.length || !profiles.length || !hsChains.length)
    risks.push({
      key: "hotspot-chain",
      severity: "critical",
      status: "UNVERIFIED",
      title: "HotSpot chain is unknown",
      detail: "No complete HotSpot server/profile/dynamic-chain relationship was observed.",
      evidence: [
        `servers=${servers.length}`,
        `profiles=${profiles.length}`,
        `recognized chains=${hsChains.join(", ") || "none"}`,
      ],
    });
  if (hasEnabledActionBefore(rules, "accept"))
    risks.push({
      key: "earlier-accept",
      severity: "critical",
      status: "WARNING",
      title: "Broad forward ACCEPT may precede pre-auth protection",
      detail:
        "An enabled forward ACCEPT exists; its scope and order must be checked against guest traffic before any plan can be applied.",
      evidence: rules
        .filter((r) => enabled(r) && lower(r.chain) === "forward" && lower(r.action) === "accept")
        .slice(0, 5)
        .map((r, i) => `accept candidate ${i + 1}: ${r.comment ?? "no comment"}`),
    });
  if (
    rules.some(
      (r) =>
        enabled(r) && lower(r.chain) === "forward" && lower(r.action) === "fasttrack-connection",
    )
  )
    risks.push({
      key: "fasttrack",
      severity: "critical",
      status: "WARNING",
      title: "FastTrack interaction requires verification",
      detail: "FastTrack may bypass intended inspection or state transition ordering.",
      evidence: rules
        .filter((r) => enabled(r) && lower(r.action) === "fasttrack-connection")
        .map((r) => `chain=${r.chain ?? "?"} comment=${r.comment ?? "none"}`),
    });
  const bypassed = bindings.filter((r) => enabled(r) && lower(r.type) === "bypassed");
  if (bypassed.length)
    risks.push({
      key: "bypassed-binding",
      severity: "critical",
      status: "FAILED",
      title: "Authentication bypass binding observed",
      detail: "A bypassed IP/MAC binding can avoid HotSpot authentication.",
      evidence: bypassed.map(
        (r) => `address=${r.address ?? "any"} mac=${r["mac-address"] ?? "any"}`,
      ),
    });
  if (gardens.some(isBroadGardenRule))
    risks.push({
      key: "broad-garden",
      severity: "critical",
      status: "WARNING",
      title: "Broad walled-garden entry observed",
      detail: "A broad or empty destination may leak pre-auth access.",
      evidence: gardens
        .filter(isBroadGardenRule)
        .map((r) => `dst=${r["dst-address"] ?? r["dst-host"] ?? r["dst-address-list"] ?? "any"}`),
    });
  if (topology.hotspotInterface === "unknown" || topology.guestInterfaces === "not identified")
    risks.push({
      key: "guest-scope",
      severity: "critical",
      status: "UNVERIFIED",
      title: "Guest interface/VLAN scope is not identified",
      detail: "The plan cannot safely scope rules to guest ingress.",
      evidence: [
        `HotSpot interface=${topology.hotspotInterface}`,
        `guest interfaces=${topology.guestInterfaces}`,
        `interfaces=${interfaces.length}`,
        `interface lists=${lists.length}`,
        `members=${members.length}`,
      ],
    });
  const dnsConfig = empty(snapshot, "dns");
  if (dnsConfig.some((r) => lower(r["allow-remote-requests"]) === "yes"))
    risks.push({
      key: "uncontrolled-dns",
      severity: "high",
      status: "WARNING",
      title: "Router DNS allows remote requests",
      detail:
        "Resolver reachability must be verified so guests cannot use arbitrary external DNS or tunneling.",
      evidence: dnsConfig.map(
        (r) => `allow-remote-requests=${r["allow-remote-requests"] ?? "unset"}`,
      ),
    });
  if (!ipv6Rules.some(enabled))
    risks.push({
      key: "ipv6-gap",
      severity: "critical",
      status: "FAILED",
      title: "IPv6 has no equivalent firewall evidence",
      detail: "IPv6 may bypass IPv4 HotSpot policy.",
      evidence: [`IPv6 addresses=${ipv6Addresses.length}`, `IPv6 filter rules=${ipv6Rules.length}`],
    });
  const guestNames = new Set(
    members
      .filter((m) => lower(m.list).includes("guest") || lower(m.list).includes("lan"))
      .map((m) => m.interface),
  );
  const managementOverlap = members.filter(
    (m) =>
      guestNames.has(m.interface) &&
      ["wan", "management", "mgmt"].some((name) => lower(m.list).includes(name)),
  );
  if (managementOverlap.length)
    risks.push({
      key: "management-overlap",
      severity: "critical",
      status: "FAILED",
      title: "Management and guest scope overlap",
      detail: "A guest interface appears in a management/WAN list.",
      evidence: managementOverlap.map((m) => `${m.interface ?? "?"} member of ${m.list ?? "?"}`),
    });

  const chain = hsChains.includes("hs-unauth") ? "hs-unauth" : (hsChains[0] ?? "UNVERIFIED");
  const guestScope =
    topology.guestInterfaces === "not identified"
      ? "UNVERIFIED guest ingress"
      : topology.guestInterfaces;
  const rulesPlan: PreAuthGuardRule[] =
    chain === "UNVERIFIED"
      ? []
      : [
          {
            order: 1,
            chain,
            placement:
              "before existing conflicting unauthenticated forward rules; exact index requires review",
            action: "accept",
            protocol: "udp",
            ports: "67-68",
            sourceScope: guestScope,
            destinationScope: "router DHCP service",
            interfaceScope: guestScope,
            purpose: "Allow DHCP",
            threatMitigated: "Prevents accidental loss of client addressing",
            dependency: "Verified guest HotSpot interface and DHCP server",
            possibleSideEffect: "A broad scope could expose DHCP on non-guest interfaces",
            marker: `${marker}-dhcp`,
            rollback: `Remove only rule comment=${marker}-dhcp after verification failure`,
            verification: "Renew lease from unauthenticated client",
          },
          {
            order: 2,
            chain,
            placement: "after DHCP allow and before deny rules",
            action: "accept",
            protocol: "udp,tcp",
            ports: "53",
            sourceScope: guestScope,
            destinationScope: "router DNS address only",
            interfaceScope: guestScope,
            purpose: "Allow controlled DNS",
            threatMitigated: "Blocks arbitrary DNS while preserving portal resolution",
            dependency: "Verified router DNS address and resolver policy",
            possibleSideEffect: "Incorrect router address can break portal resolution",
            marker: `${marker}-dns`,
            rollback: `Remove only rule comment=${marker}-dns after verification failure`,
            verification: "Resolve portal name; confirm external resolver is denied",
          },
          {
            order: 3,
            chain,
            placement: "after required HotSpot dynamic processing and explicit portal exceptions",
            action: "drop",
            protocol: "udp,tcp",
            ports: "53,853",
            sourceScope: guestScope,
            destinationScope: "any except verified router DNS",
            interfaceScope: guestScope,
            purpose: "Deny arbitrary DNS and DoT",
            threatMitigated: "DNS tunneling and encrypted DNS bypass",
            dependency: "Rule order, DNS exception, and HotSpot chain verified",
            possibleSideEffect:
              "May break customer DNS choices if applied to authenticated traffic",
            marker: `${marker}-dns-deny`,
            rollback: `Remove only rule comment=${marker}-dns-deny after verification failure`,
            verification: "Probe external UDP/TCP 53 and TCP/UDP 853 before authentication",
          },
          {
            order: 4,
            chain,
            placement: "after portal exceptions and before default deny",
            action: "drop",
            protocol: "udp",
            ports: "443",
            sourceScope: guestScope,
            destinationScope: "any",
            interfaceScope: guestScope,
            purpose: "Deny QUIC before authentication",
            threatMitigated: "QUIC/UDP-443 tunnel path",
            dependency: "Confirmed portal does not require UDP/443",
            possibleSideEffect:
              "Must not be applied to authenticated users without policy approval",
            marker: `${marker}-quic`,
            rollback: `Remove only rule comment=${marker}-quic after verification failure`,
            verification: "Probe UDP/443 before and after authentication",
          },
          {
            order: 5,
            chain,
            placement: "last pre-auth rule before verified HotSpot transition",
            action: "drop",
            protocol: "all",
            ports: "any",
            sourceScope: guestScope,
            destinationScope: "any",
            interfaceScope: guestScope,
            purpose: "Default deny remaining pre-auth traffic",
            threatMitigated: "Unlisted tunnel and redirect-bypass paths",
            dependency: "Complete portal requirements, dynamic chains, and IPv4/IPv6 coverage",
            possibleSideEffect:
              "Can break portal assets or captive detection if allowlist is incomplete",
            marker: `${marker}-default-deny`,
            rollback: `Remove only rule comment=${marker}-default-deny after verification failure`,
            verification: "Run complete unauthenticated packet matrix",
          },
        ];
  const critical = risks.filter((r) => r.severity === "critical");
  const status = critical.length ? "BLOCKED / UNVERIFIED" : "READY FOR REVIEW";
  return {
    status,
    runnable: false,
    reason:
      status === "READY FOR REVIEW"
        ? "Topology is sufficiently identified to review a non-runnable candidate plan; operator approval and packet testing remain required."
        : "Critical topology or enforcement evidence is incomplete. No apply-ready plan is generated.",
    topology,
    risks,
    rules: rulesPlan,
    rollback: rulesPlan.map((r) => r.rollback),
  };
}
