/** Why a forced (non-intentional) auth clear happened. */
export type ForcedSignOutReason = "expired" | "remote" | "ended";

/**
 * Classify a forced sign-out so we don't blame "another device" when the
 * access/refresh token simply expired (or a refresh failed at expiry).
 *
 * Heuristic: if we still had a known session with more than `skewSeconds` of
 * access-token life left, a sudden SIGNED_OUT is treated as a remote revoke
 * (e.g. single-session-per-user). Otherwise it is expiry / ended.
 */
export function classifyForcedSignOut(input: {
  event: string;
  /** Unix seconds (`session.expires_at`) from the last known session. */
  previousExpiresAt: number | null;
  nowSec?: number;
  /** Access-token life still remaining that counts as "not expired yet". */
  skewSeconds?: number;
}): ForcedSignOutReason {
  const now = input.nowSec ?? Math.floor(Date.now() / 1000);
  const skew = input.skewSeconds ?? 120;

  // A null TOKEN_REFRESHED is a failed/cleared refresh — never "another device".
  if (input.event === "TOKEN_REFRESHED") return "expired";

  if (input.event !== "SIGNED_OUT") return "ended";

  const exp = input.previousExpiresAt;
  if (exp == null || !Number.isFinite(exp)) return "ended";

  // Still had meaningful access-token life → likely revoked elsewhere.
  if (exp - now > skew) return "remote";
  return "expired";
}

export function forcedSignOutMessage(reason: ForcedSignOutReason): string {
  switch (reason) {
    case "remote":
      return "You were signed out because this account was used on another device.";
    case "expired":
      return "Your session expired. Please sign in again.";
    default:
      return "Your session ended. Please sign in again.";
  }
}
