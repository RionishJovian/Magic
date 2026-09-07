import { hasTenantPrimaryRole } from "./app-role";

/**
 * Canonical MikroTik Magic product terminology (user-facing copy).
 *
 * Account ranks (1 = highest access):
 * 1. Developer — Team Magic internal (platform_admins)
 * 2. Primary — privileged tenant billing / admin row (user_roles.primary)
 * 3. User — standard tenant account (user_roles.client)
 * 4. MikroMagic Agent — marketing agent (user_roles.agent)
 * 5. Expired — trial / tier pass lapsed (user_roles.expired)
 * 6. Trial — 7-day app access with User permissions (client + trial expiry)
 *
 * Guest — hotspot end user on a phone (captive portal, not ranked here).
 *
 * The legacy `admin` app_role is removed — do not reference it in app code.
 * Rank 2 Primary and Rank 3 User are distinct: Primary is the tenant billing
 * row; User is normal/standard client access under that tenant.
 * `owner_id` columns are unchanged — they still point at the tenant primary user id.
 */
export const ROLE_LABEL = {
  dev: "Developer",
  primary: "Primary",
  user: "User",
  agent: "MikroMagic Agent",
  expired: "Expired",
  trial: "Trial",
  guest: "Guest",
} as const;

export type AccountRankKey = "developer" | "primary" | "user" | "agent" | "expired" | "trial";

export const ACCOUNT_RANKS: ReadonlyArray<{
  rank: number;
  key: AccountRankKey;
  label: string;
  blurb: string;
}> = [
  {
    rank: 1,
    key: "developer",
    label: ROLE_LABEL.dev,
    blurb:
      "Highest rank — platform-wide access across every café, above Primary. Team Magic internal only.",
  },
  {
    rank: 2,
    key: "primary",
    label: ROLE_LABEL.primary,
    blurb:
      "Privileged café access — billing, user management, scripts, and full site control for your tenant.",
  },
  {
    rank: 3,
    key: "user",
    label: ROLE_LABEL.user,
    blurb: "Standard tenant access — routers, vouchers, portal, and live sessions for your sites.",
  },
  {
    rank: 4,
    key: "agent",
    label: ROLE_LABEL.agent,
    blurb: "Earns Magic Coins and refers new accounts under your agent profile.",
  },
  {
    rank: 5,
    key: "expired",
    label: ROLE_LABEL.expired,
    blurb: "Trial or Tier Pass expired — renew on Services to manage from the cloud again.",
  },
  {
    rank: 6,
    key: "trial",
    label: ROLE_LABEL.trial,
    blurb: "Seven days of User-level app access while you evaluate MikroTik Magic.",
  },
] as const;

/** @deprecated Use ROLE_LABEL.primary / ACCOUNT_RANKS primary blurb. */
export const BUSINESS_OWNER_BLURB = ACCOUNT_RANKS[1]!.blurb;

/** Rank 2 Primary — privileged tenant billing row. */
export const PRIMARY_ROLE_BLURB = ACCOUNT_RANKS[1]!.blurb;

/** Rank 3 User — standard tenant client. */
export const USER_ROLE_BLURB = ACCOUNT_RANKS[2]!.blurb;

/** Team Magic internal operator — cross-tenant platform access. */
export const DEVELOPER_BLURB = ACCOUNT_RANKS[0]!.blurb;

const RANK_BY_KEY = Object.fromEntries(ACCOUNT_RANKS.map((r) => [r.key, r])) as Record<
  AccountRankKey,
  (typeof ACCOUNT_RANKS)[number]
>;

export function accountRankMeta(key: AccountRankKey) {
  return RANK_BY_KEY[key];
}

export function isTrialAccount(input: {
  roles: readonly string[];
  tier?: string | null;
  expired?: boolean;
  never_expires?: boolean;
  /** Profile creation time establishes the one-time trial window. */
  created_at?: string | null;
  /** The active client/entitlement expiry to compare with that window. */
  expires_at?: string | null;
  now?: number;
}): boolean {
  const roles = input.roles ?? [];
  if (input.never_expires || hasTenantPrimaryRole(roles)) return false;
  if (roles.includes("expired") || input.expired) return false;
  if (!roles.includes("client")) return false;
  if ((input.tier ?? "trial") !== "trial") return false;

  const expiresAt = input.expires_at ? Date.parse(input.expires_at) : Number.NaN;
  if (!Number.isFinite(expiresAt)) return false;
  if (expiresAt <= (input.now ?? Date.now())) return false;

  const createdAt = input.created_at ? Date.parse(input.created_at) : Number.NaN;
  // Profiles created before this status rule may not have a usable timestamp.
  // Preserve their existing trial classification until they receive a paid tier.
  if (!Number.isFinite(createdAt)) return true;

  return expiresAt <= createdAt + 7 * 24 * 60 * 60 * 1000;
}

/** Product rank for profile copy and badges. */
export function resolveAccountRank(input: {
  roles: readonly string[];
  isPlatformAdmin?: boolean;
  tier?: string | null;
  expired?: boolean;
  never_expires?: boolean;
  created_at?: string | null;
  expires_at?: string | null;
  now?: number;
  /** Canonical result from accountStatus when the caller already has it. */
  trial?: boolean;
}): AccountRankKey {
  const roles = input.roles ?? [];
  if (input.isPlatformAdmin) return "developer";
  if (roles.includes("expired") || input.expired) return "expired";
  if (hasTenantPrimaryRole(roles)) return "primary";
  const trial = input.trial ?? isTrialAccount(input);
  if (roles.includes("client") && !trial) return "user";
  if (roles.includes("agent")) return "agent";
  if (trial) return "trial";
  return "user";
}

/** True when the account holds the primary role (tenant billing row). */
export function isTenantOwner(roles: readonly string[] | null | undefined): boolean {
  return hasTenantPrimaryRole(roles);
}

/** @deprecated Use isTenantOwner — product label is now Primary (Rank 2). */
export function isBusinessOwner(roles: readonly string[] | null | undefined): boolean {
  return isTenantOwner(roles);
}

/** Rank 3 User — standard client only (not primary / trial / expired / agent-only). */
export function isTenantUser(roles: readonly string[] | null | undefined): boolean {
  const list = roles ?? [];
  if (hasTenantPrimaryRole(list)) return false;
  return list.includes("client");
}
