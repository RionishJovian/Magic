import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { getMe } from "@/lib/auth.functions";
import { isPrivilegedAccount } from "@/lib/app-role";
import { meHasFeature } from "@/lib/operator-features";
import { routersStatus } from "@/lib/routers.functions";
import { getOverviewSummary } from "@/lib/overview.functions";
import { getHomeSiteTopology, listHomeTopologySites } from "@/lib/topology.functions";
import { toErrorMessage } from "@/lib/error-message";
import { useSelectedSite } from "@/hooks/useSelectedSite";

import { BusinessSummary } from "@/components/BusinessSummary";
import { useInAppNotice } from "@/components/InAppNotice.context";
import { LiveOpsStrip } from "@/components/LiveOpsStrip";
import { SiteTopologyCanvas } from "@/components/SiteTopologyCanvas";
import { RemoteAccessChooser } from "@/components/RemoteAccessChooser";
import { DashboardGreeting } from "@/components/DashboardGreeting";
import { accountDisplayName } from "@/lib/account-display";
import { MagicGoLiveStrip } from "@/components/MagicGoLiveStrip";
import { HomeToolThumb, type HomeToolAccent } from "@/components/HomeToolThumb";
import { HomeToolIcons as Icons } from "@/components/home-tool-icons";
import { EXPIRED_ALLOWED as NAV_EXPIRED } from "@/lib/nav/modes";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "Overview — MikroTik Hotspot Admin" },
      {
        name: "description",
        content: "Fleet overview: voucher revenue, site topology, and hotspot operator tools.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Overview,
});

type StatusKind = "green" | "red" | "yellow" | "neutral" | "loading";

function topologyRequest<T>(request: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out. Check your connection and try again.`)),
      12_000,
    );
    request.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function HomeSiteTopology({ canOpenFull }: { canOpenFull: boolean }) {
  const tr = useT();
  const { site } = useSelectedSite();
  const fetchSites = useServerFn(listHomeTopologySites);
  const fetchTopology = useServerFn(getHomeSiteTopology);
  const [chosenSiteId, setChosenSiteId] = useState("");
  const [chosenRouterId, setChosenRouterId] = useState("");
  const sites = useQuery({
    queryKey: ["topology-sites", "home"],
    queryFn: () => topologyRequest(fetchSites(), "Loading sites"),
    staleTime: 60_000,
    retry: 1,
  });
  const candidates = sites.data ?? [];
  const selectedSite =
    candidates.find((candidate) => candidate.siteId === chosenSiteId) ??
    candidates.find((candidate) => candidate.siteId === site?.id) ??
    candidates[0];
  const selectedRouter =
    selectedSite?.routers.find((router) => router.id === chosenRouterId) ??
    selectedSite?.routers[0];
  const topology = useQuery({
    queryKey: ["site-topology", "home", selectedSite?.siteId, selectedRouter?.id],
    queryFn: () =>
      topologyRequest(
        fetchTopology({
          data: { siteId: selectedSite!.siteId, routerId: selectedRouter!.id },
        }),
        "Building Site Topology",
      ),
    enabled: Boolean(selectedSite?.siteId && selectedRouter?.id),
    staleTime: 30_000,
    refetchInterval: 45_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  return (
    <section
      aria-labelledby="home-site-topology-heading"
      className="glass-panel rounded-[1.75rem] p-5 sm:p-6"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="home-site-topology-heading" className="text-title truncate text-lg">
            {tr.label("Site topology")}
          </h2>
          <p className="text-sub mt-1 text-xs">
            {tr.copy("WAN → router → LAN ports for the selected site, with live link status.")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {candidates.length > 1 && (
            <select
              id="home-topology-site"
              aria-label="Site"
              className="min-h-11 max-w-[11rem] rounded-full border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] px-3 text-xs"
              value={selectedSite?.siteId ?? ""}
              onChange={(event) => {
                setChosenSiteId(event.target.value);
                setChosenRouterId("");
              }}
            >
              {candidates.map((candidate) => (
                <option key={candidate.siteId} value={candidate.siteId}>
                  {candidate.siteName}
                </option>
              ))}
            </select>
          )}
          {(selectedSite?.routers.length ?? 0) > 1 && (
            <select
              id="home-topology-router"
              aria-label="Router"
              className="min-h-11 max-w-[11rem] rounded-full border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] px-3 text-xs"
              value={selectedRouter?.id ?? ""}
              onChange={(event) => setChosenRouterId(event.target.value)}
            >
              {(selectedSite?.routers ?? []).map((router) => (
                <option key={router.id} value={router.id}>
                  {router.name}
                </option>
              ))}
            </select>
          )}
          {canOpenFull && (
            <Link
              to="/app/topology"
              className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] px-4 text-xs font-medium transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Open topology
            </Link>
          )}
        </div>
      </div>
      {sites.isLoading && !sites.data ? (
        <p className="text-sub mt-4 text-xs">{tr.copy("Connecting…")}</p>
      ) : sites.error ? (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
          <p className="text-sm text-red-700 dark:text-red-200">{toErrorMessage(sites.error)}</p>
          <button
            type="button"
            onClick={() => void sites.refetch()}
            className="mt-3 inline-flex min-h-10 items-center rounded-full border border-red-500/50 px-4 text-xs font-medium text-red-800 transition hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-red-100"
          >
            Try again
          </button>
        </div>
      ) : !candidates.length ? (
        <div className="mt-4 rounded-xl border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] p-4">
          <p className="text-sm font-medium">
            {tr.copy("Add a site with a physical router to see the network diagram.")}
          </p>
          <p className="text-sub mt-1 text-xs">
            Create the location first, then add or assign its RouterBoard. Site Topology will scan
            WAN and LAN links automatically after the router passes its connection test.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/app/sites"
              className="inline-flex min-h-10 items-center rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Open sites
            </Link>
            <Link
              to="/app/routers"
              className="inline-flex min-h-10 items-center rounded-full border border-[color:var(--glass-border)] px-4 text-xs font-medium transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Open routers
            </Link>
          </div>
        </div>
      ) : topology.isLoading && !topology.data ? (
        <p className="text-sub mt-4 text-xs">{tr.copy("Building diagram…")}</p>
      ) : topology.error ? (
        <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
          <p className="text-sm text-red-700 dark:text-red-200">
            {toErrorMessage(topology.error)}
          </p>
          <button
            type="button"
            onClick={() => void topology.refetch()}
            className="mt-3 inline-flex min-h-10 items-center rounded-full border border-red-500/50 px-4 text-xs font-medium text-red-800 transition hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-red-100"
          >
            Try again
          </button>
        </div>
      ) : topology.data ? (
        <div className="mt-4 w-full min-w-0 space-y-2">
          {topology.data.probeError && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-100">
              {topology.data.probeError} — diagram shows the last known layout; fix Connect → Test
              on the router first.
            </p>
          )}
          <SiteTopologyCanvas snapshot={topology.data} />
        </div>
      ) : null}
    </section>
  );
}

function StatusDot({ kind, label }: { kind: StatusKind; label: string }) {
  const color =
    kind === "green"
      ? "bg-emerald-400 shadow-[0_0_12px_2px_rgba(52,211,153,0.75)]"
      : kind === "red"
        ? "bg-red-500 shadow-[0_0_12px_2px_rgba(239,68,68,0.8)]"
        : kind === "yellow"
          ? "bg-amber-400 shadow-[0_0_12px_2px_rgba(251,191,36,0.8)]"
          : "bg-slate-400/70";
  const text =
    kind === "green"
      ? "text-emerald-800 dark:text-emerald-200"
      : kind === "red"
        ? "text-red-800 dark:text-red-200"
        : kind === "yellow"
          ? "text-amber-800 dark:text-amber-200"
          : "text-muted-foreground";
  const animate = kind === "green" || kind === "red" || kind === "yellow";
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide ${text} ${kind === "loading" ? "opacity-60" : ""}`}
      role="status"
      aria-label={`Status: ${label}`}
    >
      <span className="relative inline-flex h-2.5 w-2.5">
        {animate && (
          <span className={`absolute inset-0 rounded-full ${color} animate-ping opacity-75`} />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${color}`} />
      </span>
      {label}
    </span>
  );
}

type CardDef = {
  to: string;
  title: string;
  body: string;
  primaryOnly?: boolean;
  /** Owner or admin — used for Payments. */
  privilegedOnly?: boolean;
  icon: React.ReactNode;
  accent: HomeToolAccent;
};

function Overview() {
  const { pushNotice } = useInAppNotice();
  const tr = useT();
  const fetchMe = useServerFn(getMe);
  const fetchStatus = useServerFn(routersStatus);
  const fetchSummary = useServerFn(getOverviewSummary);

  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const isOwner = isPrivilegedAccount(me.data?.roles, me.data?.isPlatformAdmin);
  const isReadOnly = me.data?.roles?.includes("read_only") ?? false;
  const isExpired = me.data?.roles?.includes("expired") ?? false;
  // Expired accounts keep read access to a small, device-free set of pages.
  const EXPIRED_ALLOWED = NAV_EXPIRED;

  const status = useQuery({
    queryKey: ["routers-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  const summary = useQuery({
    queryKey: ["overview-summary"],
    queryFn: () => fetchSummary(),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  // Track "was online within last 5 min" to distinguish red (recently dropped) vs yellow (never/not-found).
  const lastSeenRef = useRef<Map<string, number>>(new Map());
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const routers = status.data?.routers ?? [];
    const now = Date.now();
    for (const r of routers) {
      if (r.online) {
        lastSeenRef.current.set(r.id, now);
        notifiedRef.current.delete(r.id);
      } else {
        const last = lastSeenRef.current.get(r.id);
        const droppedRecently = last && now - last <= 5 * 60_000;
        if (droppedRecently && !notifiedRef.current.has(r.id)) {
          notifiedRef.current.add(r.id);
          pushNotice({
            id: `router-drop:${r.id}:${now}`,
            tone: "critical",
            title: "Router disconnected",
            body: `${r.name} lost connection in the last 5 minutes.`,
          });
        }
      }
    }
  }, [status.data, pushNotice]);

  const kind: StatusKind = (() => {
    const data = status.data;
    if (!data || data.count === 0) return "yellow";
    if (data.online > 0) return "green";
    // all offline — check whether any dropped within 5 min
    const now = Date.now();
    const routers = data.routers ?? [];
    const anyRecent = routers.some((r) => {
      const last = lastSeenRef.current.get(r.id);
      return last && now - last <= 5 * 60_000;
    });
    return anyRecent ? "red" : "yellow";
  })();

  const statusLabel =
    !status.data || status.data.count === 0
      ? "Not found"
      : kind === "green"
        ? `${status.data.online}/${status.data.count} online`
        : kind === "red"
          ? "Disconnected"
          : "Offline";

  // Per-card status pill. Router-backed cards reuse the live status poll; the
  // rest come from the single overview summary request.
  const s = summary.data;
  const loadingPill = { kind: "loading" as StatusKind, label: "Checking…" };
  const expiresAt = me.data?.client_expires_at
    ? new Date(me.data.client_expires_at).getTime()
    : null;
  const daysLeft = expiresAt != null ? Math.ceil((expiresAt - Date.now()) / 86_400_000) : null;

  const statusFor = (to: string): { kind: StatusKind; label: string } | null => {
    const routerCount = status.data?.count ?? s?.routers ?? 0;

    switch (to) {
      case "/app/routers":
        return { kind, label: statusLabel };
      case "/app/live":
        if (status.isLoading) return loadingPill;
        return kind === "green"
          ? { kind: "green", label: "Monitoring" }
          : kind === "red"
            ? { kind: "red", label: "Disconnected" }
            : { kind: "yellow", label: "No router" };
      case "/app/quick-setup":
        if (summary.isLoading && !s) return loadingPill;
        return routerCount > 0
          ? { kind: "green", label: "Setup complete" }
          : { kind: "yellow", label: "Not started" };
      case "/app/fleet":
        if (status.isLoading) return loadingPill;
        if (!status.data || status.data.count === 0) return { kind: "yellow", label: "No devices" };
        return status.data.offline > 0
          ? { kind: "red", label: `${status.data.offline} need attention` }
          : { kind: "green", label: "All healthy" };
      case "/app/vouchers":
        if (!s) return loadingPill;
        if (s.plans === 0) return { kind: "yellow", label: "No plans" };
        return s.vouchersActive > 0
          ? { kind: "green", label: `${s.vouchersActive} active` }
          : { kind: "yellow", label: "No codes yet" };
      case "/app/portal":
        if (!s) return loadingPill;
        if (!s.lastDeploy) return { kind: "yellow", label: "Not published" };
        return s.lastDeploy.ok
          ? { kind: "green", label: "Published" }
          : { kind: "red", label: "Last publish failed" };
      case "/app/sites":
        if (!s) return loadingPill;
        return s.sites > 0
          ? { kind: "green", label: `${s.sites} site${s.sites === 1 ? "" : "s"}` }
          : { kind: "yellow", label: "No sites yet" };
      case "/app/access-points":
        if (!s) return loadingPill;
        return s.unifi > 0
          ? { kind: "green", label: `${s.unifi} connected` }
          : { kind: "neutral", label: "Optional" };
      case "/app/revenue":
        if (!s) return loadingPill;
        return s.revenue30 > 0
          ? { kind: "green", label: `${s.revenue30.toLocaleString()} MMK / 30d` }
          : { kind: "yellow", label: "No sales yet" };
      case "/app/terminal":
        return isReadOnly
          ? { kind: "yellow", label: "Read-only" }
          : { kind: "green", label: "Ready" };
      case "/app/syslog":
        if (!s) return loadingPill;
        if (s.syslogCritical > 0)
          return { kind: "red", label: `${s.syslogCritical} critical today` };
        return s.syslogToday > 0
          ? { kind: "green", label: `${s.syslogToday} events today` }
          : { kind: "yellow", label: "No log source" };
      case "/app/profile":
        if (isExpired) return { kind: "red", label: "Expired" };
        if (daysLeft != null && daysLeft <= 7)
          return { kind: "yellow", label: `${Math.max(daysLeft, 0)}d left` };
        return daysLeft != null
          ? { kind: "green", label: `Active · ${daysLeft}d left` }
          : { kind: "green", label: "Active" };
      case "/app/users":
        if (!s || s.accounts == null) return loadingPill;
        return { kind: "green", label: `${s.accounts} account${s.accounts === 1 ? "" : "s"}` };
      case "/app/usage":
        if (!s || s.aiTokens30 == null) return loadingPill;
        return s.aiTokens30 > 0
          ? { kind: "green", label: `${s.aiTokens30.toLocaleString()} tokens / 30d` }
          : { kind: "neutral", label: "No usage" };
      case "/app/scripts":
        return { kind: "neutral", label: "Library ready" };
      case "/app/incidents":
        if (status.isLoading) return loadingPill;
        return kind === "red"
          ? { kind: "red", label: "Needs attention" }
          : kind === "green"
            ? { kind: "green", label: "Watching" }
            : { kind: "yellow", label: "No routers" };
      case "/app/connectors":
        if (!s) return loadingPill;
        return routerCount > 0
          ? { kind: "green", label: "Available" }
          : { kind: "yellow", label: "Pair for CGNAT" };
      case "/app/orders":
        return { kind: "neutral", label: "Cash · banks · receipts" };
      default:
        return null;
    }
  };

  const cards: CardDef[] = [
    {
      to: "/app/quick-setup",
      title: "Quick setup",
      body: "Guided wizard to add a MikroTik router remotely — DDNS, TLS, API user, and reachability checks.",
      privilegedOnly: true,
      icon: Icons.wand,
      accent: "sage",
    },
    {
      to: "/app/connectors",
      title: "Connectors",
      body: "Pair a local LAN agent when the site is behind CGNAT — no port-forward, same Live and vouchers.",
      privilegedOnly: true,
      icon: Icons.connectors,
      accent: "pine",
    },
    {
      to: "/app/routers",
      title: "Routers",
      body: "Add your MikroTik, see live online status and telemetry without digging.",
      icon: Icons.router,
      accent: "navy",
    },
    {
      to: "/app/live",
      title: "Live users",
      body: "See who's on the hotspot right now — kick, ban, or throttle a session.",
      icon: Icons.live,
      accent: "sage",
    },
    {
      to: "/app/incidents",
      title: "Incidents",
      body: "Site offline, WAN degraded, connector stale, AP down — acknowledge and quiet hours.",
      icon: Icons.incidents,
      accent: "coral",
    },
    {
      to: "/app/vouchers",
      title: "Vouchers",
      body: "Plans (speed / devices / quotas), bulk codes, printable slips, and live redemption status.",
      icon: Icons.vouchers,
      accent: "gold",
    },
    {
      to: "/app/portal",
      title: "Portal designer",
      body: "Brand the guest login page, then publish or roll back straight to the router.",
      icon: Icons.portal,
      accent: "mist",
    },
    {
      to: "/app/fleet",
      title: "Fleet",
      body: "Live health, traffic and events across every device, with on-demand AI scans that explain errors.",
      icon: Icons.fleet,
      accent: "pine",
    },
    {
      to: "/app/sites",
      title: "Sites",
      body: "Group routers and access points by location, then switch context from the header.",
      icon: Icons.sites,
      accent: "navy",
    },
    {
      to: "/app/access-points",
      title: "Optional AP integrations",
      body: "Advanced controller links. Controls appear only after a successful capability test; dumb APs can stay in bridge mode and use their native app.",
      icon: Icons.unifi,
      accent: "sage",
    },
    {
      to: "/app/revenue",
      title: "Revenue",
      body: "Voucher sales, usage and expiry rates rolled up automatically — with exportable reports.",
      icon: Icons.revenue,
      accent: "gold",
    },
    {
      to: "/app/orders",
      title: "Payments",
      body: "Orders, cash sales, receipt review and bank details for desk voucher sales.",
      privilegedOnly: true,
      icon: Icons.payments,
      accent: "gold",
    },
    {
      to: "/app/terminal",
      title: "Terminal",
      body: "Run RouterOS REST commands with saved templates. Destructive commands are blocked for clients.",
      icon: Icons.terminal,
      accent: "navy",
    },
    {
      to: "/app/syslog",
      title: "Syslog AI",
      body: "Stream router logs and let AI translate noisy events into plain-language causes and fixes.",
      icon: Icons.syslog,
      accent: "pine",
    },
    {
      to: "/app/profile",
      title: "Profile",
      body: "Display name, password, account role, expiry date, install-to-phone hint and sign out.",
      icon: Icons.profile,
      accent: "mist",
    },
    {
      to: "/app/users",
      title: "User management",
      body: "Create client or owner accounts, change roles, reset passwords, and remove access.",
      primaryOnly: true,
      icon: Icons.users,
      accent: "sage",
    },
    {
      to: "/app/scripts",
      title: "Scripts",
      body: "Copy-ready RouterOS snippets for firewall, VLAN, PPPoE, WireGuard, QoS, backup and more.",
      primaryOnly: true,
      icon: Icons.scripts,
      accent: "navy",
    },
    {
      to: "/app/usage",
      title: "Credit usage",
      body: "Track AI credit consumption per account and approve extra device slots.",
      primaryOnly: true,
      icon: Icons.usage,
      accent: "coral",
    },
  ];

  const routerCount = status.data?.count ?? 0;
  const gatewayOnline = (status.data?.online ?? 0) > 0;
  const showDevBadge = me.data?.isPlatformAdmin ?? false;
  const showAgentBadge = (me.data?.roles ?? []).includes("agent");
  // Payments card is tenant User / Developer, or a client granted cash_sales.
  const isPrivileged = isOwner || showDevBadge;
  const canPayments = isPrivileged || meHasFeature(me.data, "cash_sales");

  const displayName = accountDisplayName({
    profile: me.data?.profile,
    email: me.data?.email,
  });

  const quickActions = cards
    .filter((c) => ["/app/vouchers", "/app/live", "/app/portal", "/app/routers"].includes(c.to))
    .filter((c) => !(c.primaryOnly && !isOwner && !showDevBadge))
    .filter((c) => !(c.privilegedOnly && c.to === "/app/orders" && !canPayments))
    .filter((c) => !(c.privilegedOnly && c.to !== "/app/orders" && !isPrivileged))
    .filter((c) => !(isReadOnly && c.to === "/app/terminal"))
    .filter((c) => !(isExpired && !isOwner && !EXPIRED_ALLOWED.has(c.to)));

  return (
    <>
      <h1 className="sr-only">Hotspot business dashboard</h1>
      <DashboardGreeting
        displayName={displayName}
        showDevBadge={showDevBadge}
        showAgentBadge={showAgentBadge}
      />
      <div className="mb-4">
        <BusinessSummary />
      </div>

      <div className="mb-4">
        <MagicGoLiveStrip compact skipHotspotProbe />
      </div>

      {!(isExpired && !isOwner) && (
        <div className="mb-4">
          <HomeSiteTopology canOpenFull={showDevBadge} />
        </div>
      )}

      {gatewayOnline ? (
        <div className="mb-4">
          <LiveOpsStrip />
        </div>
      ) : routerCount === 0 ? (
        <div className="mb-4">
          <RemoteAccessChooser />
        </div>
      ) : null}

      {quickActions.length > 0 && (
        <>
          <div className="mb-3 flex items-end justify-between gap-2">
            <h2 className="text-title text-sm">{tr.label("Quick actions")}</h2>
            <span className="text-kicker text-[11px] uppercase tracking-[0.12em]">
              {tr.copy("Daily hotspot operator tasks")}
            </span>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {quickActions.map((c) => (
              <Link
                key={c.to}
                to={c.to}
                className="glass-panel interactive-card min-h-[5.5rem] rounded-[1.25rem] p-4 text-center"
              >
                <div className="mx-auto w-fit">
                  <HomeToolThumb accent={c.accent} size="sm">
                    {c.icon}
                  </HomeToolThumb>
                </div>
                <div className="text-title mt-2 text-xs">{c.title}</div>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="mb-3 flex items-end justify-between gap-2">
        <h2 className="text-title text-sm">{tr.label("All tools")}</h2>
        <span className="text-kicker text-[11px] uppercase tracking-[0.12em]">
          {tr.copy("RouterBoard & voucher workspace")}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {cards
          .filter((c) => !(c.primaryOnly && !isOwner && !showDevBadge))
          .filter((c) => !(c.privilegedOnly && c.to === "/app/orders" && !canPayments))
          .filter((c) => !(c.privilegedOnly && c.to !== "/app/orders" && !isPrivileged))
          .filter((c) => !(isReadOnly && c.to === "/app/terminal"))
          .filter((c) => !(isExpired && !isOwner && !EXPIRED_ALLOWED.has(c.to)))
          .map((c) => {
            const locked = Boolean(c.primaryOnly && !isOwner && !showDevBadge);
            const pill = statusFor(c.to);
            return (
              <Link
                key={c.to}
                to={c.to}
                search={c.to === "/app/quick-setup" ? ({ intro: "1" } as never) : undefined}
                className="glass-panel interactive-card group relative flex items-start gap-4 rounded-[1.5rem] p-5 hover:border-primary/50 hover:shadow-[var(--glow-primary)]"
              >
                <HomeToolThumb accent={c.accent}>{c.icon}</HomeToolThumb>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-title text-lg">{c.title}</div>
                    {pill && <StatusDot kind={pill.kind} label={pill.label} />}
                    {locked && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300">
                        <span className="h-3 w-3">{Icons.lock}</span> Primary user only
                      </span>
                    )}
                  </div>
                  <p className="text-sub mt-2 text-sm leading-relaxed">{c.body}</p>
                </div>
              </Link>
            );
          })}
      </div>
    </>
  );
}
