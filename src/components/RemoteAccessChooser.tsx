import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MagicHubSparkles } from "@/components/MagicHubSparkle";
import { useT } from "@/lib/i18n";
import { getMe } from "@/lib/auth.functions";
import { connectionMethodsForRole, isStaffRoles } from "@/lib/connection-methods";

/**
 * Nav picker for remote-access paths (Home, Connectors, Quick Setup).
 * Not shown on /app/routers — that page already has the Connection method
 * fieldset on the save form; two pickers on one page caused 2-vs-3 lies.
 */
export function RemoteAccessChooser({
  compact = false,
}: {
  /** Tighter heading for embedding under Home empty state / page intros. */
  compact?: boolean;
}) {
  const tr = useT();
  const fetchMe = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe(), staleTime: 5 * 60_000 });
  const privileged = isStaffRoles(me.data?.roles, me.data?.isPlatformAdmin);
  const paths = connectionMethodsForRole(privileged);
  return (
    <section aria-labelledby="remote-access-heading" className="panel p-5">
      <div className="min-w-0">
        <h2
          id="remote-access-heading"
          className={`text-title truncate ${compact ? "text-base" : "text-lg"}`}
        >
          {tr.label("How will you reach the router?")}
        </h2>
        <p className="text-sub mt-1 text-xs">
          {tr.copy(
            "Pick one path. All of them unlock Live, vouchers, portal deploy and telemetry.",
          )}
        </p>
      </div>
      <ul className={`mt-4 grid gap-3 ${privileged ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {paths.map((p) => (
          <li key={p.id}>
            <Link
              to={p.to}
              search={p.search as never}
              className={`group relative flex h-full flex-col gap-2 rounded-xl border p-4 transition ${
                p.featured
                  ? "magic-hub-method is-selected overflow-visible border-primary/70 bg-primary/15 hover:border-primary/80"
                  : "overflow-hidden border-[color:var(--glass-border)] bg-white/5 hover:border-primary/50 hover:shadow-[var(--glow-primary)]"
              }`}
            >
              {p.featured ? <MagicHubSparkles /> : null}
              <span
                className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-40 blur-2xl"
                style={{ background: p.tint }}
                aria-hidden
              />
              <span className="text-kicker relative z-[1] text-[10px] uppercase tracking-wide">
                {p.badge}
              </span>
              <span className="text-title relative z-[1] text-sm group-hover:text-primary">
                {tr.label(p.title)}
              </span>
              <span className="text-sub relative z-[1] text-xs">{tr.copy(p.body)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
