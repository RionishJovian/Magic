import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { explainRouterAuditError } from "@/lib/routers.functions";
import type { AuditDiagnosis } from "@/lib/audit-diagnosis";

/**
 * Owner-side "AI scan error" button for one failed router attempt.
 *
 * `explain` is injectable so automated tests can drive the button without a
 * live server function.
 */
export function AiDiagnosis({
  id,
  explain,
}: {
  id: string;
  explain?: (id: string) => Promise<AuditDiagnosis>;
}) {
  const serverExplain = useServerFn(explainRouterAuditError);
  const run = explain ?? ((auditId: string) => serverExplain({ data: { id: auditId } }));
  const [open, setOpen] = useState(false);
  const mut = useMutation<AuditDiagnosis>({
    mutationFn: () => run(id),
    onSuccess: () => setOpen(true),
  });

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={() => (mut.data ? setOpen((v) => !v) : mut.mutate())}
        disabled={mut.isPending}
        className="min-h-[28px] rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary disabled:opacity-60"
      >
        {mut.isPending
          ? "Scanning…"
          : mut.data
            ? open
              ? "Hide AI fix"
              : "Show AI fix"
            : "AI scan error"}
      </button>
      {mut.error && (
        <div className="mt-1 text-[11px] text-danger">{(mut.error as Error).message}</div>
      )}
      {open && mut.data && (
        <div
          data-testid="ai-diagnosis"
          className="mt-2 space-y-1.5 rounded-lg border border-[color:var(--glass-border)] bg-white/5 p-2 text-[11px] leading-relaxed"
        >
          <div data-testid="ai-summary" className="break-words font-medium">
            {mut.data.summary}
          </div>
          {mut.data.steps.length > 0 && (
            <ul data-testid="ai-steps" className="list-disc space-y-1 pl-4 text-muted-foreground">
              {mut.data.steps.map((s, i) => (
                <li key={i} className="break-words">
                  {s}
                </li>
              ))}
            </ul>
          )}
          {mut.data.command && (
            <pre
              data-testid="ai-command"
              className="overflow-x-auto rounded-md bg-black/30 p-2 font-mono text-[10px] whitespace-pre-wrap break-all"
            >
              {mut.data.command}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default AiDiagnosis;
