import { Link } from "@tanstack/react-router";
import { DevBadge } from "@/components/DevBadge";
import { VerifiedAgentBadge } from "@/components/VerifiedAgentBadge";
import { useSelectedSite } from "@/hooks/useSelectedSite";
import { useT } from "@/lib/i18n";

type Props = {
  displayName: string;
  showDevBadge?: boolean;
  showAgentBadge?: boolean;
};

export function DashboardGreeting({
  displayName,
  showDevBadge = false,
  showAgentBadge = false,
}: Props) {
  const tr = useT();
  const { site } = useSelectedSite();
  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? tr.copy("Good morning")
      : hour < 18
        ? tr.copy("Good afternoon")
        : tr.copy("Good evening");

  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-kicker text-xs uppercase tracking-[0.16em]">
          {tr.label("Hotspot dashboard")}
        </p>
        <h2 className="text-title mt-1 text-2xl tracking-tight sm:text-3xl">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="min-w-0">
              {greeting}, <span className="gradient-text">{displayName}</span>
            </span>
            {showDevBadge ? <DevBadge /> : null}
            {showAgentBadge ? <VerifiedAgentBadge /> : null}
          </span>
        </h2>
        <p className="text-sub mt-1 text-sm leading-relaxed">
          {tr.copy("RouterBoard remote management · voucher income · live sessions.")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {site ? (
          <span className="text-kicker inline-flex min-h-9 items-center rounded-full border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] px-3 text-[11px] font-medium">
            {tr.copy("Site")}: {site.name}
          </span>
        ) : (
          <span className="text-sub inline-flex min-h-9 items-center rounded-full border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] px-3 text-[11px] font-medium">
            {tr.copy("All sites")}
          </span>
        )}
        <Link
          to="/app/profile"
          className="inline-flex min-h-9 items-center rounded-full border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] px-3 text-[11px] font-medium backdrop-blur transition hover:border-primary hover:text-primary"
        >
          Settings
        </Link>
      </div>
    </div>
  );
}
