import { BrandSignature } from "@/components/BrandSignature";
import { TelegramCta } from "@/components/TelegramCta";
import { PlanUsageMeter } from "@/components/PlanUsageMeter";
import {
  getPricingPromo,
  PRICING_PROMO_FALLBACK,
  type PricingPromo,
} from "@/lib/pricing.functions";
import { APP_TIMEZONE } from "@/lib/time";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { hoverLift, pressScaleMobile, springSnappy } from "@/lib/motion-presets";
import { OG_IMAGE_ALT_PRICING, OG_IMAGE_PRICING, SITE_ORIGIN } from "@/lib/site-meta";

const mmk = (n: number) => `${n.toLocaleString("en-US")} MMK`;
/** Calendar day from YYYY-MM-DD, shown in Asia/Yangon (app timezone). */
const day = (iso: string) =>
  new Date(`${iso}T12:00:00+06:30`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: APP_TIMEZONE,
  });

export const Route = createFileRoute("/pricing")({
  loader: async () => {
    try {
      return { promo: await getPricingPromo() };
    } catch {
      return { promo: PRICING_PROMO_FALLBACK };
    }
  },

  head: () => ({
    meta: [
      { title: "Pricing plans — MikroTik Magic" },
      {
        name: "description",
        content:
          "Emerald monthly, Sapphire annual and Amethyst commission-based plans for MikroTik Magic cloud hotspot management.",
      },
      { property: "og:title", content: "Pricing plans — MikroTik Magic" },
      {
        property: "og:description",
        content:
          "Emerald monthly, Sapphire annual and Amethyst commission-based plans for MikroTik Magic cloud hotspot management.",
      },
      { property: "og:url", content: `${SITE_ORIGIN}/pricing` },
      { property: "og:image", content: OG_IMAGE_PRICING },
      { property: "og:image:alt", content: OG_IMAGE_ALT_PRICING },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: OG_IMAGE_PRICING },
      { name: "twitter:image:alt", content: OG_IMAGE_ALT_PRICING },
      { name: "twitter:title", content: "Pricing plans — MikroTik Magic" },
      {
        name: "twitter:description",
        content:
          "Emerald monthly, Sapphire annual and Amethyst commission-based plans for MikroTik Magic.",
      },
    ],
    links: [{ rel: "canonical", href: `${SITE_ORIGIN}/pricing` }],
  }),
  component: PricingPage,
});

type Plan = {
  gem: string;
  cadence: string;
  blurb: string;
  price: string;
  wasPrice?: string;
  unit: string;
  perks: string[];
  features: string[];
  limits: string;
  gradient: [string, string];
  glow: string;
  featured?: boolean;
  unlimited?: boolean;
  breakdown?: { label: string; value: string }[];
};

function buildPlans(promo: PricingPromo): Plan[] {
  const on = promo.active;
  const endsOn = day(promo.ends_on);
  const monthly = on ? promo.monthly_promo_mmk : promo.monthly_standard_mmk;
  const annual = on ? promo.annual_promo_mmk : promo.annual_standard_mmk;
  const annualSaving = promo.annual_standard_mmk - promo.annual_promo_mmk;

  return [
    {
      gem: "Emerald",
      cadence: "Monthly",
      blurb: on
        ? `Grand opening — 30% off: ${mmk(monthly)} instead of ${mmk(promo.monthly_standard_mmk)} through ${endsOn}. Cancel any time.`
        : "Month-to-month magic. Start small, cancel any time.",
      price: mmk(monthly),
      ...(on ? { wasPrice: mmk(promo.monthly_standard_mmk) } : {}),
      unit: on ? "per month — 30% off" : "per month",

      perks: [
        "Full router and site management, plus optional AP integrations",
        "Vouchers, live monitor and revenue dashboard",
        "Liquid-glass portal deploys",
      ],
      features: [
        "1 router, 3 sites and 15 optional AP integrations",
        "Hotspot vouchers and voucher plans",
        "Live user monitor with ban, kick and bandwidth control",
        "Liquid-glass portal editor and one-click deploy",
        "Revenue dashboard and daily / weekly / monthly audits",
        "30 manual AI scans a month",
        "Quick-setup wizard and guided router onboarding",
        "Cancel any time",
      ],
      limits: "1 router / 3 sites / 15 optional AP integrations",
      gradient: ["#34d399", "#059669"],
      glow: "16,185,129",
    },
    {
      gem: "Sapphire",
      cadence: "Annually",
      blurb: on
        ? `Grand opening — 30% off: ${mmk(annual)} instead of ${mmk(promo.annual_standard_mmk)} through ${endsOn} — a full year, billed once.`
        : "A full year of hotspot magic on the same device quota as Emerald, billed once.",
      price: mmk(annual),
      ...(on ? { wasPrice: mmk(promo.annual_standard_mmk) } : {}),
      unit: on ? `per year — 30% off, save ${mmk(annualSaving)}` : "per year",
      perks: [
        "Everything in Emerald",
        "1 router, 3 sites and 15 optional AP integrations",
        "30 manual AI scans a month",
        on ? "Grand opening price locked for the year" : "One payment for twelve months",
        "Priority support and onboarding",
      ],
      features: [
        "Everything in Emerald",
        "1 router, 3 sites and 15 optional AP integrations",
        on
          ? `Billed once a year — save ${mmk(annualSaving)} vs the standard ${mmk(promo.annual_standard_mmk)}`
          : "Billed once a year",
        "Priority support and guided onboarding",
        "Extended history, reporting and backups",
        "Fleet health score and AI insights",
        "30 manual AI scans a month",
      ],
      limits: "1 router / 3 sites / 15 optional AP integrations",
      gradient: ["#60a5fa", "#4f46e5"],
      glow: "96,165,250",
      featured: true,
      ...(on
        ? {
            breakdown: [
              { label: "Standard annual price", value: `${mmk(promo.annual_standard_mmk)} / year` },
              { label: "Grand opening price", value: `${mmk(annual)} / year` },
              {
                label: "Standard monthly rate",
                value: `${mmk(promo.monthly_standard_mmk)} → ${mmk(monthly)} now`,
              },
              { label: "You save", value: `${mmk(annualSaving)} — offer ends ${endsOn}` },
            ],
          }
        : {}),
    },

    {
      gem: "Amethyst",
      cadence: "Revenue share",
      blurb:
        "Say no more — no monthly or annual fee. Team Magic takes 20% of your project revenue instead.",
      price: "20%",
      unit: "of monthly revenue",
      perks: [
        "No subscription fee at all",
        "No time expiry, no device limits",
        "Pay only from what your network earns",
      ],
      features: [
        "No monthly or annual payment",
        "No account expiry — the app never locks you out",
        "No router, AP or site limits",
        "Every feature unlocked, including AI insights and fleet tools",
        "Team Magic collects 20% of project revenue each month",
        "Ideal for operators who prefer paying from earnings",
      ],
      limits: "Unlimited devices — no expiry",
      gradient: ["#c084fc", "#7c3aed"],
      glow: "168,85,247",
      unlimited: true,
    },
  ];
}

function PricingPage() {
  const { promo } = Route.useLoaderData();
  const plans = buildPlans(promo);
  const reduceMotion = useReducedMotion();
  return (
    <div className="relative z-10 min-h-[100dvh] overflow-hidden text-foreground">
      <div
        className="orb"
        style={{
          top: "-8rem",
          left: "-6rem",
          width: "28rem",
          height: "28rem",
          background: "#34d399",
        }}
        aria-hidden="true"
      />
      <div
        className="orb"
        style={{
          top: "12rem",
          right: "-8rem",
          width: "32rem",
          height: "32rem",
          background: "#7c3aed",
          animationDelay: "-4s",
        }}
        aria-hidden="true"
      />

      <header className="container-page flex items-center justify-between gap-3 py-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <Link to="/" className="flex items-center gap-3">
          <span className="inline-block h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_var(--color-primary)]" />
          <span className="text-sm font-semibold tracking-wide text-title">MikroTik Magic</span>
          <BrandSignature />
        </Link>
        <Link to="/auth" className="cta-ghost">
          Login
        </Link>
      </header>

      <main className="container-page py-10 sm:py-14">
        <section className="mx-auto max-w-3xl text-center animate-rise">
          <span className="eyebrow">Pricing plans</span>
          <h1 className="text-title mt-8 text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
            Pick your <span className="gradient-text">gem</span>.
          </h1>
          <p className="text-sub mx-auto mt-6 max-w-2xl text-base sm:text-lg">
            Three ways to run MikroTik Magic — a monthly Emerald, a yearly Sapphire, or an Amethyst
            that grows with your revenue.
          </p>
          {promo.active && (
            <div className="feature-card mx-auto mt-8 max-w-2xl text-left">
              <div className="text-kicker text-[0.7rem] uppercase tracking-[0.18em]">
                Grand opening — {day(promo.starts_on)} through {day(promo.ends_on)}
              </div>
              <h2 className="text-title mt-2 text-lg">{promo.label}</h2>
              <p className="text-sub mt-2 text-sm">
                Emerald (Monthly) and Sapphire (Annual) are <strong>30% off</strong> through{" "}
                {day(promo.ends_on)} (Asia/Yangon). From the day after, standard rates return:{" "}
                <strong className="text-foreground">
                  {mmk(promo.monthly_standard_mmk)} / month
                </strong>{" "}
                and{" "}
                <strong className="text-foreground">{mmk(promo.annual_standard_mmk)} / year</strong>
                . Buy during the window and lock in the discounted price for that paid term.
              </p>
            </div>
          )}
        </section>

        <section className="mt-14 grid gap-5 lg:grid-cols-3">
          {plans.map((p, i) => (
            <article
              key={p.gem}
              className="feature-card animate-rise relative overflow-hidden"
              style={{
                animationDelay: `${i * 110}ms`,
                borderColor: `rgba(${p.glow},0.35)`,
                boxShadow: p.featured
                  ? `0 24px 60px -28px rgba(${p.glow},0.9)`
                  : `0 18px 48px -32px rgba(${p.glow},0.7)`,
              }}
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-40 blur-3xl"
                style={{
                  background: `radial-gradient(circle, ${p.gradient[0]} 0%, transparent 65%)`,
                }}
              />

              <div className="relative flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl"
                    style={{
                      background: `linear-gradient(135deg, ${p.gradient[0]}, ${p.gradient[1]})`,
                      boxShadow: `0 10px 26px -10px rgba(${p.glow},0.9)`,
                    }}
                  >
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 3h12l3 6-9 12L3 9l3-6z" />
                      <path d="M3 9h18M9 3l-3 6 6 12 6-12-3-6" />
                    </svg>
                  </span>
                  <div>
                    <h2 className="text-title text-xl">{p.gem}</h2>
                    <div
                      className="text-[0.7rem] font-semibold uppercase tracking-[0.18em]"
                      style={{ color: p.gradient[0] }}
                    >
                      {p.cadence}
                    </div>
                  </div>
                </div>
                {p.featured && (
                  <span className="text-kicker rounded-full border border-[color:var(--glass-border)] bg-white/5 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em]">
                    Best value
                  </span>
                )}
              </div>

              <p className="text-sub relative mt-4 text-sm">{p.blurb}</p>

              <div className="relative mt-6 flex flex-wrap items-baseline gap-2">
                <span
                  className="text-4xl font-black"
                  style={{
                    background: `linear-gradient(135deg, ${p.gradient[0]}, ${p.gradient[1]})`,
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                  }}
                >
                  {p.price}
                </span>
                {p.wasPrice && (
                  <span className="text-sub text-sm font-semibold line-through">{p.wasPrice}</span>
                )}
                <span className="text-kicker text-xs">{p.unit}</span>
              </div>

              {p.wasPrice && (
                <div
                  className="relative mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold"
                  style={{
                    borderColor: `rgba(${p.glow},0.45)`,
                    color: p.gradient[0],
                    background: `rgba(${p.glow},0.08)`,
                  }}
                >
                  {promo.label} — ends {day(promo.ends_on)}
                </div>
              )}

              {p.breakdown && (
                <div
                  className="relative mt-4 rounded-2xl border p-3.5"
                  style={{
                    borderColor: `rgba(${p.glow},0.35)`,
                    background: `rgba(${p.glow},0.07)`,
                  }}
                >
                  <div
                    className="text-[0.7rem] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: p.gradient[0] }}
                  >
                    Best-value breakdown
                  </div>
                  <dl className="mt-2 space-y-1.5 text-xs">
                    {p.breakdown.map((b) => (
                      <div key={b.label} className="flex items-baseline justify-between gap-3">
                        <dt className="text-sub">{b.label}</dt>
                        <dd className="text-title text-right">{b.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              <PlanUsageMeter accent={p.gradient[0]} unlimited={p.unlimited} />

              <ul className="relative mt-6 space-y-2.5 text-sm">
                {p.perks.map((perk) => (
                  <li key={perk} className="text-sub flex items-start gap-2.5">
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={p.gradient[0]}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mt-0.5 shrink-0"
                      aria-hidden="true"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>

              <div className="relative mt-6 border-t border-[color:var(--glass-border)] pt-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-kicker text-[0.7rem] uppercase tracking-[0.18em]">
                    What's included
                  </h3>
                  <span
                    className="rounded-full border px-2.5 py-1 text-[10px] font-semibold"
                    style={{
                      borderColor: `rgba(${p.glow},0.45)`,
                      color: p.gradient[0],
                      background: `rgba(${p.glow},0.08)`,
                    }}
                  >
                    {p.limits}
                  </span>
                </div>
                <ul className="mt-3 space-y-2 text-[13px]">
                  {p.features.map((f) => (
                    <li key={f} className="text-sub flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: p.gradient[0] }}
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <motion.div
                className="relative mt-7 w-full"
                whileHover={reduceMotion ? undefined : { y: hoverLift, scale: 1.01 }}
                whileTap={reduceMotion ? undefined : { scale: pressScaleMobile }}
                transition={springSnappy}
              >
                <Link
                  to="/auth"
                  className="inline-flex w-full items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold text-white"
                  style={{
                    background: `linear-gradient(135deg, ${p.gradient[0]}, ${p.gradient[1]})`,
                    boxShadow: `0 16px 34px -18px rgba(${p.glow},1)`,
                  }}
                >
                  Choose {p.gem}
                </Link>
              </motion.div>
            </article>
          ))}
        </section>

        <section className="mx-auto mt-12 max-w-xl text-center">
          <div className="feature-card">
            <h2 className="text-title text-lg">Questions about a plan?</h2>
            <p className="text-sub mt-2 text-sm">
              Talk to the Developer directly for upgrades, device-slot requests, revenue-share terms
              or anything else about MikroTik Magic.
            </p>
            <TelegramCta variant="app" className="mt-5" />
            <p className="mt-4 text-sub text-xs">
              Device limits are enforced on the server for every account; request another slot to
              add more routers, sites or optional AP controller integrations.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
