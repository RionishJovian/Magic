import { isHotspotTrialUser, hotspotUserName } from "./hotspot-voucher-users";

/** Router accounts that can never represent sellable voucher inventory. */
const RESERVED_USERNAMES = new Set(["admin", "player"]);

export function normalizeVoucherCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isLegacyVoucherImportExcluded(user: unknown): boolean {
  const name = hotspotUserName(user);
  return !name || isHotspotTrialUser(user) || RESERVED_USERNAMES.has(name.trim().toLowerCase());
}

/** Existing RouterOS usage is historic state, not evidence of app revenue. */
export function hasHistoricRouterUsage(user: Record<string, string>): boolean {
  const uptime = (user.uptime ?? "").trim().toLowerCase();
  return Boolean(uptime && uptime !== "0" && uptime !== "0s" && uptime !== "none");
}
