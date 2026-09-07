/**
 * RouterOS always creates a Hotspot user named `default-trial` when trial
 * login is enabled. It is the template for guest Connect (T-<MAC>) and
 * cannot be deleted (`failure: default trial user can not be removed`).
 * Keep it off the Vouchers table so staff never try to revoke it.
 */

export const DEFAULT_TRIAL_USERNAME = "default-trial";

export const DEFAULT_TRIAL_PROTECTED_MESSAGE =
  "RouterOS default-trial is required for guest Connect and cannot be removed.";

export const TRIAL_PROFILE_NAME = "mm-trial";

/** RouterOS 7.1+ Connect posts username `T-<MAC without colons>`. */
const TRIAL_MAC_USER = /^T-[0-9A-F]{12}$/i;

export function isDefaultTrialUser(name: string | null | undefined): boolean {
  return (name ?? "").trim().toLowerCase() === DEFAULT_TRIAL_USERNAME;
}

export function hotspotUserName(user: unknown): string | undefined {
  if (!user || typeof user !== "object") return undefined;
  const name = (user as { name?: unknown }).name;
  return typeof name === "string" ? name : undefined;
}

export function hotspotUserProfile(user: unknown): string | undefined {
  if (!user || typeof user !== "object") return undefined;
  const profile = (user as { profile?: unknown }).profile;
  return typeof profile === "string" ? profile : undefined;
}

/** Guest trial sessions are not sellable stock. */
export function isHotspotTrialUser(user: unknown): boolean {
  const name = hotspotUserName(user);
  if (isDefaultTrialUser(name)) return true;
  if (name && TRIAL_MAC_USER.test(name.trim())) return true;
  return (hotspotUserProfile(user) ?? "").trim().toLowerCase() === TRIAL_PROFILE_NAME;
}

export function isSellableVoucherUser(user: unknown): boolean {
  return !isHotspotTrialUser(user);
}

export function sellableVoucherUsers<T>(users: readonly T[]): T[] {
  return users.filter((u) => isSellableVoucherUser(u));
}
