import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  CircleCheck,
  CircleDollarSign,
  Globe2,
  Home,
  Network,
  Printer,
  Router,
  ShieldCheck,
  Ticket,
  UsersRound,
  Wifi,
} from "lucide-react";
import { getMe } from "@/lib/auth.functions";
import { getBusinessSnapshot } from "@/lib/business.functions";
import { getOverviewSummary } from "@/lib/overview.functions";
import { routersStatus } from "@/lib/routers.functions";
import { MagicHubSparkles } from "@/components/MagicHubSparkle";
import {
  EasyModeBottomNav as SharedEasyModeBottomNav,
  EasyModeHeader,
} from "@/components/EasyModeBottomNav";
import { useT } from "@/lib/i18n";
import { easyGreeting } from "@/lib/easy-mode-ui";

export const Route = createFileRoute("/_authenticated/app/easy")({
  head: () => ({
    meta: [{ title: "Easy Mode — MikroTik Magic" }, { name: "robots", content: "noindex" }],
  }),
  component: EasyMode,
});

const glass = "easy-card rounded-[1.75rem] border shadow-xl shadow-black/20";
const easyPath = (screen: string) => `/app/easy/${screen}` as never;

function EasyMode() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return pathname.replace(/\/+$/, "") === "/app/easy" ? <EasyHome /> : <Outlet />;
}

type Summary = { activeVouchers?: number; activeSessions?: number };
type BusinessSnapshot = {
  revenue?: { today?: number; last7?: number; currency?: string };
  revenueDaily7?: number[];
  activeSessions?: number | null;
  sites?: Array<{ id: string; name: string; routerIds: string[] }>;
};
type RouterStatus = { name: string; online: boolean };

function EasyHome() {
  const t = useT();
  const fetchMe = useServerFn(getMe);
  const fetchBusiness = useServerFn(getBusinessSnapshot);
  const fetchSummary = useServerFn(getOverviewSummary);
  const fetchStatus = useServerFn(routersStatus);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const business = useQuery({
    queryKey: ["business-snapshot"],
    queryFn: () => fetchBusiness(),
    staleTime: 30_000,
  });
  const summary = useQuery({
    queryKey: ["overview-summary"],
    queryFn: () => fetchSummary(),
    staleTime: 30_000,
  });
  const status = useQuery({
    queryKey: ["routers-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 60_000,
  });
  const overview = summary.data as Summary | undefined;
  const snapshot = business.data as BusinessSnapshot | undefined;
  const routers = (status.data as { routers?: RouterStatus[] } | undefined)?.routers ?? [];
  const onlineRouters = routers.filter((router) => router.online).length;
  const router = routers[0];
  const displayName =
    me.data?.profile?.display_name ?? me.data?.email?.split("@")[0] ?? t.ui("there");
  const currency = snapshot?.revenue?.currency ?? "MMK";
  const money = (value?: number) => (value == null ? "—" : `${value.toLocaleString()} ${currency}`);
  const networkState = status.isPending
    ? t.ui("Checking")
    : status.isError
      ? t.ui("Unavailable")
      : onlineRouters > 0
        ? t.ui("Online")
        : t.ui("Needs attention");
  const greeting = t.ui(easyGreeting(new Date().getHours()));
  const revenueBars = snapshot?.revenueDaily7 ?? [];
  const maxRevenue = Math.max(...revenueBars, 1);
  const nextStep = router
    ? {
        label: t.ui("Finish your guest portal"),
        detail: t.ui("Add a welcome message and logo for guests."),
        to: easyPath("guest-portal"),
        icon: Wifi,
      }
    : {
        label: t.ui("Connect your first router"),
        detail: t.ui("Add your MikroTik before setting up guest access."),
        to: easyPath("connect-router"),
        icon: Router,
      };
  const NextStepIcon = nextStep.icon;

  return (
    <div className="easy-mode-root min-h-[100dvh] overflow-x-clip bg-transparent pb-28 text-foreground">
      <EasyModeHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <section className="mb-5 flex flex-col gap-2 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-kicker text-xs uppercase tracking-[0.2em]">
              {t.ui("Your hotspot, simplified")}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              {greeting}, <span className="gradient-text">{displayName}</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t.ui("Everything you need to sell Wi-Fi access today.")}
            </p>
          </div>
          <span className="w-fit rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs font-medium text-muted-foreground">
            {snapshot?.sites?.length
              ? `${snapshot.sites.length} ${t.ui(snapshot.sites.length === 1 ? "site" : "sites")}`
              : t.ui("Your first site")}
          </span>
        </section>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,.65fr)]">
          <section
            className={`${glass} bg-background/55 p-5 sm:p-6`}
            aria-labelledby="easy-sales-heading"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-kicker text-[10px] uppercase tracking-[0.2em]">
                  {t.ui("Today's sales")}
                </p>
                <h2
                  id="easy-sales-heading"
                  className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl"
                >
                  {money(snapshot?.revenue?.today)}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {overview?.activeVouchers == null
                    ? t.ui("Voucher totals are loading")
                    : `${overview.activeVouchers} ${t.ui(overview.activeVouchers === 1 ? "active voucher" : "active vouchers")}`}{" "}
                  · {snapshot?.activeSessions == null ? "—" : snapshot.activeSessions}{" "}
                  {t.ui("active guests")}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                <CircleCheck className="h-3.5 w-3.5" aria-hidden />
                {t.ui("Live")}
              </span>
            </div>
            <div className="mt-6">
              <div
                className="flex h-16 items-end gap-1.5"
                aria-label={t.ui("Revenue over the last 7 days")}
              >
                {revenueBars.length ? (
                  revenueBars.map((value, index) => (
                    <span
                      key={`${value}-${index}`}
                      className={`min-w-0 flex-1 rounded-t-md ${index >= revenueBars.length - 2 ? "bg-primary" : "bg-primary/35"}`}
                      style={{ height: `${Math.max(8, (value / maxRevenue) * 100)}%` }}
                    />
                  ))
                ) : (
                  <span className="self-center text-xs text-muted-foreground">
                    {t.ui("Sales history will appear here")}
                  </span>
                )}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                <span>{t.ui("Last 7 days")}</span>
                <span>{money(snapshot?.revenue?.last7)}</span>
              </div>
            </div>
          </section>
          <section
            className={`${glass} relative overflow-hidden p-5`}
            aria-labelledby="magic-hub-heading"
          >
            <MagicHubSparkles />
            <div className="relative z-[1]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-kicker text-[10px] uppercase tracking-[0.2em]">
                    {t.ui("Magic Hub")}
                  </p>
                  <h2 id="magic-hub-heading" className="mt-2 text-xl font-semibold">
                    {router?.name ?? t.ui("Your network")}
                  </h2>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${networkState === t.ui("Online") ? "bg-primary/10 text-primary" : "bg-warning/10 text-warning"}`}
                >
                  ● {networkState}
                </span>
              </div>
              <div className="my-6 flex items-start">
                <NetworkNode icon={Globe2} label={t.ui("WAN")} />
                <span className="mt-5 h-px flex-1 bg-primary/35" />
                <NetworkNode icon={Router} label={t.ui("Router")} />
                <span className="mt-5 h-px flex-1 bg-primary/35" />
                <NetworkNode icon={Network} label={t.ui("Hub")} />
              </div>
              <Link
                to="/app/live"
                className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                {t.ui("View hotspot health")} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              {status.isError && (
                <p className="mt-3 text-xs text-warning">
                  {t.ui("We could not confirm the router right now.")}
                </p>
              )}
            </div>
          </section>
        </div>
        <section className="mt-7" aria-labelledby="quick-actions-heading">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-kicker text-[10px] uppercase tracking-[0.2em]">
                {t.ui("Quick actions")}
              </p>
              <h2 id="quick-actions-heading" className="mt-1 text-xl font-semibold">
                {t.ui("Run your business")}
              </h2>
            </div>
            <span className="text-xs text-muted-foreground">{t.ui("Tap a tile to begin")}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <ActionCard
              to="/app/easy/vouchers"
              icon={Ticket}
              label={t.ui("Sell vouchers")}
              detail={t.ui("Create access codes")}
            />
            <ActionCard
              to={easyPath("print-slips")}
              icon={Printer}
              label={t.ui("Print slips")}
              detail={t.ui("Ready to hand out")}
            />
            <ActionCard
              to={easyPath("guests")}
              icon={UsersRound}
              label={t.ui("Guests")}
              detail={`${snapshot?.activeSessions ?? "—"} ${t.ui("devices online")}`}
            />
            <ActionCard
              to={easyPath("protect-hotspot")}
              icon={ShieldCheck}
              label={t.ui("Protect hotspot")}
              detail={t.ui("Review security checks")}
              tone="warning"
            />
          </div>
        </section>
        <section
          className={`${glass} mt-5 flex items-center gap-3 p-4`}
          aria-label={t.ui("Next step")}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <NextStepIcon className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-primary">{t.ui("Next step")}</p>
            <p className="mt-0.5 text-sm font-semibold">{nextStep.label}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {nextStep.detail}
            </p>
          </div>
          <Link
            to={nextStep.to}
            className="shrink-0 rounded-full border border-primary/40 px-3 py-2 text-xs font-semibold text-primary"
          >
            {t.ui("Continue")}
          </Link>
        </section>
        <div className="mt-6 flex justify-end">
          <Link
            to="/app/revenue"
            className="inline-flex items-center gap-2 text-xs text-muted-foreground transition hover:text-primary"
          >
            <CircleDollarSign className="h-4 w-4" aria-hidden />
            {t.ui("See revenue details")} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </main>
      <SharedEasyModeBottomNav active="Home" />
    </div>
  );
}

function ActionCard({
  to,
  icon: Icon,
  label,
  detail,
  tone,
}: {
  to: string;
  icon: typeof Home;
  label: string;
  detail: string;
  tone?: "warning";
}) {
  return (
    <Link
      to={to}
      className={`${glass} group min-h-32 p-4 transition hover:-translate-y-0.5 hover:border-primary/50 focus-visible:-translate-y-0.5 focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-36`}
    >
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone === "warning" ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary"}`}
      >
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <span className="mt-4 block text-sm font-semibold leading-tight">{label}</span>
      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{detail}</span>
      <ArrowRight
        className="mt-3 h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary"
        aria-hidden
      />
    </Link>
  );
}
function NetworkNode({ icon: Icon, label }: { icon: typeof Home; label: string }) {
  return (
    <div className="flex min-w-12 flex-col items-center gap-2 text-center text-[10px] text-muted-foreground">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span>{label}</span>
    </div>
  );
}
