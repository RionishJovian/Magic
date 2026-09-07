import { buildWebfigLauncher, type WebfigLauncher, type WebfigRow } from "./webfig";
import type { DatabaseClient } from "./database.types";
import { WEBFIG_LOCKED_REASON, canLaunchWebfig } from "./webfig-access";
import { WEBFIG_LAUNCH_TTL_MS, signWebfigToken } from "./webfig-auth.server";

function signedHubLauncher(launcher: WebfigLauncher, row: WebfigRow): WebfigLauncher {
  if (launcher.via !== "hub" || !launcher.url || !row.cloud_peer_id) return launcher;
  const secret = (process.env.VPS_ROUTER_API_SIGNING_SECRET ?? "").trim();
  if (!secret) {
    return {
      url: null,
      via: "unavailable",
      username: row.username,
      reason: "WebFig through Magic Hub requires the configured Hub signing secret.",
    };
  }
  const expires = String(Date.now() + WEBFIG_LAUNCH_TTL_MS);
  const signature = signWebfigToken(secret, "webfig:launch", row.cloud_peer_id, expires);
  const url = new URL(launcher.url);
  url.searchParams.set("expires", expires);
  url.searchParams.set("signature", signature);
  return {
    ...launcher,
    url: url.toString(),
    reason: "Opens a short-lived, signed WebFig session through Magic Hub.",
  };
}

export async function getWebfigLaunchAccess(
  supabase: DatabaseClient,
  userId: string,
): Promise<{ allowed: boolean }> {
  const { getRoles, isPlatformAdminUser } = await import("./guards.server");
  const [roles, isPlatformAdmin] = await Promise.all([
    getRoles(supabase, userId),
    isPlatformAdminUser(supabase, userId),
  ]);
  if (canLaunchWebfig(roles, isPlatformAdmin)) return { allowed: true };

  const { data: hasKey, error } = await supabase.rpc("has_active_webfig_unlock_key");
  if (error) throw new Error(`Could not verify the WebFig unlock key: ${error.message}`);
  return { allowed: hasKey === true };
}

export async function requireWebfigLaunchAccess(
  supabase: DatabaseClient,
  userId: string,
): Promise<void> {
  const { allowed } = await getWebfigLaunchAccess(supabase, userId);
  if (!allowed) throw new Error(WEBFIG_LOCKED_REASON);
}

export async function tryHubPublicOrigin(): Promise<string | null> {
  try {
    const { isVpsConfigured, hubPublicOrigin } = await import("./wireguard/vps.server");
    if (!isVpsConfigured()) return null;
    return hubPublicOrigin();
  } catch {
    return null;
  }
}

export async function webfigLaunchersForRows(
  supabase: DatabaseClient,
  rows: WebfigRow[],
  options: { locked?: boolean } = {},
): Promise<Map<string, WebfigLauncher | null>> {
  if (options.locked) {
    return new Map(
      rows.map((row) => [
        row.id,
        {
          url: null,
          via: "unavailable" as const,
          username: row.username,
          locked: true,
          reason: WEBFIG_LOCKED_REASON,
        },
      ]),
    );
  }
  const hubOrigin = await tryHubPublicOrigin();
  const out = new Map<string, WebfigLauncher | null>();
  for (const row of rows) {
    const launcher = buildWebfigLauncher(row, { hubOrigin });
    out.set(row.id, launcher ? signedHubLauncher(launcher, row) : null);
  }
  return out;
}
