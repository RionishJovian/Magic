import { canManageVoucherPrintLayouts, hasTenantPrimaryRole } from "../app-role";

// Owner-first information architecture.
//
// One source of truth for the admin navigation: every tab keeps its existing
// URL, but is now grouped into a mode (Business / Operations / Advanced) so a
// non-technical owner sees four business tabs by default and reaches the
// technical surfaces progressively. Role predicates are unchanged — they are
// simply expressed here instead of inline in the shell.

export type NavMode = "business" | "operations" | "advanced";

export const NAV_MODES: ReadonlyArray<{ id: NavMode; label: string; hint: string }> = [
  { id: "business", label: "Business", hint: "Money, guests and the portal" },
  { id: "operations", label: "Operations", hint: "Devices, sites and health" },
  {
    id: "advanced",
    label: "Advanced",
    hint: "Optional integrations, terminal and diagnostics",
  },
];

export type NavItem = {
  to: string;
  label: string;
  mode: NavMode;
  /** Match only the exact path (used by Home). */
  exact?: boolean;
  /** Shown in every mode — account-level surfaces. */
  pinned?: boolean;
  primaryOnly?: boolean;
  privilegedOnly?: boolean;
  /** Team Magic platform_admins only — internal until polished. */
  platformAdminOnly?: boolean;
  agentOrOwner?: boolean;
  /** When set with privilegedOnly, a granted client/agent may also see this tab. */
  feature?: string;
  /** Legacy optional entitlement gate. No current navigation item uses it. */
  plusOnly?: boolean;
  /** Visible and reachable for every account except an active seven-day Trial. */
  trialLocked?: boolean;
  /** Visible to limited roles, but its page presents a themed locked state. */
  roleLocked?: boolean;
  /** Voucher receipt layout management (Primary, Developer, or active User). */
  voucherPrintLayoutManagerOnly?: boolean;
};

/** Expired accounts: renew only — Home/Profile/Manual to find the path, Services to pay. */
export const EXPIRED_ALLOWED: ReadonlySet<string> = new Set([
  "/app",
  "/app/profile",
  "/app/manual",
  "/app/services",
]);

export const NAV_ITEMS: readonly NavItem[] = [
  // Business — the default mode.
  { to: "/app", label: "Home", mode: "business", exact: true },
  { to: "/app/revenue", label: "Revenue", mode: "business" },
  { to: "/app/vouchers", label: "Vouchers", mode: "business" },
  {
    to: "/app/voucher-layouts",
    label: "Print",
    mode: "business",
    voucherPrintLayoutManagerOnly: true,
  },
  // Voucher stock and daily cash close are available after the seven-day Trial.
  {
    to: "/app/reseller-operation",
    label: "Reseller Operation",
    mode: "business",
    trialLocked: true,
  },
  // Payments: owner/admin, or a client/agent granted cash_sales on Users.
  {
    to: "/app/orders",
    label: "Payments",
    mode: "business",
    privilegedOnly: true,
    feature: "cash_sales",
  },
  { to: "/app/portal", label: "Portal", mode: "business" },
  { to: "/app/agent", label: "Magic Coins", mode: "business", agentOrOwner: true },

  // Operations — the network itself.
  { to: "/app/sites", label: "Sites", mode: "operations" },
  { to: "/app/routers", label: "Routers", mode: "operations" },
  // Owner/admin only — Local Connector pairing is a privileged ops setup surface.
  { to: "/app/connectors", label: "Connectors", mode: "operations", privilegedOnly: true },
  { to: "/app/devices", label: "Devices & ports", mode: "operations" },
  { to: "/app/incidents", label: "Incidents", mode: "operations" },
  { to: "/app/fleet", label: "Fleet", mode: "operations" },
  {
    to: "/app/topology",
    label: "Site topology",
    mode: "operations",
    platformAdminOnly: true,
  },
  { to: "/app/live", label: "Live users", mode: "operations" },
  { to: "/app/syslog", label: "Syslog AI", mode: "operations" },
  { to: "/app/quick-setup", label: "Quick setup", mode: "operations", privilegedOnly: true },
  // Optional controller integrations are not required for the normal external-AP
  // workflow. Most operators keep APs in bridge mode and use the vendor's app.
  { to: "/app/access-points", label: "AP integrations", mode: "advanced" },
  // Physical Test Lab stays owner/admin only.
  { to: "/app/terminal", label: "Terminal", mode: "advanced", privilegedOnly: true },
  { to: "/app/deployments", label: "Deployments", mode: "advanced", privilegedOnly: true },
  { to: "/app/readiness", label: "Production readiness", mode: "advanced", privilegedOnly: true },
  // Physical hardware and the MCP policy stay owner/admin only.
  {
    to: "/app/test-lab/real",
    label: "Test lab (real routers)",
    mode: "advanced",
    privilegedOnly: true,
  },
  { to: "/app/test-lab/mcp", label: "MCP access", mode: "advanced", privilegedOnly: true },
  { to: "/app/scripts", label: "Scripts", mode: "advanced", primaryOnly: true },

  // Platform DB backups — Developer (platform_admins) only; Primary must not see a dead tab.
  { to: "/app/backups", label: "Backups", mode: "advanced", platformAdminOnly: true },
  { to: "/app/audit", label: "Audit log", mode: "advanced", primaryOnly: true },
  { to: "/app/users", label: "Users", mode: "advanced", primaryOnly: true },
  { to: "/app/tenants", label: "Tenants", mode: "advanced", primaryOnly: true },
  { to: "/app/usage", label: "Credit usage", mode: "advanced", primaryOnly: true },
  { to: "/app/i18n", label: "Language coverage", mode: "advanced", primaryOnly: true },

  // Always available, in every mode.
  { to: "/app/services", label: "Services", mode: "business", pinned: true },
  { to: "/app/manual", label: "User manual", mode: "business", pinned: true },
  { to: "/app/profile", label: "Profile", mode: "business", pinned: true },
];

/**
 * Primary destinations for the iOS-style bottom tab bar (GitHub mobile pattern).
 * Order is fixed; visibility still respects role filters.
 */
export const PRIMARY_TAB_PATHS = [
  "/app",
  "/app/revenue",
  "/app/vouchers",
  "/app/voucher-layouts",
] as const;

export type Roles = readonly string[] | null | undefined;
export type Features = readonly string[] | null | undefined;

function has(roles: Roles, role: string) {
  return (roles ?? []).includes(role);
}

function hasFeature(features: Features, feature: string | undefined) {
  return !!feature && (features ?? []).includes(feature);
}

export function primaryNavItems(
  roles: Roles,
  features?: Features,
  isPlatformAdmin = false,
  hasActivePlus = false,
  isTrial = false,
): NavItem[] {
  const visible = visibleNavItems(roles, features, isPlatformAdmin, hasActivePlus, isTrial);
  return PRIMARY_TAB_PATHS.map((to) => visible.find((i) => i.to === to)).filter(
    (i): i is NavItem => !!i,
  );
}

/** Every tab this account may see, regardless of mode. */
export function visibleNavItems(
  roles: Roles,
  features?: Features,
  isPlatformAdmin = false,
  hasActivePlus = false,
  isTrial = false,
): NavItem[] {
  const isPrimary = hasTenantPrimaryRole(roles);
  const agent = has(roles, "agent");
  const expired = has(roles, "expired");
  // Developer (Rank 1) outranks Primary (Rank 2) — platform-wide privileged access.
  const privileged = isPrimary || isPlatformAdmin;
  return NAV_ITEMS.filter((item) => {
    if (item.plusOnly && !hasActivePlus) return false;
    if (item.trialLocked && isTrial) return false;
    if (
      item.voucherPrintLayoutManagerOnly &&
      !canManageVoucherPrintLayouts(roles, isPlatformAdmin)
    ) {
      return false;
    }
    if (item.platformAdminOnly && !isPlatformAdmin) return false;
    if (item.primaryOnly && !privileged) return false;
    if (item.privilegedOnly && !privileged && !hasFeature(features, item.feature)) {
      return false;
    }
    if (item.agentOrOwner && !agent && !privileged) return false;
    if (expired && !privileged && !EXPIRED_ALLOWED.has(item.to) && !item.trialLocked) {
      return false;
    }
    return true;
  });
}

/** Tabs rendered for one mode: that mode's tabs plus the pinned account tabs. */
export function navItemsForMode(
  roles: Roles,
  mode: NavMode,
  features?: Features,
  isPlatformAdmin = false,
  hasActivePlus = false,
  isTrial = false,
): NavItem[] {
  return visibleNavItems(roles, features, isPlatformAdmin, hasActivePlus, isTrial).filter(
    (i) => i.pinned || i.mode === mode,
  );
}

/** Modes that have at least one non-pinned tab for this account. */
export function availableModes(
  roles: Roles,
  features?: Features,
  isPlatformAdmin = false,
  hasActivePlus = false,
  isTrial = false,
): NavMode[] {
  const items = visibleNavItems(roles, features, isPlatformAdmin, hasActivePlus, isTrial);
  return NAV_MODES.map((m) => m.id).filter((mode) =>
    items.some((i) => !i.pinned && i.mode === mode),
  );
}

/** Exact tabs (Home) match only themselves; the rest own their subtree. */
function matches(item: NavItem, clean: string) {
  if (item.exact) return clean === item.to;
  return clean === item.to || clean.startsWith(`${item.to}/`);
}

/**
 * Which mode owns a URL. Deep links keep working: the shell derives the active
 * mode from the current pathname instead of forcing a redirect.
 */
export function modeForPath(pathname: string): NavMode {
  const clean = pathname.replace(/\/+$/, "") || "/app";
  let best: NavItem | null = null;
  for (const item of NAV_ITEMS) {
    if (item.pinned) continue;
    if (matches(item, clean)) {
      if (!best || item.to.length > best.to.length) best = item;
    }
  }
  return best?.mode ?? "business";
}

/** True when the account can reach this URL through the navigation. */
export function canAccessPath(
  roles: Roles,
  pathname: string,
  features?: Features,
  isPlatformAdmin = false,
  hasActivePlus = false,
  isTrial = false,
): boolean {
  const clean = pathname.replace(/\/+$/, "") || "/app";
  return visibleNavItems(roles, features, isPlatformAdmin, hasActivePlus, isTrial).some((i) =>
    matches(i, clean),
  );
}

/**
 * Label for the compact mobile app bar: the deepest visible tab that owns the
 * current URL. Falls back to the shell title when nothing matches.
 */
export function navTitleForPath(
  roles: Roles,
  pathname: string,
  features?: Features,
  isPlatformAdmin = false,
  hasActivePlus = false,
  isTrial = false,
): string {
  const clean = pathname.replace(/\/+$/, "") || "/app";
  let best: NavItem | null = null;
  for (const item of visibleNavItems(roles, features, isPlatformAdmin, hasActivePlus, isTrial)) {
    // "/app" is the dashboard tab itself, never a prefix for its children.
    const hit =
      item.to === "/app" ? clean === "/app" : clean === item.to || clean.startsWith(`${item.to}/`);
    if (hit) {
      if (!best || item.to.length > best.to.length) best = item;
    }
  }
  return best?.label ?? "Dashboard";
}
