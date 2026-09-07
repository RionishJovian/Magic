import { createFileRoute } from "@tanstack/react-router";
import { HomeToolThumb, type HomeToolAccent } from "@/components/HomeToolThumb";
import { HomeToolIcons as icon } from "@/components/home-tool-icons";
import { ThemeToggle } from "@/components/ThemeToggle";

const CARDS: {
  title: string;
  body: string;
  accent: HomeToolAccent;
  glyph: keyof typeof icon;
  pill: string;
}[] = [
  {
    title: "Connectors",
    body: "Pair a local LAN agent when the site is behind CGNAT — no port-forward, same Live and vouchers.",
    accent: "pine",
    glyph: "connectors",
    pill: "LAN BRIDGE",
  },
  {
    title: "Routers",
    body: "Add your MikroTik, see live online status and telemetry without digging.",
    accent: "navy",
    glyph: "router",
    pill: "1/1 ONLINE",
  },
  {
    title: "Live users",
    body: "See who's on the hotspot right now — kick, ban, or throttle a session.",
    accent: "sage",
    glyph: "live",
    pill: "MONITORING",
  },
  {
    title: "Incidents",
    body: "Site offline, WAN degraded, connector stale, AP down — acknowledge and quiet hours.",
    accent: "coral",
    glyph: "incidents",
    pill: "WATCHING",
  },
  {
    title: "Vouchers",
    body: "Plans (speed / devices / quotas), bulk codes, printable slips, and live redemption status.",
    accent: "gold",
    glyph: "vouchers",
    pill: "NO CODES YET",
  },
  {
    title: "Portal designer",
    body: "Brand the guest login page, then publish or roll back straight to the router.",
    accent: "mist",
    glyph: "portal",
    pill: "NOT PUBLISHED",
  },
  {
    title: "Fleet",
    body: "Live health, traffic and events across every device, with on-demand AI scans that explain errors.",
    accent: "pine",
    glyph: "fleet",
    pill: "ALL HEALTHY",
  },
  {
    title: "Sites",
    body: "Group routers and access points by location, then switch context from the header.",
    accent: "navy",
    glyph: "sites",
    pill: "1 SITE",
  },
];

type Search = { theme?: string };

export const Route = createFileRoute("/dev/home-thumbs")({
  validateSearch: (raw: Record<string, unknown>): Search => ({
    theme: typeof raw.theme === "string" ? raw.theme : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Home thumbs — Elegant Natural preview" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HomeThumbsPreview,
});

function CardGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {CARDS.map((c) => (
        <article
          key={c.title}
          className="glass-panel interactive-card group relative flex items-start gap-4 rounded-[1.5rem] p-5"
        >
          <HomeToolThumb accent={c.accent}>{icon[c.glyph]}</HomeToolThumb>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-title text-lg">{c.title}</div>
              <span className="text-kicker text-[10px] uppercase tracking-[0.12em]">{c.pill}</span>
            </div>
            <p className="text-sub mt-2 text-sm leading-relaxed">{c.body}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function HomeThumbsPreview() {
  if (!import.meta.env.DEV) {
    return <p className="p-6 text-sm text-muted-foreground">Dev only.</p>;
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-background">
      <div
        aria-hidden
        className="orb pointer-events-none fixed -top-32 -right-24 hidden h-[28rem] w-[28rem] rounded-full opacity-45 dark:block"
        style={{ background: "radial-gradient(circle, var(--orb-a) 0%, transparent 62%)" }}
      />
      <div className="relative z-10 p-4 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-kicker text-[10px] uppercase tracking-[0.16em]">
              MikroTik Magic · preview
            </p>
            <h1 className="text-title text-lg">Home cards — glass thumbnails</h1>
            <p className="text-sub mt-1 text-sm">
              Sage / pine / navy / gold / coral / mist glass tiles.
            </p>
          </div>
          <ThemeToggle />
        </div>
        <CardGrid />
      </div>
    </div>
  );
}
