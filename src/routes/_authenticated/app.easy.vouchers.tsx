import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { createClientOnlyFn, useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  Database,
  Minus,
  Plus,
  Printer,
  Router,
  ShieldCheck,
  SlidersHorizontal,
  Ticket,
  UsersRound,
  Wifi,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { classifyVoucherPlan, planLimitLabel } from "@/lib/portal/plan-groups";
import { issuePlanVouchers, listPlans, listVoucherCodes } from "@/lib/portal.functions";
import { listRouters } from "@/lib/routers.functions";
import { isVirtualRouter } from "@/lib/test-router";
import {
  EasyModeBottomNav as SharedEasyModeBottomNav,
  EasyModeHeader,
} from "@/components/EasyModeBottomNav";
import { useT } from "@/lib/i18n";
import { uniquePlanDetail } from "@/lib/easy-mode-ui";
import { getVoucherPrintLayout } from "@/lib/voucher-print-layout.functions";
import type { VoucherPrintLayout } from "@/lib/voucher-print-layout";

const printEasyVoucherBatch = createClientOnlyFn(
  async (
    vouchers: Array<{ code: string; profile: string; priceMmk?: number }>,
    layout: VoucherPrintLayout,
  ) => {
    const { printVoucherBatch } = await import("@/lib/voucher-print.client");
    return printVoucherBatch(vouchers, layout);
  },
);

const easyPath = (screen: string) => `/app/easy/${screen}` as never;

export const Route = createFileRoute("/_authenticated/app/easy/vouchers")({
  head: () => ({
    meta: [{ title: "Voucher codes — MikroTik Magic" }, { name: "robots", content: "noindex" }],
  }),
  component: EasyVoucherCodes,
});

const glass = "easy-card rounded-[1.75rem] border shadow-xl shadow-black/20";

function EasyVoucherCodes() {
  const t = useT();
  const fetchRouters = useServerFn(listRouters);
  const fetchPlans = useServerFn(listPlans);
  const fetchCodes = useServerFn(listVoucherCodes);
  const issue = useServerFn(issuePlanVouchers);
  const fetchPrintLayout = useServerFn(getVoucherPrintLayout);
  const routers = useQuery({ queryKey: ["easy-routers"], queryFn: () => fetchRouters() });
  const plans = useQuery({ queryKey: ["easy-plans"], queryFn: () => fetchPlans() });
  const printLayout = useQuery({
    queryKey: ["voucher-print-layout"],
    queryFn: () => fetchPrintLayout(),
  });
  const physicalRouters = (routers.data ?? []).filter((router) => !isVirtualRouter(router));
  const [selectedRouterId, setSelectedRouterId] = useState("");
  const [mode, setMode] = useState<"default" | "custom">("default");
  const [category, setCategory] = useState<"time" | "data">("time");
  const [quantity, setQuantity] = useState(20);
  const [selectedPlan, setSelectedPlan] = useState("");
  const [issuedCodes, setIssuedCodes] = useState<string[]>([]);
  const [issuing, setIssuing] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const selectedRouter =
    physicalRouters.find((router) => router.id === selectedRouterId) ?? physicalRouters[0];
  const codes = useQuery({
    queryKey: ["easy-voucher-codes", selectedRouter?.id],
    queryFn: () => fetchCodes({ data: { routerId: selectedRouter?.id } }),
    enabled: Boolean(selectedRouter?.id),
  });
  const availablePlans = (plans.data ?? []).filter((plan) => plan.status !== "inactive");
  const planOptions = Array.from(
    new Map(
      availablePlans
        .filter((plan) => {
          const group = classifyVoucherPlan({ ...plan, plan_key: plan.plan_key ?? "" });
          const matchesMode = mode === "custom" ? group === "custom" : group !== "custom";
          const matchesCategory =
            category === "data"
              ? Number(plan.data_quota_mb ?? 0) > 0
              : Number(plan.duration_minutes ?? 0) > 0;
          return matchesMode && matchesCategory;
        })
        .map(
          (plan) =>
            [
              `${plan.label}|${plan.price_mmk}|${planLimitLabel({ ...plan, plan_key: plan.plan_key ?? "" })}`,
              plan,
            ] as const,
        ),
    ).values(),
  ).slice(0, 6);
  const selectedPlanRow = planOptions.find((plan) => plan.id === selectedPlan);
  const activePlanId = selectedPlanRow?.id ?? planOptions[0]?.id ?? "";
  const activePlan = planOptions.find((plan) => plan.id === activePlanId);
  const recentBatches = groupRecentBatches(codes.data ?? []).slice(0, 3);

  async function generateCodes() {
    if (!selectedRouter?.id || !activePlanId) {
      setMessage({
        text: "Connect a router and create at least one active voucher plan first.",
        tone: "error",
      });
      return;
    }
    setMessage(null);
    setIssuedCodes([]);
    setIssuing(true);
    try {
      const result = await issue({
        data: { routerId: selectedRouter.id, planId: activePlanId, count: quantity },
      });
      setIssuedCodes(result.issued);
      setSelectedPlan(activePlanId);
      setMessage({
        text: `${result.issued.length} voucher codes created for ${result.planLabel}.`,
        tone: "success",
      });
      void codes.refetch();
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Could not create voucher codes.",
        tone: "error",
      });
    } finally {
      setIssuing(false);
    }
  }
  return (
    <div className="easy-mode-root min-h-[100dvh] bg-transparent pb-28 text-foreground">
      <EasyModeHeader
        title={t.ui("Voucher codes")}
        subtitle={t.ui("Create access codes for your guests")}
        back
      />
      <main className="mx-auto grid max-w-2xl gap-4 px-4 py-5 sm:px-6 sm:py-7">
        <section className={`${glass} space-y-3 p-4`} aria-label="Voucher destination">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Router className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-xs text-primary">{t.ui("Selling at")}</p>
              <p className="font-semibold">{t.ui("Choose your hotspot")}</p>
            </div>
          </div>
          {physicalRouters.length > 0 ? (
            <label className="relative block">
              <span className="sr-only">Hotspot router</span>
              <select
                value={selectedRouter?.id ?? ""}
                onChange={(event) => setSelectedRouterId(event.target.value)}
                className="w-full appearance-none rounded-2xl border border-input bg-background/70 px-4 py-3 pr-10 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
              >
                <option value="" disabled>
                  {t.ui("Select a router")}
                </option>
                {physicalRouters.map((router) => (
                  <option key={router.id} value={router.id}>
                    {router.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-primary"
                aria-hidden
              />
            </label>
          ) : (
            <div className="flex items-start gap-2 rounded-2xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                {t.ui(
                  routers.isError
                    ? "Could not load your routers. Try again before creating vouchers."
                    : "Connect a physical router before creating vouchers.",
                )}
              </span>
            </div>
          )}
        </section>
        <div
          className={`${glass} grid grid-cols-2 gap-1 p-1`}
          role="tablist"
          aria-label="Plan source"
        >
          <ModeButton
            active={mode === "default"}
            icon={Ticket}
            label="MikroTik defaults"
            onClick={() => {
              setMode("default");
              setSelectedPlan("");
            }}
          />
          <ModeButton
            active={mode === "custom"}
            icon={SlidersHorizontal}
            label="My plans"
            onClick={() => {
              setMode("custom");
              setSelectedPlan("");
            }}
          />
        </div>
        <div
          className={`${glass} grid grid-cols-2 gap-1 p-1`}
          role="tablist"
          aria-label="Plan type"
        >
          <ModeButton
            active={category === "time"}
            icon={Clock3}
            label="Time"
            onClick={() => {
              setCategory("time");
              setSelectedPlan("");
            }}
          />
          <ModeButton
            active={category === "data"}
            icon={Database}
            label="Data"
            onClick={() => {
              setCategory("data");
              setSelectedPlan("");
            }}
          />
        </div>
        <section aria-label="Voucher plans" className="grid grid-cols-2 gap-3">
          {plans.isPending ? (
            <PlanLoading />
          ) : plans.isError ? (
            <div
              className="col-span-2 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
              role="alert"
            >
              {t.ui("Could not load voucher plans. Try again in a moment.")}
            </div>
          ) : (
            planOptions.map((plan) => (
              <PlanCard
                key={plan.id}
                active={activePlanId === plan.id}
                title={plan.label}
                detail={planLimitLabel({ ...plan, plan_key: plan.plan_key ?? "" })}
                price={plan.price_label ?? `${plan.price_mmk} MMK`}
                icon={category === "time" ? CalendarDays : Database}
                onClick={() => setSelectedPlan(plan.id)}
              />
            ))
          )}
        </section>
        {!plans.isPending && !plans.isError && planOptions.length === 0 && (
          <EmptyPlans mode={mode} category={category} />
        )}
        <section className={`${glass} flex items-center justify-between gap-3 p-4`}>
          <div>
            <span className="block text-sm font-medium">{t.ui("How many codes?")}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {t.ui("Up to 100 per batch")}
            </span>
          </div>
          <div className="flex items-center rounded-full border border-border bg-background/60">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              className="p-3 text-muted-foreground"
            >
              <Minus className="h-4 w-4" aria-hidden />
            </button>
            <span className="min-w-10 text-center text-lg font-semibold">{quantity}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => setQuantity((value) => Math.min(100, value + 1))}
              className="p-3 text-primary"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </section>
        <section
          className={`${glass} border-primary/20 bg-primary/10 p-4`}
          aria-label="Voucher summary"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-primary">{t.ui("Ready to sell")}</p>
              <p className="mt-1 font-semibold">
                {quantity} × {activePlan?.label ?? "Choose a plan"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {activePlan
                  ? `${planLimitLabel({ ...activePlan, plan_key: activePlan.plan_key ?? "" })} · ${activePlan.price_label ?? `${activePlan.price_mmk} MMK`} each`
                  : t.ui("Select a plan to continue")}
              </p>
            </div>
            <p className="text-right text-lg font-semibold text-primary">
              {activePlan ? `${(activePlan.price_mmk * quantity).toLocaleString()} MMK` : "—"}
            </p>
          </div>
        </section>
        <button
          type="button"
          onClick={() => void generateCodes()}
          disabled={
            routers.isPending ||
            plans.isPending ||
            codes.isFetching ||
            issuing ||
            !selectedRouter?.id ||
            !activePlanId
          }
          className="flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-4 text-base font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Ticket className="h-5 w-5" aria-hidden />
          {issuing ? "Creating codes…" : `Generate ${quantity} codes`}
        </button>
        {message && (
          <div
            role={message.tone === "error" ? "alert" : "status"}
            className={`flex items-start gap-2 rounded-2xl border p-3 text-sm ${message.tone === "error" ? "border-red-300/30 bg-red-400/10 text-red-200" : "border-primary/25 bg-primary/10 text-primary"}`}
          >
            {message.tone === "error" ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            )}
            <span>{message.text}</span>
          </div>
        )}
        {issuedCodes.length > 0 && (
          <section className={`${glass} p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{t.ui("Your codes are ready")}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.ui("Keep them private until you hand them to guests.")}
                </p>
              </div>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-primary"
                onClick={() => void navigator.clipboard?.writeText(issuedCodes.join("\n"))}
              >
                <Copy className="h-4 w-4" aria-hidden />
                {t.ui("Copy all")}
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {issuedCodes.map((code) => (
                <code
                  key={code}
                  className="rounded-xl border border-border bg-muted/70 px-3 py-2 text-sm tracking-wider text-primary"
                >
                  {code}
                </code>
              ))}
            </div>
            <div className="mt-4">
              <button
                type="button"
                disabled={!printLayout.data}
                onClick={() =>
                  printLayout.data &&
                  void printEasyVoucherBatch(
                    issuedCodes.map((code) => ({
                      code,
                      profile: activePlan?.label ?? "Voucher",
                      priceMmk: activePlan?.price_mmk,
                    })),
                    printLayout.data,
                  )
                }
                className="flex w-full items-center justify-center gap-2 rounded-full border border-primary/40 px-3 py-3 text-sm text-primary disabled:opacity-50"
              >
                <Printer className="h-4 w-4" aria-hidden />
                {t.ui("Print this batch")}
              </button>
            </div>
          </section>
        )}
        <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-amber-300" aria-hidden />
          {t.ui("Codes are single-use and protected")}
        </p>
        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t.ui("Recent batches")}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {t.ui("Created for this hotspot")}
              </p>
            </div>
          </div>
          {codes.isPending ? (
            <p className="rounded-2xl border border-border p-4 text-sm text-muted-foreground">
              {t.ui("Loading your batches…")}
            </p>
          ) : codes.isError ? (
            <p
              className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
              role="alert"
            >
              {t.ui("Could not load recent batches for this hotspot.")}
            </p>
          ) : recentBatches.length > 0 ? (
            <div className="grid gap-2">
              {recentBatches.map((batch) => (
                <BatchRow
                  key={batch.key}
                  count={`${batch.count} codes`}
                  plan={batch.plan}
                  time={formatRelativeTime(batch.createdAt)}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              {t.ui("No batches yet. Your first generated codes will appear here.")}
            </p>
          )}
        </section>
      </main>
      <SharedEasyModeBottomNav active="Sell" />
    </div>
  );
}

function ModeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active?: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex min-h-12 items-center justify-center gap-2 rounded-full text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? "bg-primary/15 font-semibold text-primary ring-1 ring-primary/60" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"}`}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}
function PlanCard({
  active,
  title,
  detail,
  price,
  icon: Icon,
  onClick,
}: {
  active?: boolean;
  title: string;
  detail: string;
  price: string;
  icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`${glass} relative flex min-h-32 flex-col items-start justify-between gap-3 p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? "border-primary bg-primary/10 ring-1 ring-primary/70" : "hover:border-primary/50"}`}
    >
      <div className="flex w-full items-center justify-between">
        <Icon className="h-6 w-6 text-primary" aria-hidden />
        {active && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="h-3 w-3" aria-hidden />
          </span>
        )}
      </div>
      <span>
        <span className="block text-sm font-semibold leading-tight">{title}</span>
        {uniquePlanDetail(title, detail) && (
          <span className="mt-1 block text-xs text-muted-foreground">{detail}</span>
        )}
        <span className="mt-2 block text-sm font-semibold text-primary">{price}</span>
      </span>
    </button>
  );
}
function PlanLoading() {
  return (
    <>
      <div className={`${glass} h-32 animate-pulse bg-muted/70`} />
      <div className={`${glass} h-32 animate-pulse bg-muted/70`} />
    </>
  );
}
function EmptyPlans({ mode, category }: { mode: "default" | "custom"; category: "time" | "data" }) {
  return (
    <div className="col-span-2 rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
      <p>
        No {mode === "custom" ? "custom" : "default"} {category} plans are ready yet.
      </p>
      <Link
        to={easyPath("voucher-plans")}
        className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-primary/40 px-4 font-semibold text-primary"
      >
        Manage plans <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
function groupRecentBatches(
  rows: Array<{
    id: string;
    plan_id: string | null;
    plan_key: string;
    plan_label: string;
    created_at: string;
  }>,
) {
  const groups = new Map<string, { key: string; count: number; plan: string; createdAt: string }>();
  for (const row of rows) {
    const created = row.created_at.slice(0, 16);
    const key = `${row.plan_id ?? row.plan_key}:${created}`;
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { key, count: 1, plan: row.plan_label, createdAt: row.created_at });
  }
  return Array.from(groups.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
function formatRelativeTime(value: string) {
  const age = Date.now() - new Date(value).getTime();
  if (age < 60_000) return "Just now";
  if (age < 3_600_000) return `${Math.floor(age / 60_000)} min ago`;
  if (age < 86_400_000) return `${Math.floor(age / 3_600_000)} hr ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function BatchRow({ count, plan, time }: { count: string; plan: string; time: string }) {
  return (
    <div className={`${glass} flex items-center gap-3 p-3 text-sm`}>
      <Ticket className="h-5 w-5 text-primary" aria-hidden />
      <span className="flex-1">
        <b>{count}</b>
        <span className="mx-2 text-muted-foreground">·</span>
        <span className="text-primary">{plan}</span>
        <span className="mx-2 text-muted-foreground">·</span>
        <span className="text-muted-foreground">{time}</span>
      </span>
    </div>
  );
}
