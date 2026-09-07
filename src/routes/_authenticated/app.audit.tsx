import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AiDiagnosis } from "@/components/AiDiagnosis";
import { getMe } from "@/lib/auth.functions";
import { isPrivilegedAccount } from "@/lib/app-role";
import {
  AUDIT_OPS_DEFAULT_LIMIT,
  AUDIT_POLL_MS,
  AUDIT_SAVE_LIMIT,
  listRouterOpsAudit,
  ROUTER_OPS_AUDIT_QUERY_KEY,
  ROUTER_SAVE_AUDIT_QUERY_KEY,
} from "@/lib/audit.functions";
import { labelOpsAction, OPS_OUTCOME_STYLE } from "@/lib/audit-labels";
import { listRouterAudit } from "@/lib/routers.functions";
import { DelayedFallback, SkeletonList } from "@/components/ui/skeleton";
import { RecordPagination } from "@/components/RecordPagination";

export const Route = createFileRoute("/_authenticated/app/audit")({
  head: () => ({
    meta: [
      { title: "Audit log · MikroTik Magic" },
      {
        name: "description",
        content:
          "Router operations and save attempts — connection checks, deploys, hotspot apply, and database errors.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditPage,
});

type AuditTab = "operations" | "saves";

const AUDIT_QUERY_OPTS = {
  refetchInterval: AUDIT_POLL_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
  staleTime: 0,
} as const;

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString();
}

function LastUpdated({
  fetchedAt,
  isFetching,
}: {
  fetchedAt: number | undefined;
  isFetching: boolean;
}) {
  if (!fetchedAt) return null;
  return (
    <p className="text-[11px] text-muted-foreground">
      Last updated {new Date(fetchedAt).toLocaleTimeString()}
      {isFetching
        ? " · refreshing…"
        : ` · auto-refresh every ${AUDIT_POLL_MS / 1000}s while this tab is open`}
    </p>
  );
}

export function AuditPage() {
  const fetchMe = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe(), staleTime: 300_000 });
  const isOwner = isPrivilegedAccount(me.data?.roles, me.data?.isPlatformAdmin);
  const [tab, setTab] = useState<AuditTab>("operations");
  const [opsPage, setOpsPage] = useState(1);
  const [savesPage, setSavesPage] = useState(1);

  const fetchOps = useServerFn(listRouterOpsAudit);
  const fetchSaves = useServerFn(listRouterAudit);

  const ops = useQuery({
    queryKey: [...ROUTER_OPS_AUDIT_QUERY_KEY, opsPage],
    queryFn: () => fetchOps({ data: { page: opsPage } }),
    enabled: isOwner,
    ...AUDIT_QUERY_OPTS,
  });

  const saves = useQuery({
    queryKey: [...ROUTER_SAVE_AUDIT_QUERY_KEY, savesPage],
    queryFn: () => fetchSaves({ data: { page: savesPage } }),
    enabled: isOwner,
    ...AUDIT_QUERY_OPTS,
  });

  const active = tab === "operations" ? ops : saves;

  function refreshAll() {
    void Promise.all([ops.refetch(), saves.refetch()]);
  }

  if (me.isLoading) return null;
  if (!isOwner) return <Navigate to="/app" />;

  return (
    <section className="panel p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Audit log</h1>
          <p className="text-xs text-muted-foreground">
            Connection checks, hotspot apply, portal deploys, TLS exceptions, and router save
            attempts. Secrets are never recorded.
          </p>
          <LastUpdated fetchedAt={active.dataUpdatedAt} isFetching={active.isFetching} />
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={ops.isFetching || saves.isFetching}
          className="min-h-11 w-full shrink-0 rounded-md border border-border px-3 text-xs sm:w-auto sm:min-h-9"
        >
          {ops.isFetching || saves.isFetching ? "Refreshing…" : "Refresh now"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-b border-border/60 pb-3">
        <button
          type="button"
          onClick={() => setTab("operations")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            tab === "operations"
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Operations
          <span className="ml-1 text-[10px] opacity-70">(latest {AUDIT_OPS_DEFAULT_LIMIT})</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("saves")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            tab === "saves"
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Router saves
          <span className="ml-1 text-[10px] opacity-70">(latest {AUDIT_SAVE_LIMIT})</span>
        </button>
      </div>

      {tab === "operations" ? (
        <OperationsAuditList query={ops} page={opsPage} onPageChange={setOpsPage} />
      ) : (
        <SaveAuditList query={saves} page={savesPage} onPageChange={setSavesPage} />
      )}
    </section>
  );
}

type OpsRow = Awaited<ReturnType<typeof listRouterOpsAudit>>["rows"][number];
type SaveRow = Awaited<ReturnType<typeof listRouterAudit>>["rows"][number];

function OperationsAuditList({
  query,
  page,
  onPageChange,
}: {
  query: {
    isLoading: boolean;
    error: Error | null;
    data?: { rows: OpsRow[]; total: number };
  };
  page: number;
  onPageChange: (page: number) => void;
}) {
  if (query.isLoading) {
    return (
      <DelayedFallback
        loading
        label="Loading operations audit"
        fallback={<SkeletonList rows={5} className="mt-4" />}
      />
    );
  }
  if (query.error) {
    return <p className="mt-4 text-sm text-danger">{query.error.message}</p>;
  }
  if (!query.data?.rows.length) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        No operations recorded yet. Run Connect → Test on a router or apply hotspot / portal
        changes.
      </p>
    );
  }

  return (
    <>
      <ul className="mt-4 space-y-3 md:hidden">
        {query.data.rows.map((row) => (
          <li
            key={row.id}
            className="rounded-xl border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">{labelOpsAction(row.action)}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {row.router_name ?? "—"}
                  {row.environment ? ` · ${row.environment}` : ""}
                </div>
              </div>
              <span className={`chip shrink-0 capitalize ${OPS_OUTCOME_STYLE[row.outcome] ?? ""}`}>
                {row.outcome}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span>{formatWhen(row.created_at)}</span>
              {row.duration_ms != null && <span>{row.duration_ms} ms</span>}
              <span className="min-w-0 truncate">
                {row.user_name ?? `${row.user_id.slice(0, 8)}…`}
                {row.user_email ? ` · ${row.user_email}` : ""}
              </span>
            </div>
            {row.detail && <p className="mt-2 break-words text-xs">{row.detail}</p>}
            {row.error_message && (
              <p className="mt-1 break-words text-xs text-danger">{row.error_message}</p>
            )}
          </li>
        ))}
      </ul>

      <div className="table-scroll mt-4 hidden md:block">
        <table className="w-full min-w-[900px] table-fixed text-left text-xs">
          <colgroup>
            <col className="w-[130px]" />
            <col className="w-[140px]" />
            <col className="w-[72px]" />
            <col className="w-[140px]" />
            <col className="w-[140px]" />
            <col />
            <col className="w-[180px]" />
          </colgroup>
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 pr-3 font-medium">When</th>
              <th className="py-2 pr-3 font-medium">Action</th>
              <th className="py-2 pr-3 font-medium">Outcome</th>
              <th className="py-2 pr-3 font-medium">Router</th>
              <th className="py-2 pr-3 font-medium">Account</th>
              <th className="py-2 pr-3 font-medium">Detail</th>
              <th className="py-2 pr-3 font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            {query.data.rows.map((row) => (
              <tr key={row.id} className="border-b border-border/50 align-top">
                <td className="py-2 pr-3 font-mono leading-snug break-words">
                  {formatWhen(row.created_at)}
                </td>
                <td className="py-2 pr-3 break-words">{labelOpsAction(row.action)}</td>
                <td className="py-2 pr-3 capitalize">
                  <span className={`chip ${OPS_OUTCOME_STYLE[row.outcome] ?? ""}`}>
                    {row.outcome}
                  </span>
                </td>
                <td className="py-2 pr-3 break-words">
                  <div>{row.router_name ?? "—"}</div>
                  {row.environment && (
                    <div className="text-[11px] text-muted-foreground">{row.environment}</div>
                  )}
                </td>
                <td className="py-2 pr-3">
                  <div className="break-words font-medium">
                    {row.user_name ?? `${row.user_id.slice(0, 8)}…`}
                  </div>
                  {row.user_email && (
                    <div className="break-all text-[11px] text-muted-foreground">
                      {row.user_email}
                    </div>
                  )}
                </td>
                <td className="py-2 pr-3 break-words">
                  {row.detail ?? "—"}
                  {row.duration_ms != null && (
                    <div className="text-[11px] text-muted-foreground">{row.duration_ms} ms</div>
                  )}
                </td>
                <td className="py-2 pr-3 break-words text-danger">{row.error_message ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RecordPagination page={page} total={query.data.total} onPageChange={onPageChange} />
    </>
  );
}

function SaveAuditList({
  query,
  page,
  onPageChange,
}: {
  query: {
    isLoading: boolean;
    error: Error | null;
    data?: { rows: SaveRow[]; total: number };
  };
  page: number;
  onPageChange: (page: number) => void;
}) {
  if (query.isLoading) {
    return (
      <DelayedFallback
        loading
        label="Loading save audit"
        fallback={<SkeletonList rows={5} className="mt-4" />}
      />
    );
  }
  if (query.error) {
    return <p className="mt-4 text-sm text-danger">{query.error.message}</p>;
  }
  if (!query.data?.rows.length) {
    return <p className="mt-4 text-sm text-muted-foreground">No save attempts recorded yet.</p>;
  }

  return (
    <>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Add, update, delete, test, and reboot attempts. Failures can use AI scan error for a fix
        hint.
      </p>
      <ul className="mt-4 space-y-3 md:hidden">
        {query.data.rows.map((row) => (
          <li
            key={row.id}
            className="rounded-xl border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{row.attempted_name}</div>
                <div className="font-mono break-all text-[11px] text-muted-foreground">
                  {row.attempted_host}
                </div>
              </div>
              <span className={`chip shrink-0 ${row.success ? "text-success" : "text-danger"}`}>
                {row.success ? "OK" : "FAIL"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span>{formatWhen(row.created_at)}</span>
              <span className="capitalize">{row.action}</span>
              <span className="min-w-0 truncate">
                {row.user_name ?? `${row.user_id.slice(0, 8)}…`}
                {row.user_email ? ` · ${row.user_email}` : ""}
              </span>
            </div>
            {row.error_message ? (
              <div className="mt-2 space-y-1 rounded-lg border border-danger/30 bg-danger/5 p-2">
                {row.error_code && (
                  <div className="font-mono break-all text-[11px] text-muted-foreground">
                    {row.error_code}
                  </div>
                )}
                <div className="break-words text-xs text-danger">{row.error_message}</div>
                <AiDiagnosis id={row.id} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="table-scroll mt-4 hidden md:block">
        <table className="w-full min-w-[820px] table-fixed text-left text-xs">
          <colgroup>
            <col className="w-[130px]" />
            <col className="w-[70px]" />
            <col className="w-[70px]" />
            <col className="w-[180px]" />
            <col className="w-[160px]" />
            <col />
          </colgroup>
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 pr-3 font-medium">When</th>
              <th className="py-2 pr-3 font-medium">Action</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Router</th>
              <th className="py-2 pr-3 font-medium">Account</th>
              <th className="py-2 pr-3 font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            {query.data.rows.map((row) => (
              <tr key={row.id} className="border-b border-border/50 align-top">
                <td className="py-2 pr-3 font-mono leading-snug break-words">
                  {formatWhen(row.created_at)}
                </td>
                <td className="py-2 pr-3 break-words">{row.action}</td>
                <td className="py-2 pr-3">
                  <span className={`chip ${row.success ? "text-success" : "text-danger"}`}>
                    {row.success ? "OK" : "FAIL"}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <div className="break-words">{row.attempted_name}</div>
                  <div className="font-mono break-all text-muted-foreground">
                    {row.attempted_host}
                  </div>
                </td>
                <td className="py-2 pr-3">
                  <div className="break-words font-medium">
                    {row.user_name ?? `${row.user_id.slice(0, 8)}…`}
                  </div>
                  {row.user_email && (
                    <div className="break-all text-[11px] text-muted-foreground">
                      {row.user_email}
                    </div>
                  )}
                </td>
                <td className="py-2 pr-3">
                  {row.error_message ? (
                    <div className="space-y-1">
                      {row.error_code && (
                        <div className="font-mono break-all text-muted-foreground">
                          {row.error_code}
                        </div>
                      )}
                      <div className="break-words text-danger">{row.error_message}</div>
                      <AiDiagnosis id={row.id} />
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RecordPagination page={page} total={query.data.total} onPageChange={onPageChange} />
    </>
  );
}
