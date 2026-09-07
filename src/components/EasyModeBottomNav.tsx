import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  CircleDollarSign,
  Gauge,
  Globe2,
  Home,
  LayoutTemplate,
  MoreHorizontal,
  Printer,
  ShieldCheck,
  Settings2,
  Ticket,
  UserCircle,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { useT } from "@/lib/i18n";

type EasyNavItem = readonly [string, string, LucideIcon];

const easyPath = (screen: string) => `/app/easy/${screen}` as never;

export function EasyModeHeader({
  title,
  subtitle,
  back = false,
}: {
  title?: string;
  subtitle?: string;
  back?: boolean;
}) {
  const t = useT();
  return (
    <header className="easy-mode-header relative z-20 border-b border-border px-[max(1rem,calc(env(safe-area-inset-left,0px)+.75rem))] pb-3 pt-[max(.75rem,env(safe-area-inset-top))] pe-[max(1rem,calc(env(safe-area-inset-right,0px)+.75rem))] sm:pb-4 sm:pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {back ? (
              <Link
                to="/app/easy"
                aria-label="Back to Easy Mode home"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background/70 text-primary shadow-sm transition hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ArrowRight className="h-5 w-5 rotate-180" aria-hidden />
              </Link>
            ) : (
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="absolute inset-0 animate-ping rounded-full bg-primary/70" />
                <span className="relative h-3 w-3 rounded-full bg-primary shadow-[0_0_16px_var(--color-primary)]" />
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                {t.ui("MikroTik Magic")}
              </p>
              <p className="truncate text-base font-semibold">{t.ui("Easy dashboard")}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/app"
              title={t.ui("Switch to Advanced Mode")}
              aria-label={t.ui("Switch to Advanced Mode")}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 text-primary transition hover:border-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Gauge className="h-4 w-4" aria-hidden />
              <span className="hidden text-xs font-semibold sm:inline">{t.ui("Advanced")}</span>
            </Link>
            <Link
              to="/app/profile"
              aria-label={t.ui("Open settings")}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/70 text-muted-foreground shadow-sm transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Settings2 className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
        {title && (
          <div className="mt-3 max-w-3xl sm:mt-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-primary">
              {t.ui("Easy Mode")}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-muted-foreground sm:mt-2">{subtitle}</p>}
          </div>
        )}
      </div>
    </header>
  );
}

export function EasyModeBottomNav({ active }: { active: string }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const t = useT();
  const tabs: EasyNavItem[] = [
    ["/app/easy", "Home", Home],
    ["/app/easy/vouchers", "Sell", Ticket],
    [easyPath("guests"), "Guests", UsersRound],
    [easyPath("setup"), "Setup", LayoutTemplate],
  ];

  return (
    <>
      {moreOpen && (
        <EasyMoreMenu
          onClose={() => {
            setMoreOpen(false);
            window.requestAnimationFrame(() => moreButton.current?.focus());
          }}
        />
      )}
      <nav
        aria-label="Easy Mode"
        className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="easy-bottom-nav mx-auto grid max-w-lg grid-cols-5 rounded-[2rem] border px-1 pt-1">
          {tabs.map(([to, label, Icon]) => (
            <Link
              key={to}
              to={to}
              aria-current={label === active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-[1.5rem] text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${label === active ? "bg-primary/15 text-primary shadow-sm" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"}`}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span>{t.ui(label)}</span>
            </Link>
          ))}
          <button
            ref={moreButton}
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-[1.5rem] text-[11px] font-medium text-muted-foreground transition hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-expanded:bg-primary/15 aria-expanded:text-primary"
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden />
            <span>{t.ui("More")}</span>
          </button>
        </div>
      </nav>
    </>
  );
}

function EasyMoreMenu({ onClose }: { onClose: () => void }) {
  const t = useT();
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  const items: Array<readonly [string, string, LucideIcon, string]> = [
    ["/app/revenue", "Revenue", CircleDollarSign, "Track voucher income"],
    [easyPath("voucher-plans"), "Voucher plans", LayoutTemplate, "Time and data plans"],
    [easyPath("print-slips"), "Print slips", Printer, "Choose your print layout"],
    [easyPath("guest-portal"), "Guest portal", Globe2, "Customize the guest welcome page"],
    ["/app/manual", "Help and guides", BookOpen, "Learn how to run your hotspot"],
    ["/app/profile", "Account settings", UserCircle, "Profile and preferences"],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/45 px-3 pb-[max(5.75rem,calc(env(safe-area-inset-bottom)+5.25rem))]"
      role="dialog"
      aria-modal="true"
      aria-label="More Easy Mode options"
      onClick={onClose}
    >
      <section
        className="easy-more-sheet max-h-[min(70dvh,38rem)] w-full max-w-2xl overflow-y-auto rounded-[2rem] border p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-kicker text-[10px] uppercase tracking-[0.2em]">
              {t.ui("Easy Mode")}
            </p>
            <h2 className="mt-1 text-lg font-semibold">{t.ui("More for your business")}</h2>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close More menu"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/70 text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map(([to, label, Icon, detail]) => (
            <Link
              key={to}
              to={to}
              onClick={onClose}
              className="flex items-center gap-3 rounded-2xl border border-border bg-background/60 p-3 transition hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t.ui(label)}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {t.ui(detail)}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Link>
          ))}
        </div>
        <Link
          to="/app"
          onClick={onClose}
          className="mt-3 flex min-h-11 items-center justify-center gap-2 rounded-full border border-primary/40 text-sm font-semibold text-primary"
        >
          <ShieldCheck className="h-4 w-4" aria-hidden />
          {t.ui("Switch to Advanced Mode")}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>
    </div>
  );
}
