import { DEFAULT_DATA_QUOTA_PLAN_KEYS } from "./default-plans";

export const TIME_PLAN_KEYS = ["1d", "7d", "1m", "vip"] as const;

export type PlanGroupId = "time" | "data" | "custom";

export type GroupablePlan = {
  plan_key: string | null;
  is_vip?: boolean;
  data_quota_mb?: number | null;
  duration_minutes?: number | null;
  duration_label?: string | null;
  sort?: number;
};

/**
 * Keep the operator UI stable while older tenants are repaired. Plan keys are
 * the tenant-scoped identity; duplicate rows are historical records, not
 * separate products. The first row wins because listPlans orders by sort and
 * creation time before calling this helper.
 */
export function dedupeVoucherPlans<T extends GroupablePlan>(plans: readonly T[]): T[] {
  const seen = new Set<string>();
  return plans.filter((plan) => {
    const key = plan.plan_key?.trim().toLowerCase() ?? "";
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isArchivedVoucherPlan(plan: GroupablePlan): boolean {
  return plan.plan_key?.startsWith("archived-") ?? false;
}

const TIME_KEY_SET = new Set<string>(TIME_PLAN_KEYS);
const DATA_KEY_SET = new Set<string>(DEFAULT_DATA_QUOTA_PLAN_KEYS);

export function classifyVoucherPlan(p: GroupablePlan): PlanGroupId {
  const key = p.plan_key ?? "";
  if (DATA_KEY_SET.has(key)) return "data";
  if (TIME_KEY_SET.has(key) || p.is_vip) return "time";
  const quota = p.data_quota_mb ?? 0;
  const minutes = p.duration_minutes ?? 0;
  if (quota > 0 && minutes <= 0) return "data";
  if (minutes > 0 && quota <= 0) return "time";
  return "custom";
}

export function groupVoucherPlans<T extends GroupablePlan>(
  plans: readonly T[],
): Array<{ id: PlanGroupId; plans: T[] }> {
  const buckets: Record<PlanGroupId, T[]> = { time: [], data: [], custom: [] };
  for (const p of plans) buckets[classifyVoucherPlan(p)].push(p);
  for (const id of ["time", "data", "custom"] as const) {
    buckets[id].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  }
  return (["time", "data", "custom"] as const)
    .filter((id) => buckets[id].length > 0)
    .map((id) => ({ id, plans: buckets[id] }));
}

export function formatDataQuotaMb(mb: number): string {
  if (mb >= 1000 && mb % 1000 === 0) return `${mb / 1000} GB`;
  return `${mb} MB`;
}

export function planLimitLabel(p: GroupablePlan): string {
  if (p.is_vip) return "Unlimited";
  if ((p.data_quota_mb ?? 0) > 0) return formatDataQuotaMb(p.data_quota_mb!);
  const named = p.duration_label?.trim();
  if (named) return named;
  const minutes = p.duration_minutes ?? 0;
  if (minutes <= 0) return "Custom";
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? "1 day" : `${days} days`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "1 hour" : `${hours} hours`;
  }
  return `${minutes} min`;
}
