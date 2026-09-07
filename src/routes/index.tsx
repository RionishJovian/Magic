import { BrandSignature } from "@/components/BrandSignature";
import { MarketingCtaLink } from "@/components/MarketingCta";
import { TelegramCta } from "@/components/TelegramCta";
import { createFileRoute } from "@tanstack/react-router";
import { CinematicIntro } from "@/components/CinematicIntro";
import { OG_IMAGE_DEFAULT, SITE_ORIGIN } from "@/lib/site-meta";
import { landingProductStats } from "@/lib/product-claims";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MikroTik Magic — Cloud Hotspot & Voucher Manager" },
      {
        name: "description",
        content:
          "Manage MikroTik hotspot routers from the cloud: vouchers, live sessions, a liquid-glass captive portal, fleet health, and AI security insights.",
      },
      { property: "og:title", content: "MikroTik Magic — Cloud Hotspot & Voucher Manager" },
      {
        property: "og:description",
        content:
          "Manage MikroTik hotspot routers from the cloud: vouchers, live sessions, a liquid-glass captive portal, fleet health, and AI security insights.",
      },
      { property: "og:url", content: `${SITE_ORIGIN}/` },
      { property: "og:type", content: "website" },
      { property: "og:image", content: OG_IMAGE_DEFAULT },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: OG_IMAGE_DEFAULT },
      { name: "twitter:title", content: "MikroTik Magic — Cloud Hotspot & Voucher Manager" },
      {
        name: "twitter:description",
        content:
          "Manage MikroTik hotspot routers from the cloud: vouchers, live sessions, a liquid-glass captive portal, fleet health, and AI security insights.",
      },
    ],

    links: [{ rel: "canonical", href: `${SITE_ORIGIN}/` }],
  }),
  component: Landing,
});

type Feature = {
  title: string;
  body: string;
  gradient: [string, string];
  svgInner: string;
};

function buildThumbDataUri(gradient: [string, string], svgInner: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${gradient[0]}"/>
      <stop offset="100%" stop-color="${gradient[1]}"/>
    </linearGradient>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.35"/>
      <stop offset="55%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="96" height="96" rx="22" fill="url(#g)"/>
  <rect x="0" y="0" width="96" height="96" rx="22" fill="url(#s)"/>
  <g transform="translate(24 24) scale(2)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${svgInner}
  </g>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function Landing() {
  const features: Feature[] = [
    {
      title: "Voucher-first hotspot",
      body: "Bulk-generate voucher codes from reusable plans (1d / 7d / 1M / VIP), print slips, and pool them across every router you own.",
      gradient: ["#34d399", "#059669"],
      svgInner:
        '<path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z"/><path d="M13 6v12" stroke-dasharray="2 2"/>',
    },
    {
      title: "Liquid-glass portal",
      body: "Design the captive portal in the browser — text, logos and images all editable — then deploy it to the router in one click.",
      gradient: ["#60a5fa", "#7c3aed"],
      svgInner:
        '<rect x="3" y="4" width="18" height="14" rx="3"/><path d="M3 9h18"/><circle cx="6.5" cy="6.5" r="0.6" fill="#ffffff"/>',
    },
    {
      title: "Live user monitor",
      body: "Active sessions with IP, MAC, data usage and remaining voucher time — kick, ban or cap bandwidth in one tap.",
      gradient: ["#f472b6", "#ef4444"],
      svgInner: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
    },
    {
      title: "Fleet & AI insights",
      body: "Live router health, traffic and events, plus on-demand AI scans that explain errors and hand you the exact RouterOS fix.",
      gradient: ["#fbbf24", "#f97316"],
      svgInner:
        '<path d="M12 3l2.5 5 5.5.8-4 3.9 1 5.6L12 15.8 6.9 18.3l1-5.6L4 8.8 9.5 8 12 3z"/>',
    },
    {
      title: "Sites & external APs",
      body: "Map each site, put external APs in bridge mode, and let MikroTik Magic manage the RouterOS gateway, Hotspot, DHCP, vouchers and portal. Optional controller integrations stay in Advanced Mode.",
      gradient: ["#22d3ee", "#6366f1"],
      svgInner:
        '<path d="M12 20v-6"/><circle cx="12" cy="12" r="1.6" fill="#ffffff"/><path d="M8.5 8.5a5 5 0 0 1 7 0"/><path d="M5.5 5.5a9 9 0 0 1 13 0"/>',
    },
    {
      title: "Revenue & reporting",
      body: "Voucher sales, usage and expiry roll up automatically into a MMK revenue dashboard with daily, weekly and monthly audit views.",
      gradient: ["#a3e635", "#16a34a"],
      svgInner: '<path d="M4 19h16"/><path d="M7 19V9"/><path d="M12 19V5"/><path d="M17 19v-7"/>',
    },
    {
      title: "Works behind CGNAT",
      body: "No public IP? Use Magic Hub (Cloud Remote — the board dials out) or install the Windows/macOS Local Connector on site. Guided setup, paste script or pairing code, done.",
      gradient: ["#38bdf8", "#0ea5e9"],
      svgInner:
        '<path d="M9 12H5a3 3 0 0 1 0-6h4"/><path d="M15 12h4a3 3 0 0 1 0 6h-4"/><path d="M8 15h8"/>',
    },
    {
      title: "Security & protection",
      body: "Hotspot Share Protection helps stop tethering, and encrypted credentials never leave the cloud.",
      gradient: ["#c084fc", "#7c3aed"],
      svgInner:
        '<path d="M12 3l8 3v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>',
    },
  ];

  return (
    <div className="relative z-10 min-h-[100dvh] overflow-hidden text-foreground">
      <CinematicIntro />
      {/* Floating orbs */}
      <div
        className="orb"
        style={{
          top: "-8rem",
          left: "-6rem",
          width: "28rem",
          height: "28rem",
          background: "var(--orb-a)",
          opacity: 0.45,
        }}
        aria-hidden="true"
      />
      <div
        className="orb hidden dark:block"
        style={{
          top: "10rem",
          right: "-8rem",
          width: "32rem",
          height: "32rem",
          background: "var(--orb-b)",
          animationDelay: "-4s",
          opacity: 0.42,
        }}
        aria-hidden="true"
      />
      <div
        className="orb hidden dark:block"
        style={{
          top: "60%",
          left: "-10rem",
          width: "36rem",
          height: "36rem",
          background: "var(--orb-c, #2a3f80)",
          animationDelay: "-8s",
          opacity: 0.28,
        }}
        aria-hidden="true"
      />
      <div
        className="orb hidden dark:block"
        style={{
          bottom: "-4rem",
          right: "10%",
          width: "24rem",
          height: "24rem",
          background: "var(--orb-d, #4a235a)",
          animationDelay: "-12s",
          opacity: 0.22,
        }}
        aria-hidden="true"
      />

      <header className="container-page flex items-center justify-between gap-3 py-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <span className="inline-block h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_var(--color-primary)]" />
          <span className="text-sm font-semibold tracking-wide text-title">MikroTik Magic</span>
          <BrandSignature />
        </div>
      </header>

      <main className="container-page py-14">
        <section className="mx-auto max-w-4xl text-center animate-rise">
          <span className="eyebrow">Your entire hotspot. One cloud dashboard.</span>

          <h1 className="text-title mt-8 text-5xl font-black leading-[1.02] tracking-tight sm:text-7xl">
            The place where all the <span className="gradient-text">magic</span> happens.
          </h1>

          <p className="text-sub mx-auto mt-6 max-w-2xl text-base sm:text-lg">
            Run your whole hotspot business from any browser: routers, sites and access points,
            vouchers and MMK revenue, a liquid-glass captive portal, fleet health, syslog and AI
            fixes. Reach the board with Magic Hub (Cloud Remote for Starlink / CGNAT) or a Local
            Connector on site — no public IP required.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <MarketingCtaLink to="/pricing" variant="glow">
              Pricing plan
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </MarketingCtaLink>
            <MarketingCtaLink to="/auth" variant="ghost">
              Login
            </MarketingCtaLink>
          </div>

          <ul className="text-sub mx-auto mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm">
            {[
              "Vouchers & revenue",
              "Live monitor",
              "Sites & APs",
              "Fleet & AI",
              "No public IP needed",
            ].map((t) => (
              <li key={t} className="text-kicker inline-flex items-center gap-2">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {t}
              </li>
            ))}
          </ul>
        </section>

        {/* Stats row — digits from product-claims (nav + connection methods), not marketing fiction */}
        <section className="glass-panel mt-20 grid grid-cols-2 gap-6 rounded-2xl py-10 sm:grid-cols-4">
          {landingProductStats().map((s) => (
            <div key={s.l} className="text-center">
              <div className="stat-num">{s.n}</div>
              <div className="text-kicker mt-2 text-[0.7rem] font-medium uppercase tracking-[0.18em]">
                {s.l}
              </div>
            </div>
          ))}
        </section>

        <section className="mt-16">
          <div className="text-center">
            <span className="eyebrow">Business in a box</span>
            <h2 className="text-title mt-6 text-3xl leading-tight sm:text-4xl">
              Everything you need.
              <br />
              <span className="gradient-text">Nothing you don't.</span>
            </h2>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {features.map((f, i) => (
              <article
                key={f.title}
                className="feature-card animate-rise"
                style={{ animationDelay: `${i * 90}ms` }}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={buildThumbDataUri(f.gradient, f.svgInner)}
                    alt=""
                    aria-hidden="true"
                    width={48}
                    height={48}
                    loading="lazy"
                    decoding="async"
                    style={{ aspectRatio: "1 / 1" }}
                    className="h-12 w-12 shrink-0 rounded-[14px] shadow-[0_8px_20px_-6px_rgba(0,0,0,0.5)] ring-1 ring-white/20"
                  />
                  <h3 className="text-title text-base">{f.title}</h3>
                </div>
                <p className="text-sub mt-3 text-sm">{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="support" aria-labelledby="support-heading" className="mt-14">
          <article className="panel p-6 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-xl">
                <div className="text-kicker text-xs uppercase tracking-[0.2em]">
                  Support & contact
                </div>
                <h2 id="support-heading" className="text-title mt-2 text-2xl">
                  Need a hand? <span className="gradient-text">Talk to a human.</span>
                </h2>
                <p className="text-sub mt-3 text-sm">
                  Account requests, activations, renewals, and setup help all go through Telegram.
                  We reply personally — no ticket queues, no bots.
                </p>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-kicker text-xs uppercase tracking-wide">Hours</dt>
                    <dd className="text-title mt-1">Mon–Sat · 09:00–21:00 (UTC+6:30)</dd>
                  </div>
                  <div>
                    <dt className="text-kicker text-xs uppercase tracking-wide">
                      Typical response
                    </dt>
                    <dd className="text-title mt-1">
                      Under 2 hours during hours · within 24h otherwise
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                <TelegramCta />
              </div>
            </div>
          </article>
        </section>
      </main>

      <footer className="container-page flex flex-wrap items-center justify-between gap-3 border-t border-border py-6 text-sub text-xs">
        <span>© {new Date().getFullYear()} MikroTik Magic</span>
        <span className="signature">
          Vibes by <span className="signature-name">Nish</span>
        </span>
      </footer>
    </div>
  );
}
