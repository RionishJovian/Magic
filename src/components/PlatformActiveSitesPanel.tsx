import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { listPlatformActiveSites } from "@/lib/sites.functions";
import type { PlatformActiveSiteRow } from "@/lib/platform-active-sites";
import { DelayedFallback, SkeletonList } from "@/components/ui/skeleton";
import { useT } from "@/lib/i18n";
import { DeveloperRouterSupportConsole } from "@/components/DeveloperRouterSupportConsole";
import { DeveloperTenantReadOnlyPanel } from "@/components/DeveloperTenantReadOnlyPanel";

const SitesMap = lazy(() => import("@/components/SitesMap"));

function ownerLabel(row: PlatformActiveSiteRow): string {
  return (
    row.ownerDisplayName || row.ownerUsername || row.ownerEmail || `${row.ownerId.slice(0, 8)}…`
  );
}

function relativeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms) || ms < 0) return "just now";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

/** Read-only cross-tenant panel. Does not feed the site switcher. */
export function PlatformActiveSitesPanel() {
  const t = useT();
  const fetch = useServerFn(listPlatformActiveSites);
  const query = useQuery({
    queryKey: ["platform-active-sites"],
    queryFn: () => fetch(),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const activeMapSites = (query.data?.sites ?? [])
    .filter((row) => row.activeRouterCount > 0 && row.latitude != null && row.longitude != null)
    .map((row) => ({
      id: row.siteId ?? `u:${row.ownerId}`,
      name: row.siteName,
      location: row.location,
      latitude: row.latitude,
      longitude: row.longitude,
      routers: row.routerCount,
      online: row.activeRouterCount,
    }));
  const tenants = [
    ...new Map(
      (query.data?.sites ?? []).map((row) => [
        row.ownerId,
        { id: row.ownerId, label: ownerLabel(row) },
      ]),
    ).values(),
  ];

  return (
    <section className="glass-panel rounded-2xl border border-emerald-500/20 p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300/90">
            {t.copy("Platform · router monitor")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t.copy(
              "Status-only monitor for Developers. Users, MikroMagic Agents, and Expired accounts never see this. Active = Magic Hub online or handshake/seen within 5 minutes.",
            )}
          </p>
        </div>
        {query.data && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-200">
              {query.data.activeRouterCount}/{query.data.totalRouterCount} active routers
            </span>
            <span className="rounded-full border border-border/60 px-2 py-1 text-muted-foreground">
              {query.data.offlineRouterCount} offline
            </span>
          </div>
        )}
      </div>

      {query.isLoading && (
        <DelayedFallback
          loading
          label="Loading platform sites"
          fallback={<SkeletonList rows={3} />}
        />
      )}
      {query.isError && (
        <p className="text-sm text-destructive">
          {query.error instanceof Error
            ? query.error.message
            : t.copy("Could not load platform sites")}
        </p>
      )}
      {query.data && query.data.totalRouterCount === 0 && (
        <p className="text-sm text-muted-foreground">
          No physical routers have connected to the platform yet.
        </p>
      )}
      {query.data && query.data.sites.length > 0 && (
        <>
          <DeveloperTenantReadOnlyPanel tenants={tenants} />
          {activeMapSites.length > 0 && (
            <div className="mb-4 border-t border-border/50 pt-4">
              <p className="text-xs font-medium text-foreground">Active physical routers · map</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Green pins are active sites across the platform. Only Developers can see this map.
              </p>
              <div className="mt-2">
                <ClientOnly
                  fallback={
                    <div className="h-[280px] rounded-2xl border border-border/50 bg-surface/40" />
                  }
                >
                  <Suspense
                    fallback={
                      <div className="h-[280px] rounded-2xl border border-border/50 bg-surface/40" />
                    }
                  >
                    <SitesMap sites={activeMapSites} height={280} />
                  </Suspense>
                </ClientOnly>
              </div>
            </div>
          )}
          <ul className="divide-y divide-border/60">
            {query.data.sites.map((row) => (
              <li key={row.siteId ?? `u:${row.ownerId}`} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">{row.siteName}</p>
                    <p className="text-xs text-muted-foreground">
                      {ownerLabel(row)}
                      {row.location ? ` · ${row.location}` : ""}
                      {row.timezone ? ` · ${row.timezone}` : ""}
                    </p>
                  </div>
                  <p
                    className={`text-xs ${
                      row.activeRouterCount > 0 ? "text-emerald-300/90" : "text-muted-foreground"
                    }`}
                  >
                    {row.activeRouterCount}/{row.routerCount} {t.copy("active")}
                  </p>
                </div>
                <ul className="mt-2 space-y-1">
                  {row.routers.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground"
                    >
                      <span
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          r.active ? "bg-emerald-400" : "bg-muted-foreground/40"
                        }`}
                        aria-hidden
                      />
                      <span className="font-medium text-foreground/90">{r.name}</span>
                      <span>{r.connectionMode}</span>
                      <span>{r.cloudStatus}</span>
                      <span title={r.lastHandshakeAt ?? undefined}>
                        hs {relativeAgo(r.lastHandshakeAt)}
                      </span>
                      <DeveloperRouterSupportConsole routerId={r.id} routerName={r.name} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
