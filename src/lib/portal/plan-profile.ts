import { hotspotProfileName } from "./profile-name";
import { quotaBytesFromMb, quotaOnLoginScript } from "./default-plans";

export const PLAN_TAG = "mm-plan";

/** Match Magic-managed voucher plan profiles (REST may have comment; CLI fallback omits it). */
export function isManagedVoucherProfile(row: Record<string, string>): boolean {
  const comment = row["comment"] ?? "";
  if (comment.startsWith(`${PLAN_TAG}:`)) return true;
  const name = row["name"] ?? "";
  return name.startsWith("mm-") && name !== "mm-trial";
}

export type PlanProfileInput = {
  plan_key: string;
  duration_minutes?: number | null;
  device_limit?: number | null;
  rate_limit?: string | null;
  is_vip?: boolean;
  data_quota_mb?: number | null;
};

export function planProfileName(planKey: string): string {
  return hotspotProfileName(planKey);
}

export function planProfileBody(p: PlanProfileInput): Record<string, string> {
  const body: Record<string, string> = {
    name: planProfileName(p.plan_key),
    "shared-users": p.device_limit && p.device_limit > 0 ? String(p.device_limit) : "unlimited",
    "add-mac-cookie": "yes",
    comment: `${PLAN_TAG}:${p.plan_key}`,
  };
  if (!p.is_vip && p.duration_minutes) {
    // Session length is counted from first login and never renewed on re-login.
    body["session-timeout"] = `${p.duration_minutes}m`;
    body["mac-cookie-timeout"] = `${p.duration_minutes}m`;
  }
  if (!p.is_vip && p.rate_limit) body["rate-limit"] = p.rate_limit;
  if (!p.is_vip && p.data_quota_mb && p.data_quota_mb > 0) {
    body["on-login"] = quotaOnLoginScript(p.data_quota_mb);
  }
  return body;
}

export function hotspotUserCreateBody(input: {
  name: string;
  password: string;
  profile: string;
  comment?: string;
  dataQuotaMb?: number | null;
}): {
  name: string;
  password: string;
  profile: string;
  comment?: string;
  "limit-bytes-total"?: string;
} {
  const body: {
    name: string;
    password: string;
    profile: string;
    comment?: string;
    "limit-bytes-total"?: string;
  } = {
    name: input.name,
    password: input.password,
    profile: input.profile,
  };
  if (input.comment) body.comment = input.comment;
  if (input.dataQuotaMb && input.dataQuotaMb > 0) {
    body["limit-bytes-total"] = String(quotaBytesFromMb(input.dataQuotaMb));
  }
  return body;
}
