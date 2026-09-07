/**
 * Shop-floor operator permissions granted from Users, same pattern as portal
 * guest modes: Rank 2 Users (owner/client) always have every feature; MikroMagic Agent /
 * site_manager get role defaults plus per-user extras (adds, never subtracts).
 *
 * Vouchers, portal deploy, and own-router configuration are always on for every
 * active role. Pending / expired accounts are still blocked by requireNotExpired
 * on writes. High-impact operations such as reboot and Multi-WAN remain grant-gated.
 * Terminal, raw REST, real test lab, MCP, Users, backups, audit, scripts,
 * credit usage, i18n and device-quota approval stay primary-user only.
 */

import { hasTenantPrimaryRole } from "./app-role";
import { PORTAL_GRANT_ROLES, type PortalGrantRole } from "./portal/modes";

export const GRANTABLE_FEATURES = [
  "vouchers",
  "portal_deploy",
  "cash_sales",
  "bank_edit",
  "router_config",
  "reboot",
  "alerts",
  "syslog_ai",
  "poe",
] as const;
export type GrantableFeature = (typeof GRANTABLE_FEATURES)[number];

export const FEATURE_GRANT_ROLES = PORTAL_GRANT_ROLES;
export type FeatureGrantRole = PortalGrantRole;

export const FEATURE_META: Record<GrantableFeature, { label: string; hint: string }> = {
  vouchers: {
    label: "Vouchers & plans",
    hint: "Always on for every active account. Create plans, issue codes, push profiles to the router.",
  },
  portal_deploy: {
    label: "Portal deploy",
    hint: "Always on for every active account. Publish or roll back Hotspot HTML on a live router.",
  },
  cash_sales: {
    label: "Payments / cash",
    hint: "Open the Payments tab: orders, cash sales, refunds, receipts.",
  },
  bank_edit: {
    label: "Bank details",
    hint: "Edit the guest-checkout bank boxes (full account numbers).",
  },
  router_config: {
    label: "Router configuration",
    hint: "Always on for every active account on its own router. Apply Gateway Bootstrap and HotSpot network, DHCP, bridge, and Wi-Fi configuration.",
  },
  reboot: {
    label: "Reboot / Multi-WAN",
    hint: "Reboot a board and apply Multi-WAN failover.",
  },
  alerts: {
    label: "Alert rules",
    hint: "Change incident alert rules and see in-app notifications.",
  },
  syslog_ai: {
    label: "Syslog AI",
    hint: "Translate RouterOS logs. Magic Hub boards stream without a second token.",
  },
  poe: {
    label: "PoE power",
    hint: "Power-cycle switch ports and delete managed devices.",
  },
};

/**
 * Always granted to every active account for its own tenant router. Owners
 * still manage the other shop-floor switches on Users; expired / pending stay
 * blocked, and high-impact operations remain grant-gated.
 */
export const FLOOR_FEATURES = ["vouchers", "portal_deploy", "router_config"] as const;
export type FloorFeature = (typeof FLOOR_FEATURES)[number];

export function isFloorFeature(value: unknown): value is FloorFeature {
  return typeof value === "string" && (FLOOR_FEATURES as readonly string[]).includes(value);
}

export const FEATURE_DENIED: Record<GrantableFeature, string> = {
  vouchers:
    "Your account cannot manage vouchers and hotspot plans. Expired accounts cannot push profiles.",
  portal_deploy:
    "Your account cannot deploy the captive portal. Expired accounts cannot publish Hotspot HTML.",
  cash_sales:
    "Your account cannot open Payments. Ask the app owner to grant Payments / cash on Users.",
  bank_edit:
    "Your account cannot edit bank details. Ask the app owner to grant Bank details on Users.",
  router_config:
    "Your account cannot change router network or HotSpot configuration. Ask the app owner to grant Router configuration on Users.",
  reboot:
    "Your account cannot reboot routers or apply Multi-WAN. Ask the app owner to grant Reboot / Multi-WAN on Users.",
  alerts:
    "Your account cannot change alert rules. Ask the app owner to grant Alert rules on Users.",
  syslog_ai:
    "Your account cannot mint syslog tokens or run AI translation. Ask the app owner to grant Syslog AI on Users.",
  poe: "Your account cannot power-cycle ports. Ask the app owner to grant PoE power on Users.",
};

export function isGrantableFeature(value: unknown): value is GrantableFeature {
  return typeof value === "string" && (GRANTABLE_FEATURES as readonly string[]).includes(value);
}

export function resolveAllowedFeatures(input: {
  roles: readonly string[];
  userGrants: readonly string[];
  roleDefaults: ReadonlyArray<{ role: string; feature: string }>;
  isPlatformAdmin?: boolean;
}): GrantableFeature[] {
  const roles = input.roles ?? [];
  if (hasTenantPrimaryRole(roles) || input.isPlatformAdmin) {
    return [...GRANTABLE_FEATURES];
  }
  if (roles.includes("expired") || roles.includes("pending") || roles.length === 0) {
    return [];
  }

  const allowed = new Set<GrantableFeature>(FLOOR_FEATURES);
  for (const g of input.userGrants) {
    if (isGrantableFeature(g)) allowed.add(g);
  }
  for (const row of input.roleDefaults) {
    if (!roles.includes(row.role)) continue;
    if (isGrantableFeature(row.feature)) allowed.add(row.feature);
  }
  return GRANTABLE_FEATURES.filter((f) => allowed.has(f));
}

export function canOperateFeature(
  feature: GrantableFeature,
  input: {
    roles: readonly string[];
    userGrants: readonly string[];
    roleDefaults: ReadonlyArray<{ role: string; feature: string }>;
    isPlatformAdmin?: boolean;
  },
): boolean {
  return resolveAllowedFeatures(input).includes(feature);
}

/** Client-side check against getMe().features (already resolved). */
export function meHasFeature(
  me:
    | {
        roles?: readonly string[] | null;
        features?: readonly string[] | null;
        isPlatformAdmin?: boolean;
      }
    | null
    | undefined,
  feature: GrantableFeature,
): boolean {
  if (me?.isPlatformAdmin) return true;
  const roles = me?.roles ?? [];
  if (roles.includes("expired") || roles.includes("pending")) return false;
  if (hasTenantPrimaryRole(roles)) return true;
  if (isFloorFeature(feature) && roles.length > 0) return true;
  return (me?.features ?? []).includes(feature);
}
