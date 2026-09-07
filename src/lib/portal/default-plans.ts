/**
 * Built-in voucher plan templates seeded for every account.
 * Time plans (1d / 7d / 1m / vip) stay in SQL `seed_owner_defaults`.
 * Data-quota plans are added here so the app can also fill gaps on existing
 * tenants without waiting for a new-user trigger.
 */

export type DefaultVoucherPlan = {
  plan_key: string;
  label: string;
  duration_label: string;
  duration_minutes: number | null;
  device_limit: number;
  rate_limit: string | null;
  price_mmk: number;
  price_label: string;
  is_vip: boolean;
  sort: number;
  data_quota_mb: number | null;
  validity_days: number | null;
  status: "active";
};

const DATA_QUOTA_RATE = "5M/5M";
const DATA_QUOTA_VALIDITY_DAYS = 30;
const DATA_QUOTA_SORT_START = 10;

/** Marketing sizes the operator asked to ship as defaults. */
export const DEFAULT_DATA_QUOTA_SIZES = [
  { plan_key: "500mb", label: "500 MB", mb: 500, price_mmk: 500 },
  { plan_key: "1gb", label: "1 GB", mb: 1000, price_mmk: 1000 },
  { plan_key: "2gb", label: "2 GB", mb: 2000, price_mmk: 2000 },
  { plan_key: "3gb", label: "3 GB", mb: 3000, price_mmk: 2500 },
  { plan_key: "5gb", label: "5 GB", mb: 5000, price_mmk: 4000 },
  { plan_key: "7gb", label: "7 GB", mb: 7000, price_mmk: 5500 },
  { plan_key: "10gb", label: "10 GB", mb: 10000, price_mmk: 7000 },
] as const;

export const DEFAULT_DATA_QUOTA_PLAN_KEYS = DEFAULT_DATA_QUOTA_SIZES.map((s) => s.plan_key);

export const DEFAULT_DATA_QUOTA_PLANS: DefaultVoucherPlan[] = DEFAULT_DATA_QUOTA_SIZES.map(
  (size, i) => ({
    plan_key: size.plan_key,
    label: size.label,
    duration_label: size.label,
    duration_minutes: null,
    device_limit: 1,
    rate_limit: DATA_QUOTA_RATE,
    price_mmk: size.price_mmk,
    price_label: `${size.price_mmk} MMK`,
    is_vip: false,
    sort: DATA_QUOTA_SORT_START + i,
    data_quota_mb: size.mb,
    validity_days: DATA_QUOTA_VALIDITY_DAYS,
    status: "active",
  }),
);

export function missingDefaultDataQuotaPlans(
  existingKeys: Array<string | null | undefined>,
): DefaultVoucherPlan[] {
  const have = new Set(existingKeys.filter((k): k is string => Boolean(k)));
  return DEFAULT_DATA_QUOTA_PLANS.filter((p) => !have.has(p.plan_key));
}

/** RouterOS `limit-bytes-total` is an integer byte count. */
export function quotaBytesFromMb(mb: number): number {
  return Math.max(0, Math.trunc(mb)) * 1024 * 1024;
}

/**
 * First-login safety net: even codes created outside issuePlanVouchers pick up
 * the profile's data cap. Re-login keeps the same total (bytes already used
 * still count against it).
 */
export function quotaOnLoginScript(mb: number): string {
  return `/ip hotspot user set [find name=$user] limit-bytes-total=${quotaBytesFromMb(mb)}`;
}
