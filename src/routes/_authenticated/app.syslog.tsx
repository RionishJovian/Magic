import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { toErrorMessage } from "@/lib/error-message";
import { getMe } from "@/lib/auth.functions";
import { meHasFeature } from "@/lib/operator-features";
import { useSelectedSite } from "@/hooks/useSelectedSite";
import { connectorInstallOrigin } from "@/lib/connector-install-origin";
import { buildSyslogShipperScript, syslogIngestUrl } from "@/lib/syslog-ingest";
import { fmtDateTime } from "@/lib/time";
import { listRouters } from "@/lib/routers.functions";
import { listSites } from "@/lib/sites.functions";
import { pairedLogKindLabel } from "@/lib/syslog-paired";
import {
  createSyslogToken,
  deleteSyslogEvent,
  deleteSyslogToken,
  listPairedLogSources,
  listSyslogEvents,
  listSyslogTokens,
  syncPairedRouterLogs,
  translateSyslogEvents,
} from "@/lib/syslog.functions";
import { copyText } from "@/lib/browser/clipboard";
import { RecordPagination } from "@/components/RecordPagination";
import { PAGE_SIZE } from "@/components/record-pagination.helpers";

export const Route = createFileRoute("/_authenticated/app/syslog")({
  head: () => ({
    meta: [
      { title: "Syslog & AI translation — MikroTik Magic" },
      {
        name: "description",
        content:
          "Ingest RouterOS logs over HTTPS, view events, and translate cryptic lines into plain English with Lovable AI.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SyslogPage,
});

const SEVERITY_STYLE: Record<string, string> = {
  critical: "text-red-300 border-red-400/40 bg-red-500/10",
  warning: "text-amber-300 border-amber-400/40 bg-amber-500/10",
  info: "text-sky-300 border-sky-400/40 bg-sky-500/10",
};

type FreshToken = {
  id: string;
  token: string;
  label: string | null;
  token_prefix: string | null;
};

function ingestOrigin(): string {
  return connectorInstallOrigin();
}

function SyslogPage() {
  const qc = useQueryClient();
  const { site } = useSelectedSite();
  const [severity, setSeverity] = useState<"all" | "critical" | "warning" | "info">("all");
  const [eventsPage, setEventsPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newLabel, setNewLabel] = useState("");
  const [bindSiteId, setBindSiteId] = useState<string>("");
  const [bindRouterId, setBindRouterId] = useState<string>("");
  const [fresh, setFresh] = useState<FreshToken | null>(null);

  const fetchMe = useServerFn(getMe);
  const meQ = useQuery({ queryKey: ["me"], queryFn: () => fetchMe(), staleTime: 5 * 60_000 });
  const canSyslog = meHasFeature(meQ.data, "syslog_ai");
  const canTranslate = canSyslog;

  const fetchEvents = useServerFn(listSyslogEvents);
  const eventsQ = useQuery({
    queryKey: ["syslog-events", site?.id ?? null, severity],
    queryFn: () => fetchEvents({ data: { siteId: site?.id ?? null, severity, limit: 5000 } }),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  const fetchTokens = useServerFn(listSyslogTokens);
  const tokensQ = useQuery({
    queryKey: ["syslog-tokens"],
    queryFn: () => fetchTokens(),
    enabled: canSyslog,
  });

  const fetchPaired = useServerFn(listPairedLogSources);
  const pairedQ = useQuery({
    queryKey: ["syslog-paired-sources"],
    queryFn: () => fetchPaired(),
    staleTime: 30_000,
  });

  const syncPaired = useServerFn(syncPairedRouterLogs);
  const syncQ = useQuery({
    queryKey: ["syslog-paired-sync", site?.id ?? null],
    queryFn: async () => {
      const result = await syncPaired({ data: { siteId: site?.id ?? null } });
      void qc.invalidateQueries({ queryKey: ["syslog-events"] });
      return result;
    },
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  const fetchRouters = useServerFn(listRouters);
  const routersQ = useQuery({
    queryKey: ["routers"],
    queryFn: () => fetchRouters(),
    enabled: canSyslog,
    staleTime: 60_000,
  });
  const fetchSites = useServerFn(listSites);
  const sitesQ = useQuery({
    queryKey: ["sites"],
    queryFn: () => fetchSites(),
    enabled: canSyslog,
    staleTime: 60_000,
  });

  const createToken = useServerFn(createSyslogToken);
  const createTokenMut = useMutation({
    mutationFn: () =>
      createToken({
        data: {
          label: newLabel.trim() || undefined,
          siteId: bindSiteId || site?.id || null,
          routerId: bindRouterId || null,
        },
      }),
    onSuccess: (row) => {
      setFresh({
        id: row.id,
        token: row.token,
        label: row.label,
        token_prefix: row.token_prefix,
      });
      setNewLabel("");
      toast.success("Token created — copy it now. It will not be shown again.");
      qc.invalidateQueries({ queryKey: ["syslog-tokens"] });
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  const deleteToken = useServerFn(deleteSyslogToken);
  const deleteTokenMut = useMutation({
    mutationFn: (id: string) => deleteToken({ data: { id } }),
    onSuccess: () => {
      toast.success("Token revoked");
      qc.invalidateQueries({ queryKey: ["syslog-tokens"] });
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  const translate = useServerFn(translateSyslogEvents);
  const translateMut = useMutation({
    mutationFn: (ids: string[]) => translate({ data: { ids } }),
    onSuccess: (r) => {
      toast.success(`Translated ${r.updated} events`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["syslog-events"] });
    },
    onError: (e) => toast.error(toErrorMessage(e)),
  });

  const deleteEvent = useServerFn(deleteSyslogEvent);
  const deleteEventMut = useMutation({
    mutationFn: (id: string) => deleteEvent({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["syslog-events"] }),
  });

  const events = useMemo(() => eventsQ.data ?? [], [eventsQ.data]);
  const safeEventsPage = Math.min(eventsPage, Math.max(1, Math.ceil(events.length / PAGE_SIZE)));
  const pageEvents = events.slice((safeEventsPage - 1) * PAGE_SIZE, safeEventsPage * PAGE_SIZE);
  const counts = useMemo(() => {
    const c = { total: events.length, critical: 0, warning: 0, info: 0 };
    for (const e of events) {
      if (e.severity === "critical") c.critical++;
      else if (e.severity === "warning") c.warning++;
      else c.info++;
    }
    return c;
  }, [events]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const origin = ingestOrigin();
  const ingestBase = syslogIngestUrl(origin);
  const freshUrl = fresh ? syslogIngestUrl(origin, fresh.token) : "";
  const shipper = freshUrl ? buildSyslogShipperScript(freshUrl) : "";
  const routers = routersQ.data ?? [];
  const sites = sitesQ.data ?? [];
  const siteName = (id: string | null) => sites.find((s) => s.id === id)?.name ?? null;
  const routerName = (id: string | null) =>
    pairedQ.data?.find((r) => r.id === id)?.name ?? routers.find((r) => r.id === id)?.name ?? null;
  const pairedSources = useMemo(() => {
    const rows = pairedQ.data ?? [];
    if (!site?.id) return rows;
    return rows.filter((r) => r.site_id === site.id);
  }, [pairedQ.data, site?.id]);
  const syncById = new Map((syncQ.data?.sources ?? []).map((s) => [s.id, s]));
  const syncFailed = (syncQ.data?.sources ?? []).some((s) => Boolean(s.error));

  const runPairedSync = async () => {
    const result = await syncQ.refetch();
    if (result.error) {
      toast.error(toErrorMessage(result.error, "Log sync failed"));
      return;
    }
    const failed = (result.data?.sources ?? []).filter((s) => s.error);
    if (failed.length) {
      const first = failed[0]!;
      toast.error(`Could not store logs from ${first.name}`, {
        description: first.error ?? undefined,
      });
      return;
    }
    const n = result.data?.ingested ?? 0;
    toast.success(n ? `Synced ${n} new log line${n === 1 ? "" : "s"}` : "Logs are up to date");
  };

  return (
    <div className="relative space-y-6">
      <div
        aria-hidden
        className="orb pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full opacity-40"
        style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 60%)" }}
      />
      <header className="animate-rise space-y-2">
        <span className="eyebrow">Syslog · AI translation</span>
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="gradient-text">Live router log stream</span>
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Magic Hub already paired this board — live /log is pulled over that tunnel. Mint an HTTPS
          token only for routers that are not paired yet. Then translate selected events into plain
          English.
        </p>
      </header>

      <section className="animate-rise grid gap-4 md:grid-cols-4">
        {[
          { label: "Total", value: counts.total, hint: `Filter: ${severity}`, accent: "" },
          {
            label: "Critical",
            value: counts.critical,
            tone: "text-red-300",
            accent: "shadow-[0_0_28px_-8px_rgba(239,68,68,0.55)]",
          },
          {
            label: "Warning",
            value: counts.warning,
            tone: "text-amber-300",
            accent: "shadow-[0_0_28px_-8px_rgba(251,191,36,0.55)]",
          },
          {
            label: "Info",
            value: counts.info,
            tone: "text-sky-300",
            accent: "shadow-[0_0_28px_-8px_rgba(56,189,248,0.55)]",
          },
        ].map((c) => (
          <div key={c.label} className={`feature-card ${c.accent ?? ""}`}>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              {c.label}
            </div>
            <div className={`mt-2 stat-num ${c.tone ?? ""}`}>{c.value}</div>
            {c.hint && <div className="mt-1 text-[11px] text-muted-foreground">{c.hint}</div>}
          </div>
        ))}
      </section>

      <section className="panel animate-rise p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="stream-dot" />
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Paired devices</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Magic Hub uses the hub key and the RouterOS WireGuard key already on the board.
              Critical, warning, and error lines are pulled first over that tunnel — no ingest token
              to mint.
            </p>
          </div>
          <button
            onClick={() => void runPairedSync()}
            disabled={syncQ.isFetching || pairedSources.length === 0}
            className="cta-ghost text-[11px] disabled:opacity-50"
          >
            {syncQ.isFetching ? "Syncing…" : "Sync now"}
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {pairedSources.map((r) => {
            const sync = syncById.get(r.id);
            return (
              <div
                key={r.id}
                className="airai-row flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {pairedLogKindLabel(r.kind)}
                    {r.status ? ` · ${r.status}` : ""}
                    {sync && sync.pulled > 0 ? ` · ${sync.pulled} on board` : ""}
                    {sync?.ingested ? ` · ${sync.ingested} new` : ""}
                    {sync && sync.pulled === 0 && !sync.error ? " · no /log lines yet" : ""}
                  </div>
                  {sync?.error ? (
                    <div className="mt-1 text-[11px] text-red-300" role="alert">
                      Sync failed: {sync.error}
                    </div>
                  ) : null}
                </div>
                <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-primary">
                  no token
                </span>
              </div>
            );
          })}
          {!pairedQ.isLoading && pairedSources.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No Magic Hub pairing on this site yet. Add the board with Magic Hub — logs use that
              pairing automatically.
            </p>
          )}
        </div>
      </section>

      {canSyslog && (
        <section className="panel animate-rise p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="stream-dot" />
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Ingest tokens</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Only for boards that are not Magic Hub paired. Secret is hashed at rest and shown
                once. POST to{" "}
                <code className="rounded bg-black/40 px-1 font-mono">
                  {ingestBase}/&lt;token&gt;
                </code>
                . Bind to a site so events stay visible when that site is selected.
              </p>
            </div>
            <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Label (e.g. main-router)"
                className="input w-full min-w-0 text-xs sm:max-w-[180px]"
                aria-label="Token label"
              />
              <select
                value={bindSiteId}
                onChange={(e) => setBindSiteId(e.target.value)}
                className="input w-full min-w-0 text-xs sm:max-w-[160px]"
                aria-label="Bind to site"
              >
                <option value="">{site ? `Site: ${site.name}` : "All sites"}</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                value={bindRouterId}
                onChange={(e) => setBindRouterId(e.target.value)}
                className="input w-full min-w-0 text-xs sm:max-w-[160px]"
                aria-label="Bind to router"
              >
                <option value="">Any router</option>
                {routers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => createTokenMut.mutate()}
                disabled={createTokenMut.isPending}
                className="cta-glow text-xs disabled:opacity-60"
              >
                {createTokenMut.isPending ? "Creating…" : "New token"}
              </button>
            </div>
          </div>

          {fresh && (
            <div className="mt-4 space-y-3 rounded-lg border border-amber-400/40 bg-amber-500/10 p-4">
              <div className="text-xs font-semibold text-amber-200">
                Copy now — this secret will not be shown again. If you leave, revoke and mint a new
                token.
              </div>
              <div className="font-mono text-[11px] break-all text-foreground">{fresh.token}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    void copyText(freshUrl).then((ok) => {
                      if (ok) toast.success("Webhook URL copied");
                      else toast.error("Copy failed");
                    });
                  }}
                  className="cta-ghost text-[11px]"
                >
                  Copy URL
                </button>
                <button
                  onClick={() => {
                    void copyText(shipper).then((ok) => {
                      if (ok) toast.success("RouterOS shipper copied");
                      else toast.error("Copy failed");
                    });
                  }}
                  className="cta-ghost text-[11px]"
                >
                  Copy HTTPS shipper
                </button>
                <button onClick={() => setFresh(null)} className="cta-ghost text-[11px]">
                  I have copied it
                </button>
              </div>
              <details>
                <summary className="cursor-pointer text-xs font-medium text-primary">
                  Show RouterOS HTTPS shipper
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-lg border border-[color:var(--glass-border)] bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-emerald-200">
                  {shipper}
                </pre>
              </details>
            </div>
          )}

          <div className="mt-4 space-y-2">
            {(tokensQ.data ?? []).map((t) => (
              <div
                key={t.id}
                className="airai-row flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{t.label ?? "(no label)"}</div>
                  <div className="truncate font-mono text-[11px] text-muted-foreground">
                    {t.token_prefix ?? "mmsys_"}…
                    {t.site_id ? ` · ${siteName(t.site_id) ?? "site"}` : ""}
                    {t.router_id ? ` · ${routerName(t.router_id) ?? "router"}` : ""}
                    {t.last_used_at
                      ? ` · last post ${fmtDateTime(t.last_used_at)}`
                      : " · never used"}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Revoke ${t.label ?? t.token_prefix ?? "this token"}? The router must be given a new token.`,
                      )
                    )
                      return;
                    deleteTokenMut.mutate(t.id);
                    if (fresh?.id === t.id) setFresh(null);
                  }}
                  className="rounded-full border border-red-400/40 bg-red-500/5 px-3 py-1 text-[11px] text-red-300 transition hover:bg-red-500/15"
                  aria-label={`Revoke token ${t.label ?? ""}`}
                >
                  Revoke
                </button>
              </div>
            ))}
            {!tokensQ.isLoading && (tokensQ.data ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">No tokens yet — create one above.</p>
            )}
          </div>
        </section>
      )}

      <section className="panel animate-rise p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="stream-dot" aria-hidden />
            <span className="uppercase tracking-[0.22em] text-muted-foreground">
              Streaming · auto-refresh 15s
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {(["all", "critical", "warning", "info"] as const).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSeverity(s);
                  setEventsPage(1);
                }}
                aria-pressed={severity === s}
                className={`rounded-full border px-3 py-1 transition ${
                  severity === s
                    ? "border-primary/60 bg-primary/15 text-primary shadow-[0_0_18px_-4px_var(--color-primary)]"
                    : "border-[color:var(--glass-border)] text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
            <button onClick={() => eventsQ.refetch()} className="cta-ghost text-[11px]">
              Refresh
            </button>
            {canTranslate && (
              <button
                onClick={() => translateMut.mutate(Array.from(selected))}
                disabled={!selected.size || translateMut.isPending}
                className="cta-glow text-[11px] disabled:opacity-50"
              >
                {translateMut.isPending
                  ? "Translating…"
                  : `Translate ${selected.size || 0} selected`}
              </button>
            )}
          </div>
        </div>

        <div className="table-scroll mt-4">
          <table className="w-full min-w-[1100px] table-fixed text-left text-xs">
            <colgroup>
              {canTranslate && <col className="w-9" />}
              <col className="w-40" />
              <col className="w-24" />
              <col className="w-32" />
              <col />
              <col className="w-28" />
              <col className="w-20" />
            </colgroup>
            <thead className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <tr>
                {canTranslate && <th className="w-6 py-2" />}
                <th className="whitespace-nowrap py-2 pr-3">Time</th>
                <th className="whitespace-nowrap py-2 pr-3">Severity</th>
                <th className="whitespace-nowrap py-2 pr-3">Program</th>
                <th className="py-2 pr-3">Message / AI summary</th>
                <th className="whitespace-nowrap py-2 pr-3">Source</th>
                <th className="w-16 py-2" />
              </tr>
            </thead>
            <tbody>
              {pageEvents.map((e) => (
                <tr
                  key={e.id}
                  className="animate-rise border-t border-[color:var(--glass-border)] align-top transition hover:bg-white/5"
                >
                  {canTranslate && (
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(e.id)}
                        onChange={() => toggle(e.id)}
                        aria-label={`Select event ${e.id}`}
                      />
                    </td>
                  )}
                  <td className="whitespace-nowrap py-2 text-muted-foreground">
                    {fmtDateTime(e.received_at)}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
                        SEVERITY_STYLE[e.severity] ?? SEVERITY_STYLE.info
                      }`}
                    >
                      {e.severity}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3">{e.program ?? "—"}</td>
                  <td className="py-2 pr-3">
                    <div className="break-words font-mono text-[11px]">{e.message}</div>
                    {e.ai_summary && (
                      <div className="mt-1 rounded-lg border border-primary/30 bg-primary/10 p-2 text-[11px] text-primary/90 shadow-[0_0_18px_-8px_var(--color-primary)]">
                        <span className="mr-1 font-semibold uppercase tracking-[0.14em]">AI:</span>
                        {e.ai_summary}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 font-mono text-[11px] text-muted-foreground">
                    {e.source_ip ?? "—"}
                  </td>
                  <td className="whitespace-nowrap py-2 text-right">
                    {canTranslate && (
                      <button
                        onClick={() => deleteEventMut.mutate(e.id)}
                        className="rounded-full border border-[color:var(--glass-border)] px-2 py-0.5 text-[10px] text-muted-foreground transition hover:border-red-400/50 hover:text-red-300"
                        aria-label="Delete event"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!eventsQ.isLoading && events.length === 0 && (
                <tr>
                  <td
                    colSpan={canTranslate ? 7 : 6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    {pairedSources.length > 0
                      ? syncFailed
                        ? "Last Magic Hub pull could not be stored. The error is listed under the device above."
                        : (syncQ.data?.sources ?? []).some((s) => s.pulled === 0)
                          ? "Board memory log is empty. Sync now after a warning, or check /system logging action=memory."
                          : "Waiting for the next Magic Hub log pull. Press Sync now, or wait 15s."
                      : site
                        ? `No events for ${site.name}. Pair the board with Magic Hub, or bind an ingest token to this site.`
                        : "No events yet. Pair the board with Magic Hub, or mint a token for an unpaired router."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <RecordPagination
          page={safeEventsPage}
          total={events.length}
          onPageChange={setEventsPage}
        />
      </section>
    </div>
  );
}
