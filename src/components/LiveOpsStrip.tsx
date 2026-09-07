import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listIncidents } from "@/lib/health.functions";
import { getFleetHealth, listFleetScans } from "@/lib/fleet.functions";
import { fleetInsights, fleetLiveTotals, relativeAge } from "@/lib/fleet-health";
import { useT } from "@/lib/i18n";

/**
 * Day-to-day ops strip for Home once a gateway is reachable: reachability,
 * guest sessions, open incidents, and one-tap jumps to Live / Fleet / Incidents.
 */
export function LiveOpsStrip() {
  const tr = useT();
  const fetchHealth = useServerFn(getFleetHealth);
  const fetchIncidents = useServerFn(listIncidents);
  const fetchScans = useServerFn(listFleetScans);

  const health = useQuery({
    queryKey: ["fleet-health"],
    queryFn: () => fetchHealth(),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const incidents = useQuery({
    queryKey: ["incidents-open"],
    queryFn: () => fetchIncidents({ data: { includeResolved: false } }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const scans = useQuery({
    queryKey: ["fleet-ai-scans-home"],
    queryFn: () => fetchScans({ data: { kind: "ai", limit: 1 } }),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const routers = health.data?.routers ?? [];
  const { online, offline, activeSessions } = fleetLiveTotals(routers);
  const count = routers.length;
  const openIncidents = incidents.data?.length ?? 0;
  const loading = health.isLoading;
  const latest = scans.data?.[0];
  const insights = fleetInsights(latest?.payload);
  const critical = insights.filter((i) => i.severity === "critical").length;
  const focusRouter = insights.find((i) => i.severity === "critical" && i.router_id)?.router_id;

  return (
    <section aria-labelledby="live-ops-heading" className="panel p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h2 id="live-ops-heading" className="text-title truncate text-lg">
            {tr.label("Live operations")}
          </h2>
          <p className="text-sub mt-1 text-xs">
            {tr.copy("Gateways, guests online, and open incidents — refreshed every minute.")}
            {latest ? ` · Last scan ${relativeAge(latest.generated_at)}` : ""}
          </p>
        </div>
        <Link
          to="/app/fleet"
          search={focusRouter ? { router: focusRouter } : {}}
          className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-[color:var(--glass-border)] px-4 text-xs font-medium transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Open Fleet
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric
          label={tr.label("Gateways online")}
          value={loading ? "…" : `${online} / ${count}`}
          tone={offline > 0 ? "warn" : "ok"}
          loading={loading}
        />
        <Metric
          label={tr.label("Offline")}
          value={loading ? "…" : String(offline)}
          tone={offline > 0 ? "danger" : "normal"}
          loading={loading}
        />
        <Metric
          label={tr.label("Active sessions")}
          value={loading ? "…" : String(activeSessions)}
          loading={loading}
        />
        <Metric
          label={tr.label("Open incidents")}
          value={incidents.isLoading ? "…" : String(openIncidents)}
          tone={openIncidents > 0 ? "danger" : "ok"}
          loading={incidents.isLoading}
        />
        <Metric
          label="Critical insights"
          value={scans.isLoading ? "…" : String(critical)}
          tone={critical > 0 ? "danger" : "ok"}
          loading={scans.isLoading}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <QuickLink to="/app/live" label="Live users" />
        <QuickLink to="/app/routers" label="Routers" />
        <QuickLink
          to="/app/incidents"
          label={openIncidents > 0 ? `Incidents (${openIncidents})` : "Incidents"}
          emphasize={openIncidents > 0}
        />
        <QuickLink to="/app/syslog" label="Syslog AI" />
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  loading,
  tone = "normal",
}: {
  label: string;
  value: string;
  loading?: boolean;
  tone?: "normal" | "ok" | "warn" | "danger";
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-800 dark:text-emerald-200"
      : tone === "warn"
        ? "text-amber-800 dark:text-amber-200"
        : tone === "danger"
          ? "text-red-800 dark:text-red-200"
          : "text-title";
  return (
    <div className="rounded-xl border border-[color:var(--glass-border)] bg-white/5 p-3">
      <div className="text-kicker text-[10px] uppercase tracking-wide">{label}</div>
      <div
        className={`mt-1 truncate text-base font-semibold ${toneClass} ${loading ? "animate-pulse opacity-60" : ""}`}
        aria-busy={loading ? "true" : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function QuickLink({
  to,
  label,
  emphasize,
}: {
  to: "/app/live" | "/app/routers" | "/app/incidents" | "/app/syslog";
  label: string;
  emphasize?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`inline-flex min-h-11 items-center rounded-full border px-4 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        emphasize
          ? "border-red-500/50 bg-red-500/10 text-red-200 hover:border-red-400"
          : "border-[color:var(--glass-border)] hover:border-primary hover:text-primary"
      }`}
    >
      {label}
    </Link>
  );
}
