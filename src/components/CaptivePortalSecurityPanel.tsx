import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCaptivePortalSecurityHealth } from "@/lib/captive-portal-security.functions";

const tone: Record<string, string> = {
  PROTECTED: "text-emerald-300",
  MITIGATED: "text-sky-300",
  WARNING: "text-amber-300",
  UNVERIFIED: "text-muted-foreground",
  FAILED: "text-red-300",
};

export function CaptivePortalSecurityPanel({ routerId }: { routerId: string }) {
  const fetchHealth = useServerFn(getCaptivePortalSecurityHealth);
  const health = useQuery({
    queryKey: ["captive-portal-security", routerId],
    queryFn: () => fetchHealth({ data: { routerId } }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  if (health.isLoading)
    return (
      <div className="mt-3 rounded-lg border border-border/50 p-3 text-xs text-muted-foreground">
        Checking captive-portal security…
      </div>
    );
  if (health.isError)
    return (
      <div className="mt-3 rounded-lg border border-danger/40 bg-danger/5 p-3 text-xs text-danger">
        Security check unavailable:{" "}
        {health.error instanceof Error ? health.error.message : "unknown error"}
      </div>
    );
  if (!health.data) return null;
  const report = health.data.health;
  const plan = health.data.preAuthGuard;
  return (
    <section
      className="mt-3 rounded-lg border border-border/50 bg-black/10 p-3"
      aria-label="Captive portal security health"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Captive Portal Security Health</h3>
          <p className="text-[11px] text-muted-foreground">
            Read-only RouterOS evidence · checked {new Date(report.checkedAt).toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">CAPTIVE PORTAL SECURITY SCORE</div>
          <div className="text-xl font-semibold">{report.score}/100</div>
          <div className="text-[11px] text-muted-foreground">{report.scoreLabel}</div>
        </div>
      </div>
      <details className="mt-3 rounded-md border border-border/40 px-2.5 py-2" open>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs">
          <span className="font-semibold">PRE-AUTH GUARD</span>
          <span className={plan.status === "READY FOR REVIEW" ? "text-amber-300" : "text-red-300"}>
            {plan.status}
          </span>
        </summary>
        <div className="mt-2 space-y-2 text-[11px] text-muted-foreground">
          <p>{plan.reason}</p>
          <div className="grid gap-1 md:grid-cols-2">
            {Object.entries(plan.topology).map(([key, value]) => (
              <div key={key}>
                <b>{key}:</b> {value}
              </div>
            ))}
          </div>
          {plan.risks.length > 0 && (
            <div>
              <b>Detected risks</b>
              <ul className="list-disc pl-4">
                {plan.risks.map((risk) => (
                  <li key={risk.key}>
                    {risk.title}: {risk.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <b>Proposed rules (non-runnable)</b>
            {plan.rules.length === 0 ? (
              <p>No rules generated because required evidence is ambiguous.</p>
            ) : (
              <ol className="list-decimal space-y-1 pl-4">
                {plan.rules.map((rule) => (
                  <li key={rule.marker}>
                    {rule.chain} · {rule.action} · {rule.protocol}/{rule.ports} · {rule.marker}
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div>
            <b>Rollback:</b> {plan.rollback.join(" · ") || "No plan generated."}
          </div>
        </div>
      </details>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {report.controls.map((item) => (
          <details key={item.key} className="rounded-md border border-border/40 px-2.5 py-2">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs">
              <span>{item.label}</span>
              <span className={`font-semibold ${tone[item.status] ?? ""}`}>{item.status}</span>
            </summary>
            <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
              <div>
                <b>Severity:</b> {item.severity}
              </div>
              <div>
                <b>Evidence:</b> {item.evidence.join(" · ") || "none"}
              </div>
              <div>
                <b>Expected:</b> {item.expected}
              </div>
              <div>
                <b>Actual:</b> {item.actual}
              </div>
              <div>
                <b>Reason:</b> {item.reason}
              </div>
              <div>
                <b>Remediation:</b> {item.remediation}
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
