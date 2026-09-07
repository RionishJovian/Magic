import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listOrders,
  listSessions,
  recordCashSale,
  refundOrder,
  cancelOrder,
  revenueBreakdown,
  syncRouterSessions,
  requireFinanceAccess,
} from "@/lib/orders.functions";
import { listPlans } from "@/lib/portal.functions";
import { listRouters } from "@/lib/routers.functions";
import { fmtDateTime, fmtMMK } from "@/lib/time";
import { useT } from "@/lib/i18n";
import { ReceiptReviewPanel } from "@/components/ReceiptReviewPanel";
import { BankSettingsPanel } from "@/components/BankSettingsPanel";
import { DelayedFallback, SkeletonList } from "@/components/ui/skeleton";
import { ButtonSpinner } from "@/components/ui/button";
import { isVirtualRouter } from "@/lib/test-router";
import { useSelectedSite } from "@/hooks/useSelectedSite";
import { toErrorMessage } from "@/lib/error-message";

export const Route = createFileRoute("/_authenticated/app/orders")({
  // Payments (Business nav): the server decides, not the nav tab alone. A deep
  // link from a non-privileged account is bounced before any financial data is fetched.
  beforeLoad: async () => {
    try {
      await requireFinanceAccess();
    } catch {
      throw redirect({ to: "/app" });
    }
  },
  head: () => ({
    meta: [
      { title: "Payments — MikroTik Hotspot Admin" },
      {
        name: "description",
        content:
          "Track hotspot orders, cash sales, refunds, bank details and guest session accounting.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrdersPage,
});

const STATUS_STYLE: Record<string, string> = {
  settled: "bg-emerald-500/15 text-emerald-300",
  pending: "bg-amber-500/15 text-amber-300",
  failed: "bg-red-500/15 text-red-300",
  refunded: "bg-sky-500/15 text-sky-300",
  cancelled: "bg-muted text-muted-foreground",
  open: "bg-emerald-500/15 text-emerald-300",
  closed: "bg-muted text-muted-foreground",
  stale: "bg-amber-500/15 text-amber-300",
  queued: "bg-sky-500/15 text-sky-300",
};

function Pill({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
        STATUS_STYLE[value] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {value}
    </span>
  );
}

function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function duration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function State({
  loading,
  error,
  empty,
  emptyText,
  children,
}: {
  loading: boolean;
  error: unknown;
  empty: boolean;
  emptyText: string;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <DelayedFallback
        loading
        label="Loading"
        fallback={<SkeletonList rows={5} className="p-4" />}
      />
    );
  }
  if (error)
    return (
      <p role="alert" className="p-4 text-sm text-red-300">
        {error instanceof Error ? error.message : "Something went wrong."}
      </p>
    );
  if (empty) return <p className="p-4 text-sm text-muted-foreground">{emptyText}</p>;
  return <>{children}</>;
}

function newKey() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function OrdersPage() {
  const t = useT();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"orders" | "reviews" | "sessions" | "banks">("orders");
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const fetchOrders = useServerFn(listOrders);
  const fetchSessions = useServerFn(listSessions);
  const fetchRevenue = useServerFn(revenueBreakdown);
  const fetchPlans = useServerFn(listPlans);
  const fetchRouters = useServerFn(listRouters);
  const cashFn = useServerFn(recordCashSale);
  const refundFn = useServerFn(refundOrder);
  const cancelFn = useServerFn(cancelOrder);
  const syncFn = useServerFn(syncRouterSessions);

  const orders = useQuery({ queryKey: ["orders"], queryFn: () => fetchOrders({ data: {} }) });
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => fetchSessions({ data: {} }) });
  const revenue = useQuery({ queryKey: ["revenue-breakdown"], queryFn: () => fetchRevenue({}) });
  const plans = useQuery({ queryKey: ["portal-plans"], queryFn: () => fetchPlans({}) });
  const routers = useQuery({ queryKey: ["routers"], queryFn: () => fetchRouters({}) });
  const { site: selectedSite } = useSelectedSite();

  const physicalRouters = useMemo(
    () =>
      (routers.data ?? []).filter(
        (r) => !isVirtualRouter(r) && (selectedSite ? r.site_id === selectedSite.id : true),
      ),
    [routers.data, selectedSite],
  );

  const [planId, setPlanId] = useState<string>("");
  const [routerId, setRouterId] = useState<string>("");
  const [note, setNote] = useState("");
  const cashKey = useRef(newKey());

  useEffect(() => {
    if (routerId && physicalRouters.some((r) => r.id === routerId)) return;
    if (physicalRouters[0]?.id) setRouterId(physicalRouters[0].id);
  }, [physicalRouters, routerId]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["orders"] });
    void qc.invalidateQueries({ queryKey: ["revenue-breakdown"] });
  };

  const cash = useMutation({
    mutationFn: async () => {
      if (!planId) throw new Error("Pick a plan first.");
      if (!routerId) throw new Error("Pick a router first — codes are provisioned on RouterOS.");
      return cashFn({
        data: {
          plan_id: planId,
          router_id: routerId,
          note: note || undefined,
          idempotency_key: cashKey.current,
        },
      });
    },
    onSuccess: (r) => {
      cashKey.current = newKey();
      setNote("");
      toast.success(r.code ? `Cash sale recorded — code ${r.code}` : "Cash sale recorded");
      invalidate();
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const refund = useMutation({
    mutationFn: (id: string) => refundFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Order refunded");
      invalidate();
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Order cancelled");
      invalidate();
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const sync = useMutation({
    mutationFn: (router_id: string) => syncFn({ data: { router_id } }),
    onSuccess: (r) => {
      if (r.reachable)
        toast.success(`Sessions reconciled (${r.inserted} new, ${r.updated} updated)`);
      else toast.warning("Router unreachable — open sessions marked as stale, nothing was closed.");
      void qc.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const detail = useMemo(
    () => (sessions.data ?? []).find((s) => s.id === selectedSession) ?? null,
    [sessions.data, selectedSession],
  );

  const rev = revenue.data;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{t.label("Payments")}</h1>
        <p className="text-sm text-muted-foreground">
          {t.copy(
            "Back-office only. Cash sales, bank-transfer receipts and the guest sessions they paid for. Vouchers are only issued once a sale is recorded.",
          )}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Today (net)
          </div>
          <div className="mt-1 text-xl font-semibold">{fmtMMK(rev?.today.net ?? 0)}</div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Bank transfer (30d)
          </div>
          <div className="mt-1 text-xl font-semibold">{fmtMMK(rev?.month.online ?? 0)}</div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Cash (30d)
          </div>
          <div className="mt-1 text-xl font-semibold">{fmtMMK(rev?.month.cash ?? 0)}</div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Refunds (30d)
          </div>
          <div className="mt-1 text-xl font-semibold">{fmtMMK(rev?.month.refunds ?? 0)}</div>
        </div>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible">
        {(["orders", "reviews", "sessions", "banks"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`min-h-11 shrink-0 snap-start rounded-xl px-4 text-sm ${
              tab === id
                ? "bg-primary text-primary-foreground"
                : "glass-panel text-muted-foreground"
            }`}
          >
            {id === "orders"
              ? "Orders"
              : id === "reviews"
                ? "Receipts"
                : id === "sessions"
                  ? "Sessions"
                  : "Bank details"}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <>
          <section className="glass-panel space-y-3 rounded-2xl p-4">
            <h2 className="text-sm font-medium">Record a cash sale</h2>
            <p className="text-xs text-muted-foreground">
              Each sale issues a voucher code on the selected router so it works at the captive
              portal immediately.
            </p>
            <div className="flex flex-wrap gap-2">
              <select
                aria-label="Router"
                value={routerId}
                onChange={(e) => setRouterId(e.target.value)}
                className="min-h-11 min-w-40 flex-1 rounded-xl border border-border/60 bg-background/60 px-3 text-sm"
              >
                <option value="">Select router…</option>
                {physicalRouters.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Plan"
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                className="min-h-11 min-w-40 flex-1 rounded-xl border border-border/60 bg-background/60 px-3 text-sm"
              >
                <option value="">Select plan…</option>
                {(plans.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} — {p.price_label}
                  </option>
                ))}
              </select>
              <input
                aria-label="Note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional)"
                className="min-h-11 min-w-40 flex-1 rounded-xl border border-border/60 bg-background/60 px-3 text-sm"
              />
              <button
                type="button"
                disabled={cash.isPending || !planId || !routerId}
                aria-busy={cash.isPending || undefined}
                onClick={() => cash.mutate()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all duration-200 disabled:opacity-50"
              >
                {cash.isPending && <ButtonSpinner />}
                {cash.isPending ? "Recording…" : "Record cash sale"}
              </button>
            </div>
          </section>

          <section className="glass-panel overflow-hidden rounded-2xl">
            <State
              loading={orders.isLoading}
              error={orders.error}
              empty={(orders.data ?? []).length === 0}
              emptyText="No orders yet. They appear here when you record a cash sale or approve a bank transfer."
            >
              <ul className="divide-y divide-border/40 md:hidden">
                {(orders.data ?? []).map((o) => (
                  <li key={o.id} className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{o.plan_label}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {fmtDateTime(o.created_at)}
                        </div>
                      </div>
                      <Pill value={o.status} />
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="text-foreground">{fmtMMK(o.amount_minor)}</span>
                      <span>{o.method}</span>
                      <span className="font-mono">{o.issued_code ?? "—"}</span>
                    </div>
                    {(o.status === "settled" || o.status === "pending") && (
                      <div className="flex gap-2">
                        {o.status === "settled" && (
                          <button
                            type="button"
                            onClick={() => refund.mutate(o.id)}
                            className="min-h-11 flex-1 rounded-lg border border-border/60 px-3 text-xs"
                          >
                            Refund
                          </button>
                        )}
                        {o.status === "pending" && (
                          <button
                            type="button"
                            onClick={() => cancel.mutate(o.id)}
                            className="min-h-11 flex-1 rounded-lg border border-border/60 px-3 text-xs"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[640px] table-fixed text-sm">
                  <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="w-[26%] p-3 font-medium">Plan</th>
                      <th className="w-[16%] p-3 font-medium">Amount</th>
                      <th className="w-[14%] p-3 font-medium">Method</th>
                      <th className="w-[14%] p-3 font-medium">Status</th>
                      <th className="w-[16%] p-3 font-medium">Code</th>
                      <th className="w-[14%] p-3 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(orders.data ?? []).map((o) => (
                      <tr key={o.id} className="border-t border-border/40 align-top">
                        <td className="break-words p-3">
                          <div className="font-medium">{o.plan_label}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {fmtDateTime(o.created_at)}
                          </div>
                        </td>
                        <td className="break-words p-3">{fmtMMK(o.amount_minor)}</td>
                        <td className="break-words p-3 text-muted-foreground">{o.method}</td>
                        <td className="p-3">
                          <Pill value={o.status} />
                        </td>
                        <td className="break-words p-3 font-mono text-xs">
                          {o.issued_code ?? "—"}
                        </td>
                        <td className="p-3">
                          {o.status === "settled" && (
                            <button
                              type="button"
                              onClick={() => refund.mutate(o.id)}
                              className="min-h-9 rounded-lg border border-border/60 px-3 text-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary active:scale-[0.98]"
                            >
                              Refund
                            </button>
                          )}
                          {o.status === "pending" && (
                            <button
                              type="button"
                              onClick={() => cancel.mutate(o.id)}
                              className="min-h-9 rounded-lg border border-border/60 px-3 text-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary active:scale-[0.98]"
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </State>
          </section>
        </>
      )}

      {tab === "sessions" && (
        <>
          <section className="glass-panel flex flex-wrap items-center gap-2 rounded-2xl p-4">
            <span className="text-sm text-muted-foreground">Reconcile sessions from a router:</span>
            {physicalRouters.length === 0 && (
              <span className="text-xs text-muted-foreground">
                {selectedSite ? `No routers on site “${selectedSite.name}”.` : "No routers yet."}
              </span>
            )}
            {physicalRouters.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={sync.isPending}
                onClick={() => sync.mutate(r.id)}
                className="min-h-10 rounded-xl border border-border/60 px-3 text-xs disabled:opacity-50"
              >
                {r.name}
              </button>
            ))}
          </section>

          <section className="glass-panel overflow-hidden rounded-2xl">
            <State
              loading={sessions.isLoading}
              error={sessions.error}
              empty={(sessions.data ?? []).length === 0}
              emptyText="No guest sessions recorded yet."
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] table-fixed text-sm">
                  <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="w-[22%] p-3 font-medium">Device</th>
                      <th className="w-[18%] p-3 font-medium">Code</th>
                      <th className="w-[20%] p-3 font-medium">Usage</th>
                      <th className="w-[15%] p-3 font-medium">Duration</th>
                      <th className="w-[15%] p-3 font-medium">State</th>
                      <th className="w-[10%] p-3 font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sessions.data ?? []).map((s) => (
                      <tr key={s.id} className="border-t border-border/40 align-top">
                        <td className="break-all p-3 font-mono text-xs">
                          {s.device_mac ?? s.device_ip ?? "—"}
                        </td>
                        <td className="break-all p-3 font-mono text-xs">{s.code ?? "—"}</td>
                        <td className="break-words p-3">
                          ↓ {bytes(s.bytes_in)} · ↑ {bytes(s.bytes_out)}
                        </td>
                        <td className="break-words p-3">{duration(s.duration_seconds)}</td>
                        <td className="p-3">
                          <Pill value={s.reconcile_status} />
                        </td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => setSelectedSession(s.id)}
                            className="min-h-9 rounded-lg border border-border/60 px-3 text-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary active:scale-[0.98]"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </State>
          </section>

          {detail && (
            <section className="glass-panel space-y-2 rounded-2xl p-4 text-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">Session detail</h2>
                <button
                  type="button"
                  onClick={() => setSelectedSession(null)}
                  className="min-h-9 rounded-lg border border-border/60 px-3 text-xs"
                >
                  Close
                </button>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Started</dt>
                  <dd>{fmtDateTime(detail.started_at)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Ended</dt>
                  <dd>{detail.ended_at ? fmtDateTime(detail.ended_at) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Last seen from router</dt>
                  <dd>{detail.source_seen_at ? fmtDateTime(detail.source_seen_at) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Termination</dt>
                  <dd>{detail.termination_reason ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd className="break-words">{detail.plan_label ?? detail.plan_key ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Reconciliation</dt>
                  <dd>{detail.reconcile_note ?? detail.reconcile_status}</dd>
                </div>
              </dl>
            </section>
          )}
        </>
      )}

      {tab === "reviews" && <ReceiptReviewPanel />}

      {tab === "banks" && (
        <div className="space-y-5">
          <BankSettingsPanel />
        </div>
      )}
    </div>
  );
}
