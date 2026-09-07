import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { revenueDashboard, voucherLedger } from "@/lib/monetization.functions";
import { useSelectedSite } from "@/hooks/useSelectedSite";
import { appNowLabel, fmtDateTime, fmtMMK } from "@/lib/time";
import { DelayedFallback, SkeletonCard } from "@/components/ui/skeleton";
import { escapeHtml } from "@/lib/html-escape";
import { RecordPagination } from "@/components/RecordPagination";
import { PAGE_SIZE } from "@/components/record-pagination.helpers";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/app/revenue")({
  head: () => ({
    meta: [
      { title: "Revenue — MikroTik Hotspot Admin" },
      {
        name: "description",
        content:
          "Automatic hotspot revenue dashboard: daily, weekly and monthly earnings, voucher funnel, plan performance and site breakdowns.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RevenuePage,
});

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function Delta({ now, prev }: { now: number; prev: number }) {
  if (!prev && !now) return <span className="text-[11px] text-muted-foreground">no change</span>;
  if (!prev) return <span className="text-[11px] text-emerald-300">new earnings</span>;
  const change = Math.round(((now - prev) / prev) * 100);
  const up = change >= 0;
  return (
    <span className={`text-[11px] ${up ? "text-emerald-300" : "text-red-300"}`}>
      {up ? "▲" : "▼"} {Math.abs(change)}% vs previous
    </span>
  );
}

function Tile({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function RevenuePage() {
  const t = useT();
  const { site: selectedSite } = useSelectedSite();
  const fetchDash = useServerFn(revenueDashboard);
  const [recentRange, setRecentRange] = useState<"all" | "today" | "7d" | "30d">("all");
  const [recentSearch, setRecentSearch] = useState("");
  const [recentPage, setRecentPage] = useState(1);

  const dash = useQuery({
    queryKey: ["revenue-dashboard", selectedSite?.id ?? null],
    queryFn: () => fetchDash({ data: { site_id: selectedSite?.id ?? null } }),
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });

  const d = dash.data;
  const recentRows = (d?.recent ?? []).filter((row) => {
    const query = recentSearch.trim().toLowerCase();
    const matchesSearch =
      !query ||
      [row.code, row.plan, row.source, row.device, row.site]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    if (!matchesSearch) return false;
    if (recentRange === "all") return true;
    const age = Date.now() - new Date(row.at).getTime();
    const limit =
      recentRange === "today"
        ? 86_400_000
        : recentRange === "7d"
          ? 7 * 86_400_000
          : 30 * 86_400_000;
    return age >= 0 && age <= limit;
  });
  const recentPageSize = 10;
  const recentSafePage = Math.min(
    recentPage,
    Math.max(1, Math.ceil(recentRows.length / recentPageSize)),
  );
  const recentPageRows = recentRows.slice(
    (recentSafePage - 1) * recentPageSize,
    recentSafePage * recentPageSize,
  );
  const maxDay = Math.max(1, ...(d?.byDay ?? []).map((x) => x.amount));
  const totalRevenue = d?.totals.all ?? 0;

  function exportCsv() {
    if (!d) return;
    const lines = [
      "section,label,count,amount_mmk",
      `totals,Today,${d.totals.count_today},${d.totals.today}`,
      `totals,Last 7 days,${d.totals.count_week},${d.totals.week}`,
      `totals,Last 30 days,${d.totals.count_month},${d.totals.month}`,
      `totals,All time,${d.totals.count_all},${d.totals.all}`,
      ...d.byPlan.map((p) => `plan,"${p.label}",${p.used},${p.amount}`),
      ...d.bySite.map((s) => `site,"${s.name}",${s.count},${s.amount}`),
      ...d.byDay.map((x) => `day,${x.day},,${x.amount}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "revenue-report.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    if (!d) return;
    const title = `Revenue report${selectedSite ? ` — ${selectedSite.name}` : ""}`;
    const rows = d.byPlan
      .map(
        (p) =>
          `<tr><td>${escapeHtml(p.label)}</td><td>${p.issued}</td><td>${p.used}</td><td>${p.used_rate}%</td><td>${escapeHtml(fmtMMK(p.amount))}</td></tr>`,
      )
      .join("");
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) {
      toast.error("Allow pop-ups to save the report");
      return;
    }
    w.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>
      body{font-family:ui-sans-serif,system-ui,sans-serif;padding:32px;color:#111}
      h1{font-size:20px;margin:0 0 4px}
      p{color:#555;font-size:12px;margin:0 0 20px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #ddd}
      .total td{font-weight:700;border-top:2px solid #111}
    </style></head><body>
      <h1>${escapeHtml(title)}</h1>
      <p>Generated ${appNowLabel()} · revenue is recognised only after a voucher reaches Used status</p>
      <table>
        <thead><tr><th>Plan</th><th>Issued</th><th>Used</th><th>Used rate</th><th>Revenue</th></tr></thead>
        <tbody>${rows}
          <tr class="total"><td>All time</td><td>${d.funnel.issued}</td><td>${d.funnel.used}</td><td>${pct(d.funnel.used, d.funnel.issued)}%</td><td>${escapeHtml(fmtMMK(d.totals.all))}</td></tr>
        </tbody>
      </table>
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Revenue</h1>
          <p className="text-sm text-muted-foreground">
            Calculated automatically from voucher activity — nothing to enter by hand.
            {selectedSite && ` · Site: ${selectedSite.name}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            className="rounded-full border border-[color:var(--glass-border)] bg-white/5 px-3 py-1.5 text-xs backdrop-blur-xl transition hover:border-primary/50 hover:text-primary active:scale-95"
          >
            Export CSV
          </button>
          <button
            onClick={exportPdf}
            className="rounded-full border border-[color:var(--glass-border)] bg-white/5 px-3 py-1.5 text-xs backdrop-blur-xl transition hover:border-primary/50 hover:text-primary active:scale-95"
          >
            Download PDF
          </button>
        </div>
      </header>

      {dash.isLoading && (
        <DelayedFallback
          loading
          label="Calculating earnings"
          fallback={
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard className="hidden sm:block" />
              <SkeletonCard className="hidden lg:block" />
            </div>
          }
        />
      )}
      {dash.isError && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          {(dash.error as Error)?.message ?? "Couldn't load revenue."}
        </div>
      )}

      {d && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Today" value={fmtMMK(d.totals.today)}>
              <Delta now={d.totals.today} prev={d.totals.yesterday} />
            </Tile>
            <Tile label="Last 7 days" value={fmtMMK(d.totals.week)}>
              <Delta now={d.totals.week} prev={d.totals.prev_week} />
            </Tile>
            <Tile label="Last 30 days" value={fmtMMK(d.totals.month)}>
              <Delta now={d.totals.month} prev={d.totals.prev_month} />
            </Tile>
            <Tile label="All time" value={fmtMMK(d.totals.all)}>
              <span className="text-[11px] text-muted-foreground">
                {d.totals.count_all} redemptions
              </span>
            </Tile>
          </section>

          <section className="glass-panel rounded-2xl p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Last 30 days
            </h2>
            <div className="mt-4 flex h-36 items-end gap-[3px]">
              {d.byDay.map((x) => (
                <div
                  key={x.day}
                  title={`${x.day} · ${fmtMMK(x.amount)}`}
                  className="flex-1 rounded-t bg-gradient-to-t from-primary/30 to-primary transition hover:opacity-80"
                  style={{ height: `${Math.max(2, (x.amount / maxDay) * 100)}%` }}
                />
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
              <span>{d.byDay[0]?.day}</span>
              <span>Peak {fmtMMK(maxDay)}</span>
              <span>{d.byDay[d.byDay.length - 1]?.day}</span>
            </div>
          </section>

          <section className="glass-panel rounded-2xl p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Voucher funnel
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { label: "Issued", n: d.funnel.issued },
                { label: "Active now", n: d.funnel.active },
                { label: "Used", n: d.funnel.used },
                { label: "Expired unused", n: d.funnel.expired },
                { label: "Still unused", n: d.funnel.unused },
              ].map((f) => (
                <div
                  key={f.label}
                  className="rounded-xl border border-border/60 bg-background/30 p-3"
                >
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {f.label}
                  </div>
                  <div className="mt-1 text-xl font-semibold">{f.n}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {pct(f.n, d.funnel.issued)}% of issued
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Only vouchers in Used status count as revenue. Active vouchers have been started but
              are still in their access period, so they are not income yet. Expired-unused vouchers
              are lost potential of {fmtMMK(d.funnel.lost_mmk)} — not income.
            </p>
          </section>

          <PlanPerformanceSection rows={d.planPerformance} />

          <VoucherInspector siteId={selectedSite?.id ?? null} />

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="glass-panel rounded-2xl p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Revenue share by plan
              </h2>
              <div className="mt-3 space-y-3">
                {d.byPlan.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No vouchers issued yet. Create a plan on{" "}
                    <Link
                      to="/app/vouchers"
                      hash="plans"
                      className="font-medium text-primary hover:underline"
                    >
                      Vouchers
                    </Link>
                    , then Generate codes (or record a cash sale on Payments). Revenue MMK appears
                    when a guest first uses a code.
                  </p>
                )}
                {d.byPlan.map((p) => (
                  <div key={p.label}>
                    <div className="flex items-start justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate font-medium">{p.label}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {p.used}/{p.issued} used · {fmtMMK(p.amount)}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-violet-400"
                        style={{ width: `${pct(p.amount, totalRevenue)}%` }}
                      />
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {p.used_rate}% used · {pct(p.amount, totalRevenue)}% of revenue
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="glass-panel rounded-2xl p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Earnings by site &amp; router
              </h2>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Sites
                  </div>
                  <ul className="mt-2 space-y-1 text-xs">
                    {d.bySite.length === 0 && <li className="text-muted-foreground">—</li>}
                    {d.bySite.map((s) => (
                      <li key={s.name} className="flex justify-between gap-2">
                        <span className="truncate">{s.name}</span>
                        <span className="shrink-0 text-muted-foreground">{fmtMMK(s.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Routers
                  </div>
                  <ul className="mt-2 space-y-1 text-xs">
                    {d.byRouter.length === 0 && <li className="text-muted-foreground">—</li>}
                    {d.byRouter.map((r) => (
                      <li key={r.name} className="flex justify-between gap-2">
                        <span className="truncate">{r.name}</span>
                        <span className="shrink-0 text-muted-foreground">{fmtMMK(r.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          </div>

          <section className="glass-panel overflow-hidden rounded-2xl">
            <div className="space-y-3 border-b border-border p-4">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {t.ui("Recent revenue activity")}
                </h2>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {recentRows.length} matching activity record(s)
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {(
                    [
                      ["all", "All"],
                      ["today", "Today"],
                      ["7d", "7 days"],
                      ["30d", "30 days"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setRecentRange(value);
                        setRecentPage(1);
                      }}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition ${
                        recentRange === value
                          ? "bg-primary text-primary-foreground"
                          : "border border-[color:var(--glass-border)] bg-white/5 text-muted-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <input
                  value={recentSearch}
                  onChange={(event) => {
                    setRecentSearch(event.target.value);
                    setRecentPage(1);
                  }}
                  placeholder="Code, plan, source or device"
                  aria-label="Search recent revenue activity"
                  className="min-h-9 w-full rounded-xl border border-border/60 bg-background/60 px-3 text-xs sm:max-w-xs"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-sm">
                <thead className="bg-surface/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">{t.ui("Source")}</th>
                    <th className="px-4 py-3">Device</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPageRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        {recentSearch || recentRange !== "all"
                          ? "No activity matches these filters."
                          : t.copy("No settled voucher payments yet.")}
                      </td>
                    </tr>
                  )}
                  {recentPageRows.map((r, i) => (
                    <tr key={`${r.code}-${i}`} className="border-t border-border">
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{r.code}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs">{r.plan}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs">{fmtMMK(r.amount)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
                        {fmtDateTime(r.at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs capitalize text-muted-foreground">
                        {r.source.replace("_", " ")}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-[11px] text-muted-foreground">
                        {r.device ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <RecordPagination
              page={recentSafePage}
              total={recentRows.length}
              pageSize={recentPageSize}
              onPageChange={setRecentPage}
            />
          </section>

          <p className="text-[11px] text-muted-foreground">Updated {appNowLabel()}</p>
        </>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Voucher performance grouped by the owner's own hotspot plans.
// --------------------------------------------------------------------------
function PlanPerformanceSection({
  rows,
}: {
  rows: Array<{
    plan_key: string;
    label: string;
    status: "active" | "inactive" | "archived";
    issued: number;
    active: number;
    used: number;
    expired: number;
    cancelled: number;
    gross: number;
    refunded: number;
    net: number;
  }>;
}) {
  const t = useT();
  const totals = rows.reduce(
    (acc, row) => ({
      issued: acc.issued + row.issued,
      active: acc.active + row.active,
      used: acc.used + row.used,
      expired: acc.expired + row.expired,
      cancelled: acc.cancelled + row.cancelled,
      gross: acc.gross + row.gross,
      refunded: acc.refunded + row.refunded,
      net: acc.net + row.net,
    }),
    { issued: 0, active: 0, used: 0, expired: 0, cancelled: 0, gross: 0, refunded: 0, net: 0 },
  );

  return (
    <section className="glass-panel overflow-hidden rounded-2xl">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Hotspot plan performance
        </h2>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t.copy(
            "Only Used voucher codes count toward gross and net. Active access and unused stock are excluded; net removes refunds.",
          )}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Issued</th>
              <th className="px-4 py-3">Active access</th>
              <th className="px-4 py-3">Used</th>
              <th className="px-4 py-3">Expired</th>
              <th className="px-4 py-3">Cancelled</th>
              <th className="px-4 py-3">Gross</th>
              <th className="px-4 py-3">Refunded</th>
              <th className="px-4 py-3">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                  No hotspot plans yet — create one on{" "}
                  <Link
                    to="/app/vouchers"
                    hash="plans"
                    className="font-medium text-primary hover:underline"
                  >
                    Vouchers
                  </Link>{" "}
                  to start issuing codes.
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.plan_key} className="border-t border-border">
                <td className="px-4 py-2">
                  <span className="break-words font-medium">{p.label}</span>
                  {p.status !== "active" && (
                    <span className="ml-2 text-[10px] uppercase text-muted-foreground">
                      {p.status}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-xs">{p.issued}</td>
                <td className="px-4 py-2 text-xs">{p.active}</td>
                <td className="px-4 py-2 text-xs">{p.used}</td>
                <td className="px-4 py-2 text-xs">{p.expired}</td>
                <td className="px-4 py-2 text-xs">{p.cancelled}</td>
                <td className="px-4 py-2 text-xs">{fmtMMK(p.gross)}</td>
                <td className="px-4 py-2 text-xs">{p.refunded ? fmtMMK(p.refunded) : "—"}</td>
                <td className="px-4 py-2 text-xs font-semibold">{fmtMMK(p.net)}</td>
              </tr>
            ))}
            {totals && rows.length > 0 && (
              <tr className="border-t-2 border-border bg-surface/40 text-xs font-semibold">
                <td className="px-4 py-2">All plans</td>
                <td className="px-4 py-2">{totals.issued}</td>
                <td className="px-4 py-2">{totals.active}</td>
                <td className="px-4 py-2">{totals.used}</td>
                <td className="px-4 py-2">{totals.expired}</td>
                <td className="px-4 py-2">{totals.cancelled}</td>
                <td className="px-4 py-2">{fmtMMK(totals.gross)}</td>
                <td className="px-4 py-2">{totals.refunded ? fmtMMK(totals.refunded) : "—"}</td>
                <td className="px-4 py-2">{fmtMMK(totals.net)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const STATES = ["used", "expired", "active", "unused", "cancelled", "all"] as const;
type LedgerState = (typeof STATES)[number];

// --------------------------------------------------------------------------
// Inspect individual voucher codes — used and expired ones first.
// --------------------------------------------------------------------------
function VoucherInspector({ siteId }: { siteId: string | null }) {
  const [state, setState] = useState<LedgerState>("used");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const fetchLedger = useServerFn(voucherLedger);

  const q = useQuery({
    queryKey: ["voucher-ledger", siteId, state, search, page],
    queryFn: () =>
      fetchLedger({
        data: {
          site_id: siteId,
          state,
          search: search || null,
          limit: PAGE_SIZE,
          offset: (page - 1) * PAGE_SIZE,
        },
      }),
    staleTime: 30_000,
    refetchIntervalInBackground: false,
  });
  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  const safePage = Math.min(page, Math.max(1, Math.ceil(total / PAGE_SIZE)));

  useEffect(() => {
    if (q.data && page !== safePage) setPage(safePage);
  }, [page, q.data, safePage]);

  return (
    <section className="glass-panel overflow-hidden rounded-2xl">
      <div className="space-y-3 border-b border-border p-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Voucher codes
          </h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {q.data ? `${q.data.total} matching code(s)` : "Loading…"}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex min-w-0 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {STATES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setState(s);
                  setPage(1);
                }}
                className={`rounded-full px-3 py-1.5 text-xs capitalize transition ${
                  state === s
                    ? "bg-primary text-primary-foreground"
                    : "border border-[color:var(--glass-border)] bg-white/5 text-muted-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Code, plan or device"
            aria-label="Search voucher codes"
            className="min-h-9 w-full rounded-xl border border-border/60 bg-background/60 px-3 text-xs sm:max-w-xs"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-sm">
          <thead className="bg-surface/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Device</th>
              <th className="px-4 py-3">Issued</th>
              <th className="px-4 py-3">First used</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {!q.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  No {state === "all" ? "" : state} voucher codes to show.
                </td>
              </tr>
            )}
            {rows.map((v) => (
              <tr key={v.id ?? v.code} className="border-t border-border align-top">
                <td className="px-4 py-2 font-mono text-xs">{v.code}</td>
                <td className="whitespace-nowrap px-4 py-2 text-xs">
                  {v.plan_label ?? v.plan_key}
                </td>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-[11px] text-muted-foreground">
                  {v.device_mac ?? "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-[11px] text-muted-foreground">
                  {fmtDateTime(v.created_at)}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-[11px] text-muted-foreground">
                  {v.first_seen_at ? fmtDateTime(v.first_seen_at) : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-[11px] text-muted-foreground">
                  {v.expires_at ? fmtDateTime(v.expires_at) : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-xs">{fmtMMK(v.price_mmk ?? 0)}</td>
                <td className="whitespace-nowrap px-4 py-2 text-xs capitalize">{v.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RecordPagination page={safePage} total={total} onPageChange={setPage} />
    </section>
  );
}
