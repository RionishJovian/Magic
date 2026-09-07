import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppBottomNav } from "@/components/AppBottomNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BrandSignature } from "@/components/BrandSignature";
import { NotificationsBell } from "@/components/NotificationsBell";
import { InAppNoticeProvider } from "@/components/InAppNotice";
import { MagicHubSparkles } from "@/components/MagicHubSparkle";
import { connectionMethodsForRole } from "@/lib/connection-methods";
import type { NavMode } from "@/lib/nav/modes";

/**
 * DEV-only Elegant Natural theme preview — hotspot operator layout without login.
 */
export const Route = createFileRoute("/dev/ux-shell")({
  head: () => ({
    meta: [{ title: "UX shell preview — MikroTik Magic" }, { name: "robots", content: "noindex" }],
  }),
  component: UxShellPreview,
});

function UxShellPreview() {
  const isDevelopment = import.meta.env.DEV;
  const roles = useMemo(() => ["client"] as const, []);
  const [mode, setMode] = useState<NavMode>("business");

  if (!isDevelopment) {
    return (
      <div className="grid min-h-[100dvh] place-items-center p-6 text-sm text-muted-foreground">
        This preview is only available in local development.
      </div>
    );
  }

  const quickActions = ["Vouchers", "Live sessions", "Portal", "Routers"] as const;

  return (
    <InAppNoticeProvider>
      <div className="min-h-[100dvh] min-w-0 max-w-full overflow-x-clip">
        <div
          aria-hidden
          className="orb pointer-events-none fixed -top-32 -right-24 hidden h-[28rem] w-[28rem] rounded-full opacity-45 dark:block"
          style={{ background: "radial-gradient(circle, var(--orb-a) 0%, transparent 62%)" }}
        />
        <div
          aria-hidden
          className="orb pointer-events-none fixed top-1/3 -left-32 hidden h-[24rem] w-[24rem] rounded-full opacity-40 dark:block"
          style={{
            background: "radial-gradient(circle, var(--orb-b) 0%, transparent 62%)",
            animationDelay: "-4s",
          }}
        />
        <div
          aria-hidden
          className="orb pointer-events-none fixed bottom-1/4 right-0 hidden h-[20rem] w-[20rem] rounded-full opacity-22 dark:block"
          style={{
            background: "radial-gradient(circle, var(--orb-c, #2a3f80) 0%, transparent 62%)",
            animationDelay: "-8s",
            opacity: 0.2,
          }}
        />
        <div
          aria-hidden
          className="orb pointer-events-none fixed bottom-0 left-1/3 hidden h-[18rem] w-[18rem] rounded-full dark:block"
          style={{
            background: "radial-gradient(circle, var(--orb-d, #4a235a) 0%, transparent 62%)",
            animationDelay: "-12s",
            opacity: 0.16,
          }}
        />

        <header className="app-header sticky top-0 z-30 border-b border-[color:var(--glass-border)]">
          <div className="container-page flex items-center justify-between gap-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-kicker">
                MikroTik Magic <BrandSignature className="shrink-0" />
              </div>
              <h1 className="gradient-text truncate text-sm font-semibold">Home</h1>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <NotificationsBell enabled={false} />
            </div>
          </div>
        </header>

        <main className="container-page app-shell-pad space-y-4 pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-kicker text-xs uppercase tracking-[0.16em]">Hotspot dashboard</p>
              <h2 className="text-title mt-1 text-2xl tracking-tight sm:text-3xl">
                Good morning, <span className="gradient-text">Admin</span>
              </h2>
              <p className="text-sub mt-1 text-sm leading-relaxed">
                RouterBoard remote management · voucher income · live sessions.
              </p>
            </div>
            <span className="text-sub inline-flex w-fit min-h-9 items-center rounded-full border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] px-3 text-[11px] font-medium">
              All sites
            </span>
          </div>

          <section
            className="glass-panel rounded-[1.75rem] p-5"
            data-testid="dev-connection-methods"
          >
            <h3 className="text-title text-sm">Connection method (Client preview)</h3>
            <p className="text-sub mt-1 text-xs">
              Same list as Add router — Clients see two paths only. Staff add Public IP / DDNS.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {connectionMethodsForRole(false).map((opt) => (
                <div
                  key={opt.id}
                  className={`rounded-xl border p-3 text-left text-xs ${
                    opt.featured
                      ? "magic-hub-method is-selected border-primary/70 bg-primary/15"
                      : "border-[color:var(--glass-border)] bg-white/5"
                  }`}
                >
                  {opt.featured ? <MagicHubSparkles /> : null}
                  <div className={`text-sm font-semibold ${opt.featured ? "relative z-[1]" : ""}`}>
                    {opt.title}
                  </div>
                  <p
                    className={`mt-1 leading-snug text-muted-foreground ${
                      opt.featured ? "relative z-[1]" : ""
                    }`}
                  >
                    {opt.body}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-kicker mt-3 text-[10px] uppercase tracking-wide">
              Staff would also see:{" "}
              {connectionMethodsForRole(true)
                .filter((m) => m.staffOnly)
                .map((m) => m.title)
                .join(", ")}
            </p>
          </section>

          <section
            className="glass-panel rounded-[1.75rem] p-5"
            data-testid="dev-hotspot-ux-preview"
          >
            <h3 className="text-title text-sm">Hotspot UX preview (CAP + LAN readiness)</h3>
            <p className="text-sub mt-1 text-xs">
              Static mock of the Cap / guest-ready surfaces — no live router required.
            </p>
            <div className="mt-3 space-y-3">
              <div className="space-y-2 rounded-md border-2 border-amber-400 bg-amber-500/15 p-3 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.25)]">
                <p className="text-xs font-semibold leading-snug text-amber-50">
                  Local AP mode required
                </p>
                <p className="text-[11px] leading-relaxed text-amber-100/90">
                  WinBox shows wifi1/wifi2 waiting on CAPsMAN. Apply will not create a guest SSID
                  until local AP mode is on (checked by default below).
                </p>
                <label className="flex items-start gap-2 text-xs font-semibold text-amber-50">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400"
                    defaultChecked
                    readOnly
                  />
                  Use local AP mode (disable CAP client)
                </label>
              </div>
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                <p className="font-medium">Hotspot foundation ready · external AP unverified</p>
                <p className="mt-1 text-xs text-amber-100/90">
                  Confirm the external AP port, bridge/AP mode, DHCP off, matching SSID, and a real
                  captive-login test before selling vouchers.
                </p>
              </div>
            </div>
          </section>

          <section className="glass-panel rounded-[1.75rem] p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-title text-sm">Voucher revenue today</h3>
                <p className="text-kicker text-xs uppercase tracking-[0.12em]">
                  MMK from hotspot plan sales
                </p>
              </div>
              <Link to="/app/revenue" className="text-xs font-medium text-primary">
                Open revenue
              </Link>
            </div>
            <p className="mt-2 text-3xl font-semibold tracking-tight">MMK 128,400</p>
            <div
              className="mt-4 h-20 rounded-2xl border border-[color:var(--glass-border)] bg-gradient-to-r from-primary/25 via-primary/15 to-transparent"
              aria-hidden
            />
          </section>

          <section className="glass-panel rounded-[1.75rem] p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-title text-sm">Live telemetry</h3>
                <p className="text-kicker text-xs uppercase tracking-[0.12em]">
                  CPU, temperature and live traffic
                </p>
              </div>
              <Link to="/app/routers" className="text-xs font-medium text-primary">
                Open routers
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Board", "hEX"],
                ["CPU load", "12%"],
                ["Active users", "96"],
                ["Aggregate RX", "18.4 Mbps"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] p-3"
                >
                  <div className="text-kicker text-[10px] uppercase tracking-wide">{label}</div>
                  <div className="mt-1 font-mono text-sm text-title">{value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-panel rounded-[1.75rem] p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-title text-sm">Router fleet health</h3>
              <Link to="/app/fleet" className="text-xs text-primary">
                View fleet
              </Link>
            </div>
            <p className="text-sub mt-2 text-sm">3 online · 1 degraded · 0 offline</p>
          </section>

          <div>
            <h3 className="text-title mb-3 text-sm">Quick actions</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {quickActions.map((label) => (
                <div
                  key={label}
                  className="glass-panel interactive-card min-h-[5.5rem] rounded-[1.25rem] p-4 text-center text-title text-xs"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        </main>

        <AppBottomNav
          roles={roles}
          activeMode={mode}
          modes={["business", "operations"]}
          onChooseMode={setMode}
        />
      </div>
    </InAppNoticeProvider>
  );
}
