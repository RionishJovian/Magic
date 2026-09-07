/**
 * Enable RouterOS 7.1+ Hotspot trial on the profiles receiving a portal deploy.
 * Creates/updates the mm-trial user profile and sets login-by=…,trial on Hotspot profiles.
 *
 * Trial users are named T-<MAC> by RouterOS. While that user remains after the
 * session ends, the same device cannot start another trial — that is the
 * natural cooldown. Operators can remove idle T-* users from WinBox/Terminal
 * or wait for manual cleanup; guest UI shows the configured cooldown hours.
 *
 * RouterOS also keeps a built-in `default-trial` user that cannot be deleted.
 * The Vouchers table hides it (`src/lib/hotspot-voucher-users.ts`).
 */

import { normalizeRestList } from "../ros-rest-list";

export const TRIAL_PROFILE_NAME = "mm-trial";

/** Product default for Hotspot trial (Quick Config + portal when site setting unset). */
export const TRIAL_DEFAULT_MINUTES = 10;
export const TRIAL_DEFAULT_RATE_LIMIT = "1.5M/1.5M";

type Conn = Parameters<typeof import("../mikrotik.server").routerAPI.hotspotProfiles>[0];

export function mergeLoginBy(existing: string | undefined): string {
  const parts = (existing ?? "http-chap,http-pap")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.includes("http-chap")) parts.unshift("http-chap");
  if (!parts.includes("http-pap")) parts.push("http-pap");
  if (!parts.includes("trial")) parts.push("trial");
  return [...new Set(parts)].join(",");
}

/**
 * Configure Hotspot trial for temporary guest access (seller / pay_info Connect).
 * Safe to call on every hybrid/commerce portal deploy.
 */
export async function ensureHotspotTrialAccess(
  conn: Conn,
  input: {
    hotspotProfileIds: string[];
    trialMinutes?: number;
    rateLimit?: string;
  },
): Promise<{ trialProfile: string; profilesUpdated: number }> {
  const { routerAPI } = await import("../mikrotik.server");
  const minutes = Math.max(
    1,
    Math.min(120, Math.round(input.trialMinutes ?? TRIAL_DEFAULT_MINUTES)),
  );
  const rateLimit = input.rateLimit ?? TRIAL_DEFAULT_RATE_LIMIT;
  const quoteCli = (s: string) => `"${s.replace(/"/g, '\\"')}"`;

  const userProfiles = normalizeRestList<Record<string, string>>(await routerAPI.profiles(conn));
  const existing = userProfiles.find(
    (p: Record<string, string>) => (p.name ?? "") === TRIAL_PROFILE_NAME,
  );

  const profileBody: Record<string, string> = {
    name: TRIAL_PROFILE_NAME,
    "session-timeout": `${minutes}m`,
    "shared-users": "1",
    "rate-limit": rateLimit,
    "add-mac-cookie": "yes",
    "mac-cookie-timeout": `${minutes}m`,
    comment: `mm-trial Portal temp access ${minutes}m (ROS 7.1+)`,
  };

  const hotspotProfiles = normalizeRestList<Record<string, string>>(
    await routerAPI.hotspotProfiles(conn),
  );

  const desiredProfiles = input.hotspotProfileIds
    .map((id) => hotspotProfiles.find((p) => p[".id"] === id) ?? null)
    .filter(Boolean) as Array<Record<string, string>>;

  const fallbackLoginByById = Object.fromEntries(
    (desiredProfiles ?? []).map((p) => [p[".id"], mergeLoginBy(p["login-by"])]),
  ) as Record<string, string>;

  let profilesUpdated = 0;
  try {
    // Preferred path: REST PATCH/POST for profiles.
    if (existing?.[".id"]) {
      await routerAPI.patchUserProfile(conn, existing[".id"], profileBody);
    } else {
      await routerAPI.addUserProfile(conn, profileBody);
    }

    for (const id of input.hotspotProfileIds) {
      const row = hotspotProfiles.find((p) => p[".id"] === id);
      if (!row) continue;
      await routerAPI.patchHotspotProfile(conn, id, {
        "login-by": mergeLoginBy(row["login-by"]),
        "trial-uptime": `${minutes}m`,
        "trial-user-profile": TRIAL_PROFILE_NAME,
      });
      profilesUpdated += 1;
    }

    return { trialProfile: TRIAL_PROFILE_NAME, profilesUpdated };
  } catch (e) {
    // If RouterOS rejects the REST update with a misleading “no such command …”
    // error, fall back to executing known-good CLI syntax via /execute.
    // This avoids fragile REST method/path combinations across ROS builds.
    const msg = e instanceof Error ? e.message : String(e);

    const setTrialUserProfileScript = [
      `:if ([:len [/ip hotspot user profile find where name=${quoteCli(TRIAL_PROFILE_NAME)}]] > 0) do={`,
      `/ip hotspot user profile set [find where name=${quoteCli(TRIAL_PROFILE_NAME)}] session-timeout=${minutes}m shared-users=1 rate-limit=${rateLimit} add-mac-cookie=yes mac-cookie-timeout=${minutes}m`,
      `} else={`,
      `/ip hotspot user profile add name=${quoteCli(TRIAL_PROFILE_NAME)} session-timeout=${minutes}m shared-users=1 rate-limit=${rateLimit} add-mac-cookie=yes mac-cookie-timeout=${minutes}m`,
      `};`,
    ].join(" ");

    await routerAPI.execScript(conn, setTrialUserProfileScript);

    for (const id of input.hotspotProfileIds) {
      const loginBy = fallbackLoginByById[id] ?? mergeLoginBy(undefined);
      const setHotspotProfileScript = [
        `/ip hotspot profile set [find where .id=${quoteCli(id)}]`,
        `login-by=${loginBy}`,
        `trial-uptime=${minutes}m`,
        `trial-user-profile=${TRIAL_PROFILE_NAME}`,
      ].join(" ");

      await routerAPI.execScript(conn, setHotspotProfileScript);
      profilesUpdated += 1;
    }

    return { trialProfile: TRIAL_PROFILE_NAME, profilesUpdated };
  }

  return { trialProfile: TRIAL_PROFILE_NAME, profilesUpdated };
}
