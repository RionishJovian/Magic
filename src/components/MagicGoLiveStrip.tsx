import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMagicGoLive } from "@/lib/magic-go-live.functions";
import type { MagicStep, MagicStepStatus } from "@/lib/magic-go-live";
import { useSelectedSite } from "@/hooks/useSelectedSite";

function tone(status: MagicStepStatus): string {
  switch (status) {
    case "done":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-100";
    case "todo":
      return "border-amber-400/40 bg-amber-400/10 text-amber-100";
    case "blocked":
      return "border-border/60 bg-white/5 text-muted-foreground";
    case "unknown":
      return "border-border/60 bg-white/5 text-muted-foreground";
  }
}

function mark(status: MagicStepStatus): string {
  switch (status) {
    case "done":
      return "✓";
    case "todo":
      return "!";
    case "blocked":
      return "·";
    case "unknown":
      return "?";
  }
}

function StepChip({ step }: { step: MagicStep }) {
  return (
    <Link
      to={step.to}
      className={`flex min-w-0 flex-col gap-0.5 rounded-xl border px-3 py-2 transition hover:border-primary/50 ${tone(step.status)}`}
      title={step.detail}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
        <span aria-hidden>{mark(step.status)}</span>
        {step.title}
      </span>
      <span className="truncate text-[10px] opacity-80">{step.detail}</span>
    </Link>
  );
}

/**
 * Home / Sites strip: ordered Magic go-live checks with deep links.
 */
export function MagicGoLiveStrip({
  siteId,
  skipHotspotProbe,
  compact,
}: {
  siteId?: string | null;
  skipHotspotProbe?: boolean;
  compact?: boolean;
} = {}) {
  const { site: selected } = useSelectedSite();
  const effectiveSiteId = siteId !== undefined ? siteId : (selected?.id ?? null);
  const fetch = useServerFn(getMagicGoLive);
  const q = useQuery({
    queryKey: ["magic-go-live", effectiveSiteId ?? "all", skipHotspotProbe ? "noprobe" : "probe"],
    queryFn: () =>
      fetch({
        data: {
          siteId: effectiveSiteId,
          skipHotspotProbe: skipHotspotProbe ?? false,
        },
      }),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  if (q.isLoading) {
    return (
      <section className="panel p-4 text-xs text-muted-foreground" aria-busy>
        Checking Magic go-live…
      </section>
    );
  }
  if (q.isError || !q.data) {
    return null;
  }

  const data = q.data;
  if (data.complete && compact) return null;

  return (
    <section className="panel space-y-3 p-4" aria-label="Magic go-live">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">
            {data.complete ? "Magic go-live · ready" : "Magic go-live"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.complete
              ? "Site → router → hotspot → plans → codes → portal are in place."
              : data.next
                ? `Next: ${data.next.title} — ${data.next.detail}`
                : "Finish these steps so guests can buy access."}
            {data.siteName ? ` · Focus: ${data.siteName}` : ""}
            {data.routerName ? ` / ${data.routerName}` : ""}
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          {data.doneCount}/{data.totalCount} done
        </div>
      </header>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {data.steps.map((s) => (
          <StepChip key={s.id} step={s} />
        ))}
      </div>

      {data.next && (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={data.next.to}
            className="inline-flex min-h-[36px] items-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground"
          >
            {data.next.cta} →
          </Link>
          <span className="text-[11px] text-muted-foreground">{data.next.detail}</span>
        </div>
      )}
    </section>
  );
}
