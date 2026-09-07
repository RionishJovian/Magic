import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { LockKeyhole } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  closeOwnerBusinessDay,
  createVoucherReseller,
  getOwnerOperationsDashboard,
} from "@/lib/owner-operations.functions";

export const Route = createFileRoute("/_authenticated/app/reseller-operation")({
  head: () => ({
    meta: [
      { title: "Reseller Operation — MikroTik Hotspot Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OwnerOperationsPage,
});

function mmk(value: number) {
  return `${new Intl.NumberFormat("en-US").format(value)} MMK`;
}

function OwnerOperationsPage() {
  const queryClient = useQueryClient();
  const dashboardFn = useServerFn(getOwnerOperationsDashboard);
  const createReseller = useServerFn(createVoucherReseller);
  const closeDay = useServerFn(closeOwnerBusinessDay);
  const dashboard = useQuery({
    queryKey: ["owner-operations"],
    queryFn: () => dashboardFn(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["owner-operations"] });
  const [reseller, setReseller] = useState({
    shop_name: "",
    contact_name: "",
    location: "",
    phone: "",
  });
  const [cash, setCash] = useState("");
  const create = useMutation({
    mutationFn: () => createReseller({ data: reseller }),
    onSuccess: () => {
      toast.success("Reseller added to owner inventory");
      setReseller({ shop_name: "", contact_name: "", location: "", phone: "" });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const close = useMutation({
    mutationFn: () =>
      closeDay({
        data: {
          business_day: new Date().toISOString().slice(0, 10),
          counted_cash_mmk: Number(cash || 0),
        },
      }),
    onSuccess: () => {
      toast.success("Daily cash close recorded");
      setCash("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (dashboard.isError)
    return (
      <AccessState
        message={
          dashboard.error instanceof Error
            ? dashboard.error.message
            : "Reseller Operation could not be loaded."
        }
      />
    );
  const d = dashboard.data;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reseller Operation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Multi-site voucher stock, reseller accountability and daily close. Resellers never
            receive an app account and voucher sales never create Magic Coins.
          </p>
        </div>
        <Link
          to={"/app/vouchers" as never}
          className="rounded-full border border-[color:var(--glass-border)] px-3 py-1.5 text-xs hover:text-primary"
        >
          Open vouchers
        </Link>
      </header>
      {dashboard.isLoading || !d ? (
        <div className="glass-panel rounded-2xl p-6 text-sm text-muted-foreground">
          Loading reseller operation…
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Tile
              label="Unused stock"
              value={String(d.status.unused)}
              hint={d.alerts.low_stock ? "Low stock — generate a batch" : "Stock level healthy"}
              tone={d.alerts.low_stock ? "warn" : "ok"}
            />
            <Tile
              label="Gross redeemed"
              value={mmk(d.gross_mmk)}
              hint={`${d.status.used} voucher(s) used`}
            />
            <Tile
              label="Cash recorded"
              value={mmk(d.cash_mmk)}
              hint={`${d.status.sold} cash sale(s) recorded`}
            />
            <Tile
              label="Routers online"
              value={`${d.routers.filter((router) => router.online).length}/${d.routers.length}`}
              hint={
                d.alerts.routers_offline.length
                  ? `${d.alerts.routers_offline.join(", ")} offline`
                  : "All reporting routers online"
              }
              tone={d.alerts.routers_offline.length ? "warn" : "ok"}
            />
            <Tile
              label="Today’s close"
              value={d.open_cash_close ? "Open" : "Completed"}
              hint={d.open_cash_close ? "Count and close cash below" : "Recorded for today"}
              tone={d.open_cash_close ? "warn" : "ok"}
            />
          </section>
          <section className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
            <Panel
              title="Voucher business today"
              subtitle="Cancelled vouchers are excluded from earnings."
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {Object.entries(d.status).map(([key, value]) => (
                  <div key={key} className="rounded-xl border border-border/60 bg-black/10 p-3">
                    <div className="text-lg font-semibold">{String(value)}</div>
                    <div className="text-[11px] capitalize text-muted-foreground">{key}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-xs text-muted-foreground">
                For customer support, use Vouchers to search a code, inspect its history, print
                again, or cancel an unused code with an audit trail.
              </div>
            </Panel>
            <Panel
              title="Daily business close"
              subtitle="One owner record per day. It does not change RouterOS or voucher status."
            >
              <div className="flex gap-2">
                <Input
                  value={cash}
                  onChange={(e) => setCash(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  placeholder="Counted cash (MMK)"
                />
                <button
                  disabled={close.isPending}
                  onClick={() => close.mutate()}
                  className="rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
                >
                  Close today
                </button>
              </div>
              {d.daily_closes[0] && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Latest: {d.daily_closes[0].business_day} ·{" "}
                  {mmk(d.daily_closes[0].counted_cash_mmk)}
                </p>
              )}
            </Panel>
          </section>
          <section className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
            <Panel
              title="Reseller inventory"
              subtitle="Owner-controlled contacts only — no reseller user accounts."
            >
              <div className="space-y-3">
                {d.resellers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No resellers yet. Add a shop before assigning vouchers from this
                    owner-controlled inventory.
                  </p>
                ) : (
                  d.resellers.map((reseller) => (
                    <div key={reseller.id} className="rounded-xl border border-border/60 p-3">
                      <div className="flex justify-between gap-2">
                        <div>
                          <b>{reseller.shop_name}</b>
                          <div className="text-xs text-muted-foreground">
                            {reseller.contact_name}
                            {reseller.location ? ` · ${reseller.location}` : ""}
                            {reseller.phone ? ` · ${reseller.phone}` : ""}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          Cash due {mmk(reseller.cash_due_mmk)}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Issued {reseller.issued} · Sold {reseller.sold} · Returned{" "}
                        {reseller.returned} · Cancelled {reseller.cancelled}
                      </div>
                    </div>
                  ))
                )}
              </div>
              {d.can_manage_reseller_inventory ? (
                <form
                  className="mt-4 grid gap-2 sm:grid-cols-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    create.mutate();
                  }}
                >
                  <Input
                    required
                    value={reseller.shop_name}
                    onChange={(e) => setReseller({ ...reseller, shop_name: e.target.value })}
                    placeholder="Reseller shop name"
                  />
                  <Input
                    required
                    value={reseller.contact_name}
                    onChange={(e) => setReseller({ ...reseller, contact_name: e.target.value })}
                    placeholder="Reseller name"
                  />
                  <Input
                    value={reseller.location}
                    onChange={(e) => setReseller({ ...reseller, location: e.target.value })}
                    placeholder="Location"
                  />
                  <Input
                    value={reseller.phone}
                    onChange={(e) => setReseller({ ...reseller, phone: e.target.value })}
                    placeholder="Contact number"
                  />
                  <button
                    disabled={create.isPending}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60 sm:col-span-2"
                  >
                    {d.reseller_add_key.active_count > 0
                      ? "Add reseller · use 1 key"
                      : "Add reseller"}
                  </button>
                </form>
              ) : (
                <div className="mt-4 rounded-xl border border-amber-300/40 bg-amber-300/10 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-amber-200">
                    <LockKeyhole className="size-4" aria-hidden />
                    Add reseller{" "}
                    <span className="rounded-full border border-amber-200/40 px-2 py-0.5 text-[10px] tracking-wide">
                      LOCKED
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Purchase the account-bound Inv reseller misc key in{" "}
                    <Link
                      to={"/app/profile" as never}
                      className="text-primary underline underline-offset-2"
                    >
                      Profile
                    </Link>{" "}
                    to add one reseller. Primary, Developer, and MikroMagic Agent accounts are
                    included.
                  </p>
                </div>
              )}
            </Panel>
            <Panel
              title="Operational alerts"
              subtitle="Alerts identify actions; they never modify the router automatically."
            >
              <ul className="space-y-3 text-sm">
                <Alert
                  ok={!d.alerts.low_stock}
                  label={
                    d.alerts.low_stock
                      ? "Voucher stock is below 20 unused codes."
                      : "Voucher inventory is above the low-stock threshold."
                  }
                />
                <Alert
                  ok={!d.alerts.routers_offline.length}
                  label={
                    d.alerts.routers_offline.length
                      ? `Router offline: ${d.alerts.routers_offline.join(", ")}`
                      : "All monitored routers are online."
                  }
                />
                <Alert
                  ok={!d.alerts.cash_close_missing}
                  label={
                    d.alerts.cash_close_missing
                      ? "Daily cash close has not been completed."
                      : "Daily cash close is completed."
                  }
                />
                <Alert
                  ok
                  label="Portal and NTP verification stay on each router’s Quick Config and Hotspot checks."
                />
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                Secure backup and restore readiness remains in the Backups workflow; automatic
                unencrypted RouterOS backup stays disabled.
              </p>
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}
function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="glass-panel rounded-2xl p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <p
        className={`mt-1 text-xs ${tone === "warn" ? "text-amber-300" : tone === "ok" ? "text-emerald-300" : "text-muted-foreground"}`}
      >
        {hint}
      </p>
    </div>
  );
}
function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-panel rounded-2xl p-5">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}
function Alert({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <li className={ok ? "text-emerald-300" : "text-amber-300"}>
      {ok ? "●" : "●"} <span className="text-foreground">{label}</span>
    </li>
  );
}
function AccessState({ message }: { message: string }) {
  return (
    <div className="glass-panel mx-auto max-w-xl rounded-2xl p-6">
      <h1 className="text-xl font-semibold">Reseller Operation</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <Link
        to={"/app/services" as never}
        className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        View Tier Passes
      </Link>
    </div>
  );
}
