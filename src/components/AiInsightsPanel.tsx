import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { getAiInsights } from "@/lib/ai.functions";
import { getOverviewSummary } from "@/lib/overview.functions";
import { useT } from "@/lib/i18n";
import { copyText } from "@/lib/browser/clipboard";

type Insight = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  subtitle: string;
  router: string;
  suggestion: string;
  fix_command?: string;
};

const sevStyle = {
  critical: {
    border: "border-red-500/40",
    glow: "shadow-[0_0_28px_-8px_rgba(239,68,68,0.55)]",
    chip: "bg-red-500/15 text-red-300 border-red-500/40",
    dot: "bg-red-500",
  },
  warning: {
    border: "border-amber-400/40",
    glow: "shadow-[0_0_28px_-8px_rgba(251,191,36,0.5)]",
    chip: "bg-amber-400/15 text-amber-300 border-amber-400/40",
    dot: "bg-amber-400",
  },
  info: {
    border: "border-sky-400/40",
    glow: "shadow-[0_0_28px_-8px_rgba(56,189,248,0.45)]",
    chip: "bg-sky-400/15 text-sky-300 border-sky-400/40",
    dot: "bg-sky-400",
  },
} as const;

export function AiInsightsPanel() {
  const t = useT();
  const runInsights = useServerFn(getAiInsights);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Only run the background check while the panel is actually on screen.
  const hostRef = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: "120px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Skip the auto-check entirely when nothing is connected yet.
  const fetchSummary = useServerFn(getOverviewSummary);
  const summary = useQuery({
    queryKey: ["overview-summary"],
    queryFn: () => fetchSummary(),
    staleTime: 5 * 60_000,
  });
  const hasDevices = (summary.data?.routers ?? 0) + (summary.data?.unifi ?? 0) > 0;

  // Background anomaly flagging every 15 minutes. No fix commands, no quota.
  const auto = useQuery({
    queryKey: ["ai-insights", "auto"],
    queryFn: () => runInsights({ data: { mode: "flag" as const } }),
    enabled: visible && hasDevices,
    refetchInterval: visible ? 15 * 60 * 1000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 15 * 60 * 1000,
  });

  // Manual scan: consumes one of the 30 monthly runs and returns fix commands.
  const scan = useMutation({ mutationFn: () => runInsights({ data: { mode: "full" as const } }) });

  const data = scan.data ?? auto.data;
  const isManual = Boolean(scan.data);
  const insights: Insight[] = (data?.insights as Insight[]) ?? [];
  const criticalCount = insights.filter((i) => i.severity === "critical").length;
  const quota = scan.data?.quota ?? auto.data?.quota;
  const outOfScans = quota ? !quota.unlimited && (quota.remaining ?? 0) <= 0 : false;
  const busy = scan.isPending || (auto.isFetching && !data);

  const copy = async (id: string, cmd: string) => {
    const ok = await copyText(cmd);
    if (!ok) return;
    setCopiedId(id);
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
  };

  return (
    <section ref={hostRef} className="panel relative overflow-hidden p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-0 h-64 w-64 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, #f472b6, transparent 60%)" }}
      />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-kicker text-xs uppercase tracking-wider">
              AI Security Insights
            </span>
            <span className="text-sub rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide">
              {t.copy("auto-check every 15 min")}
            </span>
            {quota && !quota.unlimited && (
              <span className="text-sub rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                {quota.remaining ?? 0}/{quota.limit} {t.copy("scans left")}
              </span>
            )}
            {criticalCount > 0 && (
              <span className="rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300">
                {criticalCount} critical
              </span>
            )}
          </div>
          <p className="text-sub mt-1 text-sm">
            {t.copy(
              "The app checks your routers every 15 minutes and flags anomalies. Run an AI scan to get the RouterOS command that fixes each one.",
            )}
          </p>
        </div>
        <button
          onClick={() => scan.mutate()}
          disabled={scan.isPending || outOfScans || quota?.expired}
          className="rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/20 disabled:opacity-50"
        >
          {scan.isPending ? "Analyzing…" : isManual ? "Re-scan" : "Run AI scan"}
        </button>
      </div>

      {outOfScans && (
        <div className="mt-3 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">
          {t.copy(
            "You have used all your AI scans for this month. Ask the app owner or developer to approve more — automatic anomaly flagging keeps running.",
          )}
        </div>
      )}

      {scan.error && (
        <div className="mt-3 rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">
          {(scan.error as Error).message}
        </div>
      )}

      {data && insights.length === 0 && !busy && (
        <div className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-950/30 p-3 text-sm text-emerald-200">
          All clear — no issues detected across {data.snapshot.length} router
          {data.snapshot.length === 1 ? "" : "s"}.
        </div>
      )}

      {insights.length > 0 && !isManual && (
        <div className="mt-4 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">
          {t.copy(
            "Anomalies flagged by the automatic check. Run an AI scan to see the fix command for each one.",
          )}
        </div>
      )}

      {insights.length > 0 && (
        <div className="relative mt-4 grid gap-3">
          {insights.map((i) => {
            const s = sevStyle[i.severity] ?? sevStyle.info;
            return (
              <div
                key={i.id}
                className={`rounded-lg border ${s.border} ${s.glow} bg-black/30 p-4 backdrop-blur`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${s.dot}`} />
                      <div className="font-semibold">{i.title}</div>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${s.chip}`}
                      >
                        {i.severity}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      {i.router} · {i.subtitle}
                    </div>
                    <div className="mt-2 text-sm">
                      <span className="text-muted-foreground">fix → </span>
                      {i.suggestion}
                    </div>
                    {i.fix_command && (
                      <pre className="mt-2 overflow-x-auto rounded-md border border-white/10 bg-black/50 p-2 font-mono text-[11px] leading-relaxed text-emerald-200">
                        {i.fix_command}
                      </pre>
                    )}
                  </div>
                  {i.fix_command && (
                    <button
                      onClick={() => copy(i.id, i.fix_command!)}
                      className="shrink-0 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white transition hover:bg-white/10"
                    >
                      {copiedId === i.id ? "Copied ✓" : "Copy fix"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!data && !busy && !scan.error && (
        <p className="mt-4 text-xs text-muted-foreground">
          {t.copy(
            "The automatic check pulls live CPU, memory, active sessions, blocked bindings and hotspot user counts from every router you own and flags anomalies. Run an AI scan for the RouterOS command to fix each one.",
          )}
        </p>
      )}
    </section>
  );
}
