import { hasTenantPrimaryRole } from "../app-role";
import { isTrialAccount } from "../product-terminology";

// Account tiers and expiry. Device headroom is granted only through the
// owner-approved allowance workflow or a dedicated feature key.
//
// Pure logic: no database, no network. The server functions in
// `src/lib/services.functions.ts` are the only place these results are
// written, so a client can never submit a tier, an expiry or a quota.

export type ServiceKey = "monthly" | "annual";
export type Tier = "trial" | "monthly" | "annual";

/** Quota-bearing device categories. */
export const DEVICE_KINDS = ["routers", "controllers", "sites"] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

/** Emerald / Sapphire base pass — same limits for monthly and annual. */
export const BASE_DEVICE_QUOTA: Record<DeviceKind, number> = {
  routers: 1,
  sites: 3,
  controllers: 15,
};

export interface ServiceOffer {
  key: ServiceKey;
  /** Exact user-facing label. */
  label: "Monthly" | "Annual";
  kind: "tier";
  duration_days: number | null;
  duration_label: string;
  price_mmk: number;
  standard_price_mmk: number | null;
  /** Non-zero when the purchase changes device quota. */
  quota_delta: number;
  summary: string;
  entitlements: string[];
}

export interface PromoPrices {
  active: boolean;
  monthly_promo_mmk: number;
  monthly_standard_mmk: number;
  annual_promo_mmk: number;
  annual_standard_mmk: number;
}

const BASE_QUOTA_COPY = "1 router, 3 sites and 15 optional AP integrations";

/**
 * The developer's catalogue. Monthly/Annual pricing follows the launch promo
 * table so the Services tab and the public pricing page never disagree.
 * During the grand opening window, Monthly and Annual are 30% off standard.
 */
export function serviceCatalog(promo: PromoPrices): ServiceOffer[] {
  const on = promo.active;
  return [
    {
      key: "monthly",
      label: "Monthly",
      kind: "tier",
      duration_days: 30,
      duration_label: "30 days",
      price_mmk: on ? promo.monthly_promo_mmk : promo.monthly_standard_mmk,
      standard_price_mmk: on ? promo.monthly_standard_mmk : null,
      quota_delta: 0,
      summary: "Emerald — keeps the account active for another 30 days.",
      entitlements: [
        "Full management access for 30 days",
        BASE_QUOTA_COPY,
        "Hotspot plans, vouchers and AI scans",
      ],
    },
    {
      key: "annual",
      label: "Annual",
      kind: "tier",
      duration_days: 365,
      duration_label: "365 days",
      price_mmk: on ? promo.annual_promo_mmk : promo.annual_standard_mmk,
      standard_price_mmk: on ? promo.annual_standard_mmk : null,
      quota_delta: 0,
      summary: "Sapphire — a full year on the same device quota as Emerald.",
      entitlements: [
        "Full management access for 365 days",
        BASE_QUOTA_COPY,
        "Everything in Monthly, billed once",
        "Priority support and onboarding",
      ],
    },
  ];
}

export function offerFor(promo: PromoPrices, key: ServiceKey): ServiceOffer {
  const offer = serviceCatalog(promo).find((o) => o.key === key);
  if (!offer) throw new Error(`Unknown service: ${key}`);
  return offer;
}

// -------------------------------------------------------------- entitlement --

export interface Entitlement {
  tier: Tier;
  tier_expires_at: string | null;
  plus: boolean;
}

export interface AccountStatus extends Entitlement {
  expired: boolean;
  /** True only during the account's original seven-day client access window. */
  trial: boolean;
  /** Milliseconds left; 0 once expired, null when the account never expires. */
  remaining_ms: number | null;
  remaining_label: string;
  /** Owners never expire. */
  never_expires: boolean;
  quota: Record<DeviceKind, number>;
}

const DAY = 24 * 60 * 60 * 1000;

export function quotaFor(_legacyPlus = false): Record<DeviceKind, number> {
  return {
    ...BASE_DEVICE_QUOTA,
  };
}

export function remainingLabel(ms: number | null): string {
  if (ms == null) return "No expiry";
  if (ms <= 0) return "Expired";
  const days = Math.floor(ms / DAY);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} left`;
  const hours = Math.max(1, Math.floor(ms / (60 * 60 * 1000)));
  return `${hours} hour${hours === 1 ? "" : "s"} left`;
}

/**
 * Every non-owner role carries an expiry. Primary café owners and Rank 1
 * Developers (`platform_admins`) are explicitly exempt.
 */
export function accountStatus(input: {
  roles: readonly string[];
  entitlement?: Partial<Entitlement> | null;
  /** Used with expiry to distinguish the one-time trial from active User access. */
  created_at?: string | null;
  now?: number;
  isPlatformAdmin?: boolean;
}): AccountStatus {
  const now = input.now ?? Date.now();
  const owner = hasTenantPrimaryRole(input.roles) || Boolean(input.isPlatformAdmin);
  const tier = (input.entitlement?.tier ?? "trial") as Tier;
  // Kept in the result shape for backwards-compatible clients, but the
  // retired add-on can no longer grant an entitlement.
  const plus = false;
  const expiresAt = input.entitlement?.tier_expires_at ?? null;
  const at = expiresAt ? Date.parse(expiresAt) : NaN;
  const hasExpiry = !owner && Number.isFinite(at);
  const remaining = hasExpiry ? Math.max(0, at - now) : null;
  const expired = !owner && (input.roles.includes("expired") || (hasExpiry && at <= now));
  const trial = isTrialAccount({
    roles: input.roles,
    tier,
    expired,
    never_expires: owner,
    created_at: input.created_at,
    expires_at: expiresAt,
    now,
  });

  return {
    tier,
    tier_expires_at: expiresAt,
    plus,
    expired,
    trial,
    never_expires: owner,
    remaining_ms: expired ? 0 : remaining,
    remaining_label: owner ? "No expiry" : expired ? "Expired" : remainingLabel(remaining),
    quota: quotaFor(plus),
  };
}

/** Expired accounts keep only the surfaces they need to renew. */
export const RENEWAL_ALLOWED_PATHS: ReadonlySet<string> = new Set([
  "/app",
  "/app/profile",
  "/app/services",
  "/app/manual",
]);

export function canPerformPrivilegedAction(status: {
  expired: boolean;
  never_expires?: boolean;
}): boolean {
  return Boolean(status.never_expires) || !status.expired;
}

// ---------------------------------------------------------------- activation --

export interface Activation {
  tier: Tier;
  tier_expires_at: string | null;
  plus: boolean;
  quota: Record<DeviceKind, number>;
  /** Role the account should hold after activation. */
  role: "client";
}

/**
 * What an approval does. Renewals extend from the later of "now" and the
 * current expiry so a customer never loses paid days.
 */
export function computeActivation(input: {
  service: ServiceKey;
  current: Entitlement;
  now?: number;
  /** Owner-granted allowances already above the base are preserved. */
  currentQuota?: Partial<Record<DeviceKind, number>>;
}): Activation {
  const now = input.now ?? Date.now();
  const current = input.current;
  const currentExpiry = current.tier_expires_at ? Date.parse(current.tier_expires_at) : NaN;
  const from = Number.isFinite(currentExpiry) ? Math.max(now, currentExpiry) : now;

  let tier = current.tier;
  let expires = current.tier_expires_at;
  const plus = false;
  const days = input.service === "monthly" ? 30 : 365;
  tier = input.service;
  expires = new Date(from + days * DAY).toISOString();

  const base = quotaFor(plus);
  const quota = { ...base };
  for (const kind of DEVICE_KINDS) {
    const existing = input.currentQuota?.[kind];
    // Never shrink an allowance the owner raised by hand.
    if (typeof existing === "number" && existing > quota[kind]) quota[kind] = existing;
  }

  return { tier, tier_expires_at: expires, plus, quota, role: "client" };
}

/** Pending requests must not change anything. */
export function entitlementAfterPending(current: Entitlement): Entitlement {
  return { ...current };
}

/** Rejection leaves the entitlement untouched. */
export function entitlementAfterRejection(current: Entitlement): Entitlement {
  return { ...current };
}
