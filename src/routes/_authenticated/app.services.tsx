import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  listServices,
  developerBankAccounts,
  submitServicePurchase,
  submitMagicCoinPurchase,
  listPlatformServiceBankAccounts,
  savePlatformServiceBankAccount,
  purchaseServiceWithMagicCoins,
  serviceReceiptUrl,
  listServicePurchases,
  approveServicePurchase,
  rejectServicePurchase,
} from "@/lib/services.functions";
import { fmtDateTime, fmtMMK, fmtDate } from "@/lib/time";
import { TelegramSetupPanel } from "@/components/TelegramSetupPanel";
import { TelegramCta } from "@/components/TelegramCta";
import { GemIcon } from "@/lib/gem-offer-chrome";
import { MagicCoinIcon } from "@/components/MagicCoinIcon";
import { fmtMagicCoins, magicCoinsForMMK } from "@/lib/magic-coins";
import { chromeForServiceKey } from "@/lib/gem-offer-chrome.data";
import { toErrorMessage } from "@/lib/error-message";
import { TENANT_PRIMARY_ROLE } from "@/lib/app-role";

export const Route = createFileRoute("/_authenticated/app/services")({
  head: () => ({
    meta: [
      { title: "Services — MikroTik Magic account plans" },
      {
        name: "description",
        content:
          "Buy or renew your MikroTik Magic account: Emerald Monthly or Sapphire Annual, paid by bank transfer with a payment slip.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ServicesPage,
});

type Offer = Awaited<ReturnType<typeof listServices>>["services"][number];
type Purchase = Awaited<ReturnType<typeof listServices>>["purchases"][number];

function ServicesPage() {
  const qc = useQueryClient();
  const [checkout, setCheckout] = useState<Offer | null>(null);
  const [coinCheckout, setCoinCheckout] = useState(false);

  const fetchServices = useServerFn(listServices);
  const services = useQuery({ queryKey: ["services"], queryFn: () => fetchServices() });
  const data = services.data;
  const status = data?.status;
  const promo = data?.promo;
  const privileged = (data?.roles ?? []).some((r) => r === TENANT_PRIMARY_ROLE);

  return (
    <div className="space-y-6">
      <header>
        <span className="eyebrow">Tier passes</span>
        <h1 className="text-title mt-2 text-2xl font-semibold sm:text-3xl">
          Pick your <span className="gradient-text">gem</span>
        </h1>
        <p className="text-sub mt-2 max-w-2xl text-sm">
          Choose Emerald Monthly or Sapphire Annual — same look as public Pricing — then upload your
          bank payment receipt or Magic Coins. Orders stay{" "}
          <span className="font-semibold text-foreground">Pending</span> until Dev reviews them.
        </p>
        <ol className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          {[
            "1. Pick Emerald Monthly or Sapphire Annual",
            "2. Pay by bank receipt or Magic Coins",
            "3. Pending Dev review",
            "4. Approved / Completed activates the pass",
          ].map((step) => (
            <li key={step} className="rounded-full border border-border px-2.5 py-1">
              {step}
            </li>
          ))}
        </ol>
        <p className="mt-3 max-w-2xl text-[11px] text-muted-foreground">
          Buying a Tier Pass earns <span className="font-semibold">no Magic Coins for you</span>. If
          an agent registered your account, that agent receives 15 Magic Coins for an approved paid
          Emerald Monthly order and 150 Magic Coins for an approved paid Sapphire Annual order. A
          refund reverses the points that were awarded.
        </p>
      </header>

      {status && (
        <section className="glass-panel grid gap-4 rounded-2xl p-4 sm:grid-cols-3">
          <Stat label="Current tier" value={tierLabel(status.tier)} />
          <Stat
            label="Expires"
            value={
              status.never_expires
                ? "Never"
                : status.tier_expires_at
                  ? fmtDateTime(status.tier_expires_at)
                  : "—"
            }
          />
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Magic Coins</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-primary">
              <MagicCoinIcon className="h-4 w-4" />
              {fmtMagicCoins(Number(data.wallet?.balance ?? 0))}
            </p>
          </div>
          <Stat
            label="Remaining"
            value={status.remaining_label}
            tone={status.expired ? "bad" : "good"}
          />
          {status.expired && (
            <p className="sm:col-span-4 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              This account has expired. Management actions are blocked until a Monthly or Annual
              purchase is approved. Your profile and this page stay available so you can renew.
            </p>
          )}
          <p className="sm:col-span-4 text-[11px] text-muted-foreground">
            Device quota with the current entitlement: {status.quota.routers} router,{" "}
            {status.quota.sites} sites, {status.quota.controllers} optional AP controller slots.
          </p>
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-3">
        {(data?.services ?? []).map((s, i) => {
          const chrome = chromeForServiceKey(s.key);
          const [g0, g1] = chrome.gradient;
          const unit = s.key === "monthly" ? "per month" : "per year";
          const limits = "1 router / 3 sites / 15 optional AP integrations";
          const ctaLabel = s.pending ? "Pending Dev review" : `Choose ${chrome.gem}`;

          return (
            <article
              key={s.key}
              className="feature-card animate-rise relative flex flex-col overflow-hidden"
              style={{
                animationDelay: `${i * 110}ms`,
                borderColor: `rgba(${chrome.glow},0.35)`,
                boxShadow: chrome.featured
                  ? `0 24px 60px -28px rgba(${chrome.glow},0.9)`
                  : `0 18px 48px -32px rgba(${chrome.glow},0.7)`,
              }}
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-40 blur-3xl"
                style={{
                  background: `radial-gradient(circle, ${g0} 0%, transparent 65%)`,
                }}
              />

              <div className="relative flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <GemIcon gradient={chrome.gradient} glow={chrome.glow} />
                  <div>
                    <h2 className="text-title text-xl">{chrome.gem}</h2>
                    <div
                      className="text-[0.7rem] font-semibold uppercase tracking-[0.18em]"
                      style={{ color: g0 }}
                    >
                      {chrome.cadence}
                    </div>
                  </div>
                </div>
                {chrome.featured && (
                  <span className="text-kicker rounded-full border border-[color:var(--glass-border)] bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em]">
                    Best value
                  </span>
                )}
              </div>

              <p className="text-sub relative mt-4 text-sm">{s.summary}</p>

              <div className="relative mt-6 flex flex-wrap items-baseline gap-2">
                <span
                  className="text-4xl font-black"
                  style={{
                    background: `linear-gradient(135deg, ${g0}, ${g1})`,
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  {fmtMMK(s.price_mmk)}
                </span>
                {s.standard_price_mmk != null && s.standard_price_mmk > s.price_mmk && (
                  <span className="text-sub text-sm font-semibold line-through">
                    {fmtMMK(s.standard_price_mmk)}
                  </span>
                )}
                <span className="text-kicker text-xs">{unit}</span>
              </div>

              {s.standard_price_mmk != null && s.standard_price_mmk > s.price_mmk && (
                <div
                  className="relative mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold"
                  style={{
                    borderColor: `rgba(${chrome.glow},0.45)`,
                    color: g0,
                    background: `rgba(${chrome.glow},0.08)`,
                  }}
                >
                  {promo?.active && promo.ends_on
                    ? `Grand opening — 30% off through ${fmtDate(`${promo.ends_on}T12:00:00+06:30`)}`
                    : "Grand opening — 30% off"}
                </div>
              )}

              <ul className="relative mt-6 flex-1 space-y-2.5 text-sm">
                {s.entitlements.map((perk) => (
                  <li key={perk} className="text-sub flex items-start gap-2.5">
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={g0}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mt-0.5 shrink-0"
                      aria-hidden="true"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    <span className="break-words">{perk}</span>
                  </li>
                ))}
              </ul>

              <div className="relative mt-6 border-t border-[color:var(--glass-border)] pt-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-kicker text-[0.7rem] uppercase tracking-[0.18em]">
                    Device quota
                  </h3>
                  <span
                    className="rounded-full border px-2.5 py-1 text-[10px] font-semibold"
                    style={{
                      borderColor: `rgba(${chrome.glow},0.45)`,
                      color: g0,
                      background: `rgba(${chrome.glow},0.08)`,
                    }}
                  >
                    {limits}
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={s.pending}
                onClick={() => setCheckout(s)}
                aria-label={`Choose ${s.label} and upload payment receipt`}
                className="relative mt-7 inline-flex min-h-11 w-full items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-50"
                style={{
                  background: `linear-gradient(135deg, ${g0}, ${g1})`,
                  boxShadow: `0 16px 34px -18px rgba(${chrome.glow},1)`,
                }}
              >
                {ctaLabel}
              </button>
              <p className="relative mt-2 text-[11px] text-muted-foreground">
                {s.key === "monthly"
                  ? "Referring agent earns 15 Magic Coins once this order is approved."
                  : "Referring agent earns 150 Magic Coins once this order is approved."}
              </p>
            </article>
          );
        })}
        <MagicCoinPurchaseCard onChoose={() => setCoinCheckout(true)} />
      </section>

      {checkout && (
        <Checkout
          offer={checkout}
          walletBalance={Number(data?.wallet?.balance ?? 0)}
          onClose={() => setCheckout(null)}
          onDone={() => {
            setCheckout(null);
            qc.invalidateQueries({ queryKey: ["services"] });
            qc.invalidateQueries({ queryKey: ["profile"] });
          }}
        />
      )}

      {coinCheckout && (
        <MagicCoinCheckout
          onClose={() => setCoinCheckout(false)}
          onDone={() => {
            setCoinCheckout(false);
            qc.invalidateQueries({ queryKey: ["services"] });
          }}
        />
      )}

      {data?.isPlatformAdmin && <PlatformServiceBillingSettings />}

      {privileged && !data?.isPlatformAdmin && <ServiceBillingAccessNote />}

      <MyPurchases rows={data?.purchases ?? []} />

      {privileged && (
        <>
          <ReviewQueue />
          <TelegramSetupPanel />
        </>
      )}
    </div>
  );
}

function tierLabel(tier: string) {
  if (tier === "monthly") return "Monthly";
  if (tier === "annual") return "Annual";
  return "Trial";
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-1 break-words text-sm font-semibold ${
          tone === "bad" ? "text-warning" : tone === "good" ? "text-success" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

type PlatformServiceBankAccount = {
  slot: number;
  holder_name: string;
  bank_name: string;
  account_number: string;
  enabled: boolean;
  sort: number;
};

const emptyPlatformServiceBankAccounts: PlatformServiceBankAccount[] = [
  { slot: 1, holder_name: "", bank_name: "", account_number: "", enabled: false, sort: 0 },
  { slot: 2, holder_name: "", bank_name: "", account_number: "", enabled: false, sort: 1 },
];

function ServiceBillingAccessNote() {
  return (
    <section className="glass-panel rounded-2xl border border-amber-300/25 p-5">
      <p className="text-kicker text-xs">Services billing</p>
      <h2 className="mt-1 text-lg font-semibold">Platform checkout bank details</h2>
      <p className="text-sub mt-2 max-w-3xl text-sm">
        Your <strong>Payments → Bank details</strong> settings are for your guest voucher checkout.
        Tier Pass and Magic Coin purchases use MikroMagic platform billing accounts, which only the
        Developer account can configure. This prevents one tenant from redirecting another account’s
        service payment.
      </p>
    </section>
  );
}

function PlatformServiceBillingSettings() {
  const qc = useQueryClient();
  const fetchAccounts = useServerFn(listPlatformServiceBankAccounts);
  const saveAccount = useServerFn(savePlatformServiceBankAccount);
  const accounts = useQuery({
    queryKey: ["platform-service-bank-accounts"],
    queryFn: () => fetchAccounts(),
  });
  const [rows, setRows] = useState<PlatformServiceBankAccount[]>(emptyPlatformServiceBankAccounts);

  useEffect(() => {
    if (!accounts.data) return;
    const saved = new Map(accounts.data.accounts.map((account) => [account.slot, account]));
    setRows(
      emptyPlatformServiceBankAccounts.map((fallback) => {
        const row = saved.get(fallback.slot);
        return row
          ? {
              slot: row.slot,
              holder_name: row.holder_name,
              bank_name: row.bank_name,
              account_number: row.account_number,
              enabled: row.enabled,
              sort: row.sort,
            }
          : fallback;
      }),
    );
  }, [accounts.data]);

  const save = useMutation({
    mutationFn: (row: PlatformServiceBankAccount) => saveAccount({ data: row }),
    onSuccess: () => {
      toast.success("Platform Services billing account saved.");
      qc.invalidateQueries({ queryKey: ["platform-service-bank-accounts"] });
      qc.invalidateQueries({ queryKey: ["developer-banks"] });
    },
    onError: (error: Error) => toast.error(toErrorMessage(error)),
  });

  const change = (slot: number, changeSet: Partial<PlatformServiceBankAccount>) => {
    setRows((current) =>
      current.map((row) => (row.slot === slot ? { ...row, ...changeSet } : row)),
    );
  };

  return (
    <section
      className="glass-panel rounded-2xl border border-primary/35 p-5"
      aria-label="Platform Services billing"
    >
      <p className="text-kicker text-xs">Developer only</p>
      <h2 className="mt-1 text-lg font-semibold">Platform Services billing</h2>
      <p className="text-sub mt-2 max-w-3xl text-sm">
        These are the bank details shown for Tier Pass and Magic Coin checkout. They are separate
        from tenant guest-voucher bank details, so a Primary account cannot redirect platform
        service payments.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {rows.map((row) => (
          <div key={row.slot} className="rounded-xl border border-border/70 bg-background/25 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Checkout account {row.slot}</h3>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(event) => change(row.slot, { enabled: event.target.checked })}
                />
                Show at checkout
              </label>
            </div>
            <div className="mt-3 grid gap-3">
              <label className="text-xs">
                <span className="text-muted-foreground">Account holder</span>
                <input
                  value={row.holder_name}
                  onChange={(event) => change(row.slot, { holder_name: event.target.value })}
                  className="mt-1 min-h-10 w-full rounded-xl border border-border/70 bg-background/60 px-3 text-sm"
                  placeholder="MikroMagic"
                />
              </label>
              <label className="text-xs">
                <span className="text-muted-foreground">Bank or wallet</span>
                <input
                  value={row.bank_name}
                  onChange={(event) => change(row.slot, { bank_name: event.target.value })}
                  className="mt-1 min-h-10 w-full rounded-xl border border-border/70 bg-background/60 px-3 text-sm"
                  placeholder="KBZ Pay, AYA Pay, KBZ Bank…"
                />
              </label>
              <label className="text-xs">
                <span className="text-muted-foreground">Account number</span>
                <input
                  value={row.account_number}
                  onChange={(event) => change(row.slot, { account_number: event.target.value })}
                  className="mt-1 min-h-10 w-full rounded-xl border border-border/70 bg-background/60 px-3 text-sm"
                  placeholder="Payment account number"
                />
              </label>
              <button
                type="button"
                disabled={save.isPending}
                onClick={() => save.mutate(row)}
                className="min-h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {save.isPending ? "Saving…" : `Save account ${row.slot}`}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MagicCoinPurchaseCard({ onChoose }: { onChoose: () => void }) {
  return (
    <article className="feature-card animate-rise relative flex flex-col overflow-hidden border-amber-300/40 bg-gradient-to-br from-amber-300/10 via-emerald-400/5 to-transparent">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-300/25 blur-3xl"
      />
      <div className="relative flex items-start gap-3">
        <MagicCoinIcon className="h-12 w-12 shrink-0" />
        <div>
          <h2 className="text-title text-xl">Magic Coins</h2>
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-amber-300">
            Wallet credit
          </p>
        </div>
      </div>
      <p className="text-sub relative mt-4 text-sm">
        Add Coins to your account wallet. Use them for eligible locked features and services.
      </p>
      <div className="relative mt-6 flex items-baseline gap-2">
        <span className="text-4xl font-black text-amber-200">1 Coin</span>
        <span className="text-kicker text-xs">= 1,000 MMK</span>
      </div>
      <ul className="relative mt-6 flex-1 space-y-2.5 text-sm">
        {[
          "Choose the number of Coins you need",
          "Total is calculated at 1 Coin = 1,000 MMK",
          "Upload a bank-transfer receipt for review",
          "Coins are credited only after approval",
        ].map((perk) => (
          <li key={perk} className="text-sub flex items-start gap-2.5">
            <span className="mt-0.5 text-amber-300" aria-hidden="true">
              ✦
            </span>
            <span>{perk}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onChoose}
        className="relative mt-7 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition active:scale-95"
      >
        Buy Magic Coins
      </button>
      <p className="relative mt-2 text-[11px] text-muted-foreground">
        Account wallet only. Coins cannot be transferred between accounts.
      </p>
    </article>
  );
}

function MagicCoinCheckout({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const fetchBanks = useServerFn(developerBankAccounts);
  const banks = useQuery({ queryKey: ["developer-banks"], queryFn: () => fetchBanks() });
  const submitFn = useServerFn(submitMagicCoinPurchase);
  const [quantityText, setQuantityText] = useState("5");
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const busy = useRef(false);
  const quantity = Number(quantityText);
  const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= 1_000_000;
  const total = validQuantity ? quantity * 1_000 : 0;

  const submit = useMutation({
    mutationFn: async () => {
      if (!validQuantity) throw new Error("Enter a whole number from 1 to 1,000,000 Magic Coins.");
      if (!file) throw new Error("Attach the bank payment slip first.");
      if (busy.current) throw new Error("Your request is already being sent.");
      busy.current = true;
      const buffer = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
      return submitFn({
        data: {
          quantity,
          reference: reference || undefined,
          receipt: {
            mime: file.type || "application/octet-stream",
            size: file.size,
            dataBase64: btoa(binary),
          },
        },
      });
    },
    onSuccess: () => {
      busy.current = false;
      toast.success("Magic Coin purchase sent for approval. Coins will be credited after review.");
      onDone();
    },
    onError: (e: Error) => {
      busy.current = false;
      toast.error(toErrorMessage(e));
    },
  });

  return (
    <section className="glass-panel rounded-2xl p-5" aria-label="Magic Coin purchase checkout">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <MagicCoinIcon className="h-10 w-10" />
          <div>
            <h2 className="text-lg font-semibold">Buy Magic Coins</h2>
            <p className="text-xs text-muted-foreground">1 Magic Coin = 1,000 MMK</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-9 rounded-xl border border-[color:var(--glass-border)] px-3 text-xs"
        >
          Cancel
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          <span className="text-muted-foreground">Number of Magic Coins</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="1000000"
            step="1"
            value={quantityText}
            onChange={(e) => setQuantityText(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-xl border border-amber-300/40 bg-background/60 px-3 text-sm"
          />
        </label>
        <div className="rounded-xl border border-amber-300/35 bg-amber-300/10 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total cost</p>
          <p className="mt-1 text-xl font-semibold text-amber-100">
            {validQuantity ? fmtMMK(total) : "Enter a valid quantity"}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {validQuantity
          ? `${fmtMagicCoins(quantity)} Magic Coins will be credited to this account after the payment is approved.`
          : "Enter a whole number of Coins to calculate the total."}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(banks.data?.accounts ?? []).map((a) => (
          <div
            key={a.id}
            className="rounded-xl border border-[color:var(--glass-border)] bg-white/5 p-3 text-sm"
          >
            <p className="font-semibold break-words">{a.bank_name}</p>
            <p className="break-words text-muted-foreground">{a.holder_name}</p>
            <p className="mt-1 font-mono text-sm">{a.account_number}</p>
          </div>
        ))}
        {banks.data && banks.data.accounts.length === 0 && (
          <p className="text-xs text-muted-foreground">
            The developer has not published bank details yet.
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          <span className="text-muted-foreground">Transfer reference (optional)</span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-xl border border-border/60 bg-background/60 px-3 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground">Payment slip (JPG, PNG, WebP, HEIC or PDF)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 min-h-11 w-full rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs"
          />
        </label>
      </div>
      <button
        type="button"
        disabled={submit.isPending || !file || !validQuantity}
        onClick={() => submit.mutate()}
        className="mt-4 min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {submit.isPending
          ? "Sending…"
          : `Submit ${validQuantity ? fmtMMK(total) : ""} for approval`}
      </button>
    </section>
  );
}

// ------------------------------------------------------------------ checkout --

function Checkout({
  offer,
  walletBalance,
  onClose,
  onDone,
}: {
  offer: Offer;
  walletBalance: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const fetchBanks = useServerFn(developerBankAccounts);
  const banks = useQuery({ queryKey: ["developer-banks"], queryFn: () => fetchBanks() });
  const submitFn = useServerFn(submitServicePurchase);
  const payWithCoinsFn = useServerFn(purchaseServiceWithMagicCoins);
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const busy = useRef(false);

  const submit = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Attach the bank payment slip first.");
      if (busy.current) throw new Error("Your request is already being sent.");
      busy.current = true;
      const buffer = await file.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
      return submitFn({
        data: {
          service: offer.key,
          reference: reference || undefined,
          receipt: {
            mime: file.type || "application/octet-stream",
            size: file.size,
            dataBase64: btoa(binary),
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Sent for approval. Nothing changes until the developer approves it.");
      busy.current = false;
      onDone();
    },
    onError: (e: Error) => {
      busy.current = false;
      toast.error(toErrorMessage(e));
    },
  });

  const payWithCoins = useMutation({
    mutationFn: () => payWithCoinsFn({ data: { service: offer.key } }),
    onSuccess: (result) => {
      toast.success(
        `${fmtMagicCoins(result.price_coins)} Magic Coins debited. The service is now pending approval.`,
      );
      onDone();
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  return (
    <section className="glass-panel rounded-2xl p-5" aria-label={`${offer.label} checkout`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {offer.label} — {fmtMMK(offer.price_mmk)}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="min-h-9 rounded-xl border border-[color:var(--glass-border)] px-3 text-xs"
        >
          Cancel
        </button>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Choose a bank transfer with receipt, or pay{" "}
        {fmtMagicCoins(magicCoinsForMMK(offer.price_mmk))} Magic Coins from this account wallet. One
        Magic Coin equals 1,000 MMK. Both paths stay pending until review.
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center gap-2 text-sm">
          <MagicCoinIcon className="h-7 w-7" />
          <span>
            Wallet: <strong>{fmtMagicCoins(walletBalance)} Magic Coins</strong>
          </span>
        </div>
        <button
          type="button"
          disabled={payWithCoins.isPending || walletBalance < magicCoinsForMMK(offer.price_mmk)}
          onClick={() => payWithCoins.mutate()}
          className="min-h-10 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {payWithCoins.isPending
            ? "Paying…"
            : `Pay ${fmtMagicCoins(magicCoinsForMMK(offer.price_mmk))} Magic Coins`}
        </button>
      </div>
      {walletBalance < magicCoinsForMMK(offer.price_mmk) && (
        <p className="mt-2 text-xs text-muted-foreground">
          You need {fmtMagicCoins(magicCoinsForMMK(offer.price_mmk) - walletBalance)} more Magic
          Coins.
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(banks.data?.accounts ?? []).map((a) => (
          <div
            key={a.id}
            className="rounded-xl border border-[color:var(--glass-border)] bg-white/5 p-3 text-sm"
          >
            <p className="font-semibold break-words">{a.bank_name}</p>
            <p className="break-words text-muted-foreground">{a.holder_name}</p>
            <p className="mt-1 font-mono text-sm">{a.account_number}</p>
          </div>
        ))}
        {banks.data && banks.data.accounts.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              The developer has not published bank details yet.
            </p>
            <TelegramCta label="Contact us on Telegram" variant="app" className="text-xs" />
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs">
          <span className="text-muted-foreground">Transfer reference (optional)</span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-xl border border-border/60 bg-background/60 px-3 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="text-muted-foreground">Payment slip (JPG, PNG, WebP, HEIC or PDF)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 min-h-11 w-full rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs"
          />
        </label>
      </div>

      <button
        type="button"
        disabled={submit.isPending || !file}
        onClick={() => submit.mutate()}
        className="mt-4 min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {submit.isPending ? "Sending…" : "Submit for approval"}
      </button>
    </section>
  );
}

// ------------------------------------------------------------- my purchases --

function MyPurchases({ rows }: { rows: Purchase[] }) {
  const urlFn = useServerFn(serviceReceiptUrl);
  if (!rows.length) return null;
  return (
    <section className="glass-panel overflow-hidden rounded-2xl">
      <h2 className="border-b border-border p-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        My purchase requests
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Slip</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-border align-top">
                <td className="px-4 py-2 break-words">{p.service_label}</td>
                <td className="px-4 py-2 text-xs">
                  {p.payment_method === "magic_coins"
                    ? `${fmtMagicCoins(Number(p.coin_amount ?? magicCoinsForMMK(p.price_mmk)))} Magic Coins`
                    : fmtMMK(p.price_mmk)}
                </td>
                <td className="px-4 py-2 text-[11px] text-muted-foreground">
                  {fmtDateTime(p.created_at)}
                </td>
                <td className="px-4 py-2 text-xs capitalize">
                  {p.status}
                  {p.reject_reason && (
                    <span className="block break-words text-[11px] text-muted-foreground">
                      {p.reject_reason}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {p.payment_method === "magic_coins" ? (
                    <span className="text-xs text-muted-foreground">Wallet</span>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const r = await urlFn({ data: { purchase_id: p.id } });
                          window.open(r.url, "_blank", "noopener");
                        } catch (e) {
                          toast.error(toErrorMessage(e));
                        }
                      }}
                      className="min-h-9 rounded-xl border border-[color:var(--glass-border)] px-3 text-xs"
                    >
                      View
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ------------------------------------------------------------- review queue --

function ReviewQueue() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const listFn = useServerFn(listServicePurchases);
  const urlFn = useServerFn(serviceReceiptUrl);
  const approveFn = useServerFn(approveServicePurchase);
  const rejectFn = useServerFn(rejectServicePurchase);

  const q = useQuery({
    queryKey: ["service-purchases", status],
    queryFn: () => listFn({ data: { status } }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["service-purchases"] });
    qc.invalidateQueries({ queryKey: ["services"] });
  };

  const approve = useMutation({
    mutationFn: (id: string) => approveFn({ data: { purchase_id: id } }),
    onSuccess: (result) => {
      toast.success(
        result.activation
          ? "Approved — the entitlement is now active."
          : "Approved — Magic Coins were credited to the wallet.",
      );
      refresh();
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });
  const reject = useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      rejectFn({ data: { purchase_id: v.id, reason: v.reason } }),
    onSuccess: () => {
      toast.success("Rejected — nothing on the account changed.");
      refresh();
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  return (
    <section className="glass-panel overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Purchase review (developer only)
        </h2>
        <div className="flex gap-2">
          {(["pending", "approved", "rejected", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`min-h-9 rounded-full px-3 text-xs capitalize ${
                status === s
                  ? "bg-primary text-primary-foreground"
                  : "border border-[color:var(--glass-border)] text-muted-foreground"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Buyer</th>
              <th className="px-4 py-3">Service</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!q.isLoading && (q.data ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No {status === "all" ? "" : status} purchase requests.
                </td>
              </tr>
            )}
            {(q.data ?? []).map((p) => (
              <tr key={p.id} className="border-t border-border align-top">
                <td className="px-4 py-2 break-words">{p.buyer}</td>
                <td className="px-4 py-2 break-words">{p.service_label}</td>
                <td className="px-4 py-2 text-xs">
                  {p.payment_method === "magic_coins"
                    ? `${fmtMagicCoins(Number(p.coin_amount ?? magicCoinsForMMK(p.price_mmk)))} Magic Coins`
                    : fmtMMK(p.price_mmk)}
                </td>
                <td className="px-4 py-2 text-[11px] text-muted-foreground">
                  {fmtDateTime(p.created_at)}
                </td>
                <td className="px-4 py-2 text-xs capitalize">{p.status}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-2">
                    {p.payment_method === "magic_coins" ? (
                      <span className="px-1 text-xs text-muted-foreground">Wallet paid</span>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const r = await urlFn({ data: { purchase_id: p.id } });
                            window.open(r.url, "_blank", "noopener");
                          } catch (e) {
                            toast.error(toErrorMessage(e));
                          }
                        }}
                        className="min-h-9 rounded-xl border border-[color:var(--glass-border)] px-3 text-xs"
                      >
                        Receipt
                      </button>
                    )}
                    {p.status === "pending" && (
                      <>
                        <button
                          type="button"
                          disabled={approve.isPending}
                          onClick={() => approve.mutate(p.id)}
                          className="min-h-9 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={reject.isPending}
                          onClick={() => {
                            const reason = window.prompt("Reason for rejecting this payment?");
                            if (reason && reason.trim().length >= 3) {
                              reject.mutate({ id: p.id, reason: reason.trim() });
                            }
                          }}
                          className="min-h-9 rounded-xl border border-destructive/50 px-3 text-xs text-destructive"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
