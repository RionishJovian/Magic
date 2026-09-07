import { BrandSignature } from "@/components/BrandSignature";
import { DevBadge } from "@/components/DevBadge";
import { VerifiedAgentBadge } from "@/components/VerifiedAgentBadge";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  availableModes,
  modeForPath,
  navItemsForMode,
  navTitleForPath,
  NAV_MODES,
  type NavMode,
} from "@/lib/nav/modes";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { getMe } from "@/lib/auth.functions";
import { isPrivilegedAccount } from "@/lib/app-role";
import { canUseMagicDude } from "@/lib/magic-dude-access";
import { accountDisplayName } from "@/lib/account-display";
import { meHasFeature } from "@/lib/operator-features";
import { useSelectedSite, setSelectedSite } from "@/hooks/useSelectedSite";
import { listSites } from "@/lib/sites.functions";
import { NotificationsBell } from "@/components/NotificationsBell";
import { InAppNoticeProvider } from "@/components/InAppNotice";
import { useInAppNotice } from "@/components/InAppNotice.context";
import { useT } from "@/lib/i18n";
import { resolveRouteGate } from "@/lib/nav/route-gate";
import { AppBottomNav } from "@/components/AppBottomNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DelayedFallback, SkeletonCard, SkeletonList } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { MagicDudeChatPopup } from "@/components/MagicDudeChatPopup";
import { Settings2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Dashboard — MikroTik Hotspot Admin" },
      {
        name: "description",
        content:
          "Dashboard for MikroTik hotspot routers, vouchers, live sessions, and portal design.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminShell,
});

const MODE_STORAGE_KEY = "mm.nav-mode";

function AdminShell() {
  const tr = useT();
  const fetchMe = useServerFn(getMe);
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => fetchMe(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
  const { site: selectedSite } = useSelectedSite();
  const isOwner = isPrivilegedAccount(me.data?.roles, me.data?.isPlatformAdmin);
  const isExpired = me.data?.roles?.includes("expired") ?? false;
  const isPending = me.data?.roles?.includes("pending") ?? false;

  const fetchSites = useServerFn(listSites);
  const sitesQ = useQuery({
    queryKey: ["sites"],
    queryFn: () => fetchSites(),
    enabled: !!me.data,
    staleTime: 60_000,
  });

  // Drop a sticky site switcher selection that is not on this account (cross-tenant leak / stale cache).
  useEffect(() => {
    if (!sitesQ.isSuccess || !selectedSite) return;
    const mine = (sitesQ.data ?? []).some((s) => s.id === selectedSite.id);
    if (!mine) setSelectedSite(null);
  }, [sitesQ.isSuccess, sitesQ.data, selectedSite]);
  const expiresAt = me.data?.client_expires_at ? new Date(me.data.client_expires_at) : null;
  const msLeft = expiresAt ? expiresAt.getTime() - Date.now() : null;
  const daysLeft = msLeft != null ? Math.ceil(msLeft / (24 * 60 * 60 * 1000)) : null;
  const expiringSoon = !isOwner && !isExpired && daysLeft != null && daysLeft <= 7 && daysLeft > 0;

  // Desktop: collapsible secondary tab rail. Mobile uses the bottom tab bar.
  const [navOpen, setNavOpen] = useState(true);
  useEffect(() => {
    setNavOpen(window.matchMedia("(min-width: 768px)").matches);
  }, []);

  const [condensed, setCondensed] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      setCondensed(y > 24 && y > last);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isEasyMode = pathname.startsWith("/app/easy");
  const roles = useMemo(() => me.data?.roles ?? [], [me.data?.roles]);
  const features = useMemo(() => me.data?.features ?? [], [me.data?.features]);
  const isPlatformAdmin = me.data?.isPlatformAdmin ?? false;
  const hasActivePlus = me.data?.has_active_plus ?? false;
  const isTrial = me.data?.account.trial ?? false;
  const isAgent = roles.includes("agent");
  const accountLabel = me.data
    ? accountDisplayName({ profile: me.data.profile, email: me.data.email })
    : "…";
  const modes = useMemo(
    () => availableModes(roles, features, isPlatformAdmin, hasActivePlus, isTrial),
    [roles, features, isPlatformAdmin, hasActivePlus, isTrial],
  );
  const [modeOverride, setModeOverride] = useState<NavMode | null>(null);
  const pathMode = modeForPath(pathname);

  useEffect(() => {
    setModeOverride(null);
  }, [pathMode]);

  const activeMode: NavMode = modes.includes(modeOverride ?? pathMode)
    ? (modeOverride ?? pathMode)
    : (modes[0] ?? "business");

  const navTabs = useMemo(
    () => navItemsForMode(roles, activeMode, features, isPlatformAdmin, hasActivePlus, isTrial),
    [roles, activeMode, features, isPlatformAdmin, hasActivePlus, isTrial],
  );

  const navigate = useNavigate();

  function chooseMode(m: NavMode) {
    setModeOverride(m);
    try {
      localStorage.setItem(MODE_STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
    const first =
      navItemsForMode(roles, m, features, isPlatformAdmin, hasActivePlus, isTrial).find(
        (i) => !i.pinned,
      )?.to ?? "/app";
    navigate({ to: first });
  }

  const gate = useMemo(
    () =>
      me.data
        ? resolveRouteGate(roles, pathname, features, isPlatformAdmin, hasActivePlus, isTrial)
        : null,
    [me.data, roles, features, pathname, isPlatformAdmin, hasActivePlus, isTrial],
  );
  const rolesUnresolved = me.isPending;
  const blocked = rolesUnresolved || gate?.allowed === false;
  const shouldRecoverSession = !me.isPending && me.isFetched && me.data == null;
  const refetchMe = me.refetch;

  // Recover from a stale cached getMe=null after account switch (sign-out race).
  useEffect(() => {
    if (!shouldRecoverSession) return;
    void supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (data.user && !error) void refetchMe();
        else {
          void supabase.auth.signOut({ scope: "local" }).catch(() => {});
          navigate({ to: "/auth", replace: true });
        }
      })
      .catch(() => {
        void supabase.auth.signOut({ scope: "local" }).catch(() => {});
        navigate({ to: "/auth", replace: true });
      });
  }, [shouldRecoverSession, refetchMe, navigate]);

  useEffect(() => {
    if (gate && !gate.allowed) navigate({ to: gate.redirectTo, replace: true });
  }, [gate, navigate]);

  const featureTitle = useMemo(
    () =>
      tr.ui(navTitleForPath(roles, pathname, features, isPlatformAdmin, hasActivePlus, isTrial)),
    [roles, features, pathname, tr, isPlatformAdmin, hasActivePlus, isTrial],
  );

  const navRef = useRef<HTMLElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  function updateArrows() {
    const el = navRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  function scrollTabs(dir: 1 | -1) {
    const el = navRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.7), behavior: "smooth" });
  }

  useEffect(() => {
    updateArrows();
    window.addEventListener("resize", updateArrows);
    return () => window.removeEventListener("resize", updateArrows);
  }, [navTabs.length, navOpen]);

  return (
    <InAppNoticeProvider>
      <AccountExpiryNotices
        userId={me.data?.id}
        expired={isExpired}
        expiringSoon={expiringSoon}
        daysLeft={daysLeft}
      />
      <div className="min-h-[100dvh] min-w-0 max-w-full overflow-x-clip">
        <div
          aria-hidden
          className="orb pointer-events-none fixed -top-32 -right-24 hidden h-[28rem] w-[28rem] rounded-full opacity-45 dark:block"
          style={{ background: "radial-gradient(circle, var(--orb-a) 0%, transparent 62%)" }}
        />
        <div
          aria-hidden
          className="orb pointer-events-none fixed top-1/3 -left-32 hidden h-[24rem] w-[24rem] rounded-full opacity-35 dark:block"
          style={{
            background: "radial-gradient(circle, var(--orb-b) 0%, transparent 62%)",
            animationDelay: "-4s",
          }}
        />
        <div
          aria-hidden
          className="orb pointer-events-none fixed bottom-1/4 right-0 hidden h-[20rem] w-[20rem] rounded-full dark:block"
          style={{
            background: "radial-gradient(circle, var(--orb-c, #2a3f80) 0%, transparent 62%)",
            animationDelay: "-8s",
            opacity: 0.18,
          }}
        />
        <div
          aria-hidden
          className="orb pointer-events-none fixed bottom-0 left-1/4 hidden h-[16rem] w-[16rem] rounded-full dark:block"
          style={{
            background: "radial-gradient(circle, var(--orb-d, #4a235a) 0%, transparent 62%)",
            animationDelay: "-13s",
            opacity: 0.14,
          }}
        />
        <header
          className={`${isEasyMode ? "hidden" : "app-header sticky top-0 z-30"} border-b border-[color:var(--glass-border)] transition-colors duration-300 ${
            condensed && navOpen ? "header-condensed" : ""
          }`}
        >
          <div className="container-page relative pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:pb-3 sm:pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="grid min-h-[2.75rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:gap-3">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <span className="relative inline-flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_16px_var(--color-primary)]" />
                </span>
                <div className="min-w-0">
                  <div className="hidden min-w-0 items-center gap-2 sm:flex">
                    <div className="truncate text-[10px] uppercase tracking-[0.28em] text-kicker">
                      MikroTik Magic
                    </div>
                    <BrandSignature className="shrink-0" />
                  </div>
                  <h1 className="gradient-text truncate text-sm font-semibold">
                    <span className="sm:hidden">{featureTitle}</span>
                    <span className="hidden sm:inline">Dashboard</span>
                  </h1>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-xs sm:gap-2">
                <ThemeToggle />
                <NotificationsBell enabled={meHasFeature(me.data, "alerts")} />
                <Link
                  to={isEasyMode ? "/app" : "/app/easy"}
                  aria-label={isEasyMode ? "Switch to Advanced Mode" : "Switch to Easy Mode"}
                  title={isEasyMode ? "Switch to Advanced Mode" : "Switch to Easy Mode"}
                  className="touch-target inline-flex h-11 w-11 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/15 active:scale-95"
                >
                  {isEasyMode ? (
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Settings2 className="h-5 w-5" aria-hidden="true" />
                  )}
                </Link>
                <Link
                  to="/app/profile"
                  aria-label="Open profile"
                  className="touch-target inline-flex min-h-11 items-center rounded-full border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] px-3 text-[11px] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:text-primary active:scale-95 md:hidden"
                >
                  Profile
                </Link>
                <button
                  type="button"
                  onClick={() => setNavOpen((v) => !v)}
                  aria-expanded={navOpen}
                  aria-label={navOpen ? "Hide navigation" : "Show navigation"}
                  className="hidden h-9 w-9 items-center justify-center rounded-full border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:text-primary active:scale-95 md:flex"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-4 w-4 transition-transform duration-300 ${navOpen ? "" : "rotate-180"}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="m6 15 6-6 6 6" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Desktop secondary rail — modes + full tab set */}
            {!isEasyMode && (
              <div
                className={`hidden transition-all duration-300 ease-out md:grid ${
                  navOpen
                    ? "grid-rows-[1fr] opacity-100"
                    : "pointer-events-none grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden">
                  {modes.length > 1 && (
                    <div
                      role="tablist"
                      aria-label="Navigation mode"
                      className="mt-3 flex gap-1 overflow-x-auto rounded-full border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    >
                      {NAV_MODES.filter((m) => modes.includes(m.id)).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          role="tab"
                          aria-selected={activeMode === m.id}
                          title={m.hint}
                          onClick={() => chooseMode(m.id)}
                          className={`min-h-11 flex-1 shrink-0 whitespace-nowrap rounded-full px-4 text-xs font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.98] ${
                            activeMode === m.id
                              ? "bg-primary/20 text-primary shadow-[0_0_18px_-6px_var(--color-primary)]"
                              : "text-muted-foreground hover:bg-primary/10 hover:text-foreground"
                          }`}
                        >
                          {tr.label(m.label)}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="relative mt-3">
                    {canLeft && (
                      <button
                        type="button"
                        aria-label="Scroll tabs left"
                        onClick={() => scrollTabs(-1)}
                        className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full border border-[color:var(--glass-border)] bg-surface px-2 py-1.5 text-[10px] text-primary shadow-lg lg:hidden"
                      >
                        ‹‹
                      </button>
                    )}
                    {canRight && (
                      <button
                        type="button"
                        aria-label="Scroll tabs right"
                        onClick={() => scrollTabs(1)}
                        className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full border border-[color:var(--glass-border)] bg-surface px-2 py-1.5 text-[10px] text-primary shadow-lg lg:hidden"
                      >
                        ››
                      </button>
                    )}
                    <nav
                      ref={navRef}
                      onScroll={updateArrows}
                      className={`-mx-1 flex snap-x snap-mandatory items-center gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:overflow-visible md:px-1 ${canLeft ? "pl-10" : "pl-1"} ${canRight ? "pr-10" : "pr-1"}`}
                    >
                      {navTabs.map((t) => (
                        <Link
                          key={t.to}
                          to={t.to}
                          preload="intent"
                          activeOptions={{ exact: "exact" in t && t.exact === true }}
                          activeProps={{ "aria-current": "page" }}
                          className="relative shrink-0 snap-start rounded-full border border-transparent px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-[color:var(--glass-border)] hover:bg-primary/10 hover:text-foreground active:scale-[0.98] data-[status=active]:border-primary/50 data-[status=active]:bg-primary/15 data-[status=active]:font-semibold data-[status=active]:text-primary data-[status=active]:shadow-[0_0_18px_-4px_var(--color-primary)] data-[status=active]:after:absolute data-[status=active]:after:-bottom-1 data-[status=active]:after:left-1/2 data-[status=active]:after:h-[3px] data-[status=active]:after:w-5 data-[status=active]:after:-translate-x-1/2 data-[status=active]:after:rounded-full data-[status=active]:after:bg-primary data-[status=active]:after:shadow-[0_0_10px_var(--color-primary)]"
                        >
                          {tr.ui(t.label)}
                          {t.roleLocked && !canUseMagicDude(roles, isPlatformAdmin, isTrial) && (
                            <span className="ml-1 text-[9px] font-semibold tracking-wide text-amber-500">
                              LOCKED
                            </span>
                          )}
                        </Link>
                      ))}
                    </nav>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-xs">
                    {(sitesQ.data?.length ?? 0) > 0 && (
                      <select
                        value={selectedSite?.id ?? ""}
                        onChange={(e) => {
                          const id = e.target.value;
                          if (!id) return setSelectedSite(null);
                          const s = sitesQ.data?.find((x) => x.id === id);
                          if (s) setSelectedSite({ id: s.id, name: s.name });
                        }}
                        className="max-w-[9rem] shrink truncate rounded-md border border-border bg-surface px-2 py-1 text-[11px]"
                        aria-label="Site filter"
                      >
                        <option value="">All sites</option>
                        {sitesQ.data?.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <span
                      className="inline-flex min-w-0 max-w-[12rem] items-center gap-1.5 truncate text-[11px] text-muted-foreground"
                      title={me.data?.email ?? accountLabel}
                    >
                      <span className="truncate">{accountLabel}</span>
                      {isPlatformAdmin ? <DevBadge /> : null}
                      {isAgent ? <VerifiedAgentBadge /> : null}
                    </span>
                    <Link
                      to="/app/profile"
                      className="shrink-0 rounded-full border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] px-2.5 py-1 text-[11px] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:text-primary active:scale-95"
                    >
                      Profile
                    </Link>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setNavOpen((v) => !v)}
              aria-expanded={navOpen}
              aria-label={navOpen ? "Hide navigation" : "Show navigation"}
              className="absolute -bottom-3 left-1/2 z-10 hidden h-6 w-16 -translate-x-1/2 items-center justify-center gap-1 rounded-full border border-[color:var(--glass-border)] bg-[color:var(--glass-bg)] backdrop-blur-xl transition hover:border-primary/50 hover:text-primary md:flex"
            >
              <span className="h-1 w-6 rounded-full bg-muted-foreground/50" />
              <svg
                viewBox="0 0 24 24"
                className={`h-3 w-3 shrink-0 transition-transform duration-300 ${navOpen ? "" : "rotate-180"}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m6 15 6-6 6 6" />
              </svg>
            </button>
          </div>
        </header>
        {isPending && (
          <div className="border-b border-sky-500/35 bg-sky-500/10">
            <div className="container-page flex flex-col gap-2 py-2 text-xs sm:flex-row sm:flex-wrap sm:items-center">
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-sky-500 shadow-[0_0_8px_#38bdf8]" />
                <span className="font-semibold text-sky-800 dark:text-sky-100">
                  Account not activated — read-only mode.
                </span>
              </span>
              <span className="text-sky-700/90 dark:text-sky-100/80">
                Contact your account holder to activate this account.
              </span>
            </div>
          </div>
        )}
        {isExpired && (
          <div className="border-b border-red-500/40 bg-red-500/10">
            <div className="container-page flex flex-col gap-3 py-2 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-red-500 shadow-[0_0_8px_#f87171]" />
                  <span className="font-semibold text-red-800 dark:text-red-200">
                    Account expired — cloud management paused.
                  </span>
                </span>
                <span className="text-red-700/90 dark:text-red-200/80">
                  Your RouterBoard hotspot keeps running for guests. Renew on Services to manage
                  routers, vouchers and portal from the app again.
                </span>
              </div>
              <Link
                to="/app/services"
                className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-red-500/50 px-2 py-1 font-medium text-red-800 transition-all duration-200 hover:-translate-y-0.5 hover:bg-red-500/20 active:scale-[0.98] sm:w-auto dark:text-red-100"
              >
                Renew on Services
              </Link>
            </div>
          </div>
        )}
        {expiringSoon && (
          <div className="border-b border-amber-500/40 bg-amber-500/10">
            <div className="container-page flex flex-col gap-3 py-2 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500 shadow-[0_0_8px_#fbbf24]" />
                  <span className="font-semibold text-amber-900 dark:text-amber-200">
                    {daysLeft === 1
                      ? "Your account expires tomorrow."
                      : `Your account expires in ${daysLeft} days.`}
                  </span>
                </span>
                <span className="text-amber-800/90 dark:text-amber-200/80">
                  After that it becomes read-only until reactivated.
                </span>
              </div>
              <Link
                to="/app/services"
                className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-amber-500/50 px-2 py-1 font-medium text-amber-900 transition-all duration-200 hover:-translate-y-0.5 hover:bg-amber-400/20 active:scale-[0.98] sm:w-auto dark:text-amber-100"
              >
                Request renewal
              </Link>
            </div>
          </div>
        )}

        <main
          className={isEasyMode ? "min-w-0" : "container-page app-shell-pad min-w-0 pt-4 sm:pt-8"}
        >
          {rolesUnresolved ? (
            <DelayedFallback
              loading={me.isPending}
              label="Loading workspace"
              className="min-h-[40vh]"
              fallback={
                <div className="grid gap-4 py-6">
                  <SkeletonCard />
                  <SkeletonList rows={3} />
                </div>
              }
            />
          ) : blocked ? null : (
            <Outlet />
          )}
        </main>

        {!rolesUnresolved && !isEasyMode && (
          <AppBottomNav
            roles={roles}
            features={features}
            isPlatformAdmin={isPlatformAdmin}
            hasActivePlus={hasActivePlus}
            isTrial={isTrial}
            activeMode={activeMode}
            modes={modes}
            onChooseMode={chooseMode}
          />
        )}
        {!rolesUnresolved && <MagicDudeChatPopup />}
      </div>
    </InAppNoticeProvider>
  );
}

function AccountExpiryNotices({
  userId,
  expired,
  expiringSoon,
  daysLeft,
}: {
  userId?: string;
  expired: boolean;
  expiringSoon: boolean;
  daysLeft: number | null;
}) {
  const { pushNotice } = useInAppNotice();
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    const key = expired ? `expired:${userId}` : expiringSoon ? `soon:${userId}:${daysLeft}` : null;
    if (!key || shown.current === key) return;
    shown.current = key;
    if (expired) {
      pushNotice({
        id: key,
        tone: "critical",
        title: "Your account has expired",
        body: "You have read-only access. Contact your account holder on Telegram to reactivate.",
      });
    } else if (expiringSoon) {
      pushNotice({
        id: key,
        tone: "caution",
        title:
          daysLeft === 1
            ? "Your account expires tomorrow"
            : `Your account expires in ${daysLeft} days`,
        body: "Open Services to renew before the account switches to read-only.",
      });
    }
  }, [userId, expired, expiringSoon, daysLeft, pushNotice]);
  return null;
}
