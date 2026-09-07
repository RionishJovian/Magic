/**
 * Curated RouterOS knowledge used by Magic Dude's read-only consultations.
 * Entries deliberately describe evidence and safe next steps, not commands to
 * run. Router changes remain in their dedicated, audited workflows.
 */
export type MagicDudeRosTopic = "guests" | "voucher" | "router";

export type MagicDudeRosGuide = {
  source: string;
  heading: string;
  requiredReads: string[];
  safeNextStep: string;
  securityNote: string;
};

const ROS_GUIDES: Record<MagicDudeRosTopic, MagicDudeRosGuide> = {
  guests: {
    source: "RouterOS documentation · HotSpot — Captive portal",
    heading: "HotSpot profiles, users, and captive portal readiness",
    requiredReads: ["/interface/bridge", "/ip/address", "/ip/dhcp-server", "/ip/hotspot"],
    safeNextStep:
      "Confirm the guest bridge, gateway, DHCP server, and HotSpot profile before attempting setup again.",
    securityNote: "Magic Dude reads configuration state only and never exposes passwords or portal secrets.",
  },
  voucher: {
    source: "RouterOS documentation · HotSpot — Captive portal",
    heading: "HotSpot users, profiles, and active sessions",
    requiredReads: ["/ip/hotspot/user", "/ip/hotspot/user/profile", "/ip/hotspot/active"],
    safeNextStep:
      "Compare the app ledger with the HotSpot user and profile records; import legacy codes only through the audited import flow.",
    securityNote: "RouterOS-only vouchers are never silently treated as app-issued vouchers or revenue.",
  },
  router: {
    source: "RouterOS documentation · REST API and User management",
    heading: "Service availability, authenticated read access, and router health",
    requiredReads: ["/system/resource", "/interface", "/ip/route", "/log"],
    safeNextStep:
      "Confirm Magic Hub reachability and the required read paths. For REST, use HTTPS through www-ssl; do not enable plain HTTP in production.",
    securityNote:
      "A default RouterOS read group can include sensitive capabilities. Use a custom least-privilege group for platform diagnostics.",
  },
};

export function magicDudeRosGuide(topic: MagicDudeRosTopic): MagicDudeRosGuide {
  return ROS_GUIDES[topic];
}

export function missingRouterReadMessage(paths: string[]) {
  const uniquePaths = [...new Set(paths)];
  return uniquePaths.length
    ? `Setup is incomplete: the Magic Hub account needs read access to ${uniquePaths.join(", ")}.`
    : "Setup is incomplete: Magic Hub read access could not be verified.";
}
