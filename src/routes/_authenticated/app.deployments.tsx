import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { listDeployments } from "@/lib/deployments.functions";
import { DelayedFallback, SkeletonList } from "@/components/ui/skeleton";
import { RecordPagination } from "@/components/RecordPagination";
import { PAGE_SIZE } from "@/components/record-pagination.helpers";

export const Route = createFileRoute("/_authenticated/app/deployments")({
  head: () => ({
    meta: [
      { title: "Deployment history — MikroTik Magic" },
      {
        name: "description",
        content:
          "Every configuration push with who ran it, whether it was a rehearsal or a real apply, the change summary, the backup taken and the verification result.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DeploymentsPage,
});

type Row = {
  id: string;
  intent: string;
  mode: "sandbox" | "dry_run" | "apply";
  plan_hash: string;
  diff_summary: { steps?: number; byAction?: Record<string, number> };
  backup_ref: string | null;
  verification: { verified?: boolean; missingTags?: string[] };
  status: "planned" | "applied" | "verified" | "failed" | "rolled_back";
  failure_reason: string | null;
  rolled_back_at: string | null;
  created_at: string;
  actor_name: string;
};

const STATUS_TONE: Record<Row["status"], string> = {
  planned: "border-border text-muted-foreground",
  applied: "border-sky-500/40 text-sky-300",
  verified: "border-emerald-500/40 text-emerald-300",
  failed: "border-red-500/40 text-red-300",
  rolled_back: "border-amber-500/40 text-amber-300",
};

function DeploymentsPage() {
  const t = useT();
  const fetchRows = useServerFn(listDeployments);
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["deployments"],
    queryFn: () => fetchRows({ data: { limit: 5000 } }),
  });
  const rows = (q.data ?? []) as unknown as Row[];
  const safePage = Math.min(page, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">{t.label("Deployment history")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {t.copy(
            "Every configuration push, rehearsal or real, kept so you can see exactly what changed, who changed it and whether it was verified.",
          )}
        </p>
      </header>

      {q.isLoading && (
        <DelayedFallback loading label="Loading history" fallback={<SkeletonList rows={4} />} />
      )}
      {q.isError && (
        <p className="text-sm text-red-300">
          {t.copy("We could not load the deployment history. Try again in a moment.")}
        </p>
      )}
      {!q.isLoading && rows.length === 0 && (
        <p className="panel p-5 text-sm text-muted-foreground">
          {t.copy("No deployments recorded yet. Rehearsals appear here too.")}
        </p>
      )}

      <div className="grid gap-3">
        {pageRows.map((r) => (
          <article key={r.id} className="panel p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[11px] ${STATUS_TONE[r.status]}`}
              >
                {r.status.replace("_", " ")}
              </span>
              <span className="rounded-full border border-[color:var(--glass-border)] px-2.5 py-0.5 text-[11px]">
                {r.mode === "apply" ? t.label("Real device") : t.label("Rehearsal")}
              </span>
              <h2 className="break-words text-sm font-semibold">{r.intent}</h2>
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              <Item label="Who" value={r.actor_name} />
              <Item label="When" value={new Date(r.created_at).toLocaleString()} />
              <Item
                label="Changes"
                value={
                  r.diff_summary?.byAction
                    ? Object.entries(r.diff_summary.byAction)
                        .map(([k, v]) => `${v} ${k}`)
                        .join(", ")
                    : `${r.diff_summary?.steps ?? 0} steps`
                }
              />
              <Item label="Plan fingerprint" value={r.plan_hash} />
              <Item label="Backup" value={r.backup_ref ?? "Not taken"} />
              <Item
                label="Verified"
                value={
                  r.verification?.verified
                    ? "Yes"
                    : r.verification?.missingTags?.length
                      ? `No — ${r.verification.missingTags.length} rule(s) missing`
                      : "No"
                }
              />
              {r.failure_reason && <Item label="Failure" value={r.failure_reason} />}
              {r.rolled_back_at && (
                <Item label="Rolled back" value={new Date(r.rolled_back_at).toLocaleString()} />
              )}
            </dl>
          </article>
        ))}
      </div>
      <RecordPagination page={safePage} total={rows.length} onPageChange={setPage} />
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  const t = useT();
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-2">
      <dt className="text-muted-foreground">{t.label(label)}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}
