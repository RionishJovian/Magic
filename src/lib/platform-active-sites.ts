/** Shared helpers for the platform-admin “active router sites” view. */

export const PLATFORM_ACTIVE_HANDSHAKE_MS = 5 * 60 * 1000;

export type PlatformRouterActivity = {
  id: string;
  name: string;
  connectionMode: string;
  cloudStatus: string;
  lastHandshakeAt: string | null;
  lastSeenAt: string | null;
  active: boolean;
};

export type PlatformActiveSiteRow = {
  siteId: string | null;
  siteName: string;
  location: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
  ownerId: string;
  ownerEmail: string | null;
  ownerDisplayName: string | null;
  ownerUsername: string | null;
  routers: PlatformRouterActivity[];
  routerCount: number;
  activeRouterCount: number;
};

/** Developer-only, status-only cross-tenant view. No router credentials or configuration. */
export type PlatformRouterMonitor = {
  totalRouterCount: number;
  activeRouterCount: number;
  offlineRouterCount: number;
  totalSiteCount: number;
  activeSiteCount: number;
  sites: PlatformActiveSiteRow[];
};

export function isRouterConnectionActive(
  row: {
    cloud_status?: string | null;
    cloud_last_handshake_at?: string | null;
    cloud_last_seen_at?: string | null;
  },
  nowMs = Date.now(),
  freshMs = PLATFORM_ACTIVE_HANDSHAKE_MS,
): boolean {
  if ((row.cloud_status ?? "").toLowerCase() === "online") return true;
  for (const stamp of [row.cloud_last_handshake_at, row.cloud_last_seen_at]) {
    if (!stamp) continue;
    const t = Date.parse(stamp);
    if (!Number.isNaN(t) && nowMs - t <= freshMs) return true;
  }
  return false;
}
