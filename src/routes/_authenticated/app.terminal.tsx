import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getMe } from "@/lib/auth.functions";
import { isPrivilegedAccount } from "@/lib/app-role";
import { listTerminalRouters, runTerminalCommand } from "@/lib/fleet.functions";
import {
  listTerminalTemplates,
  createTerminalTemplate,
  updateTerminalTemplate,
  deleteTerminalTemplate,
} from "@/lib/terminal-templates.functions";
import { listTerminalHistory, deleteTerminalHistory } from "@/lib/terminal-history.functions";
import { TelegramCta } from "@/components/TelegramCta";
import { toErrorMessage } from "@/lib/error-message";
import { RecordPagination } from "@/components/RecordPagination";
import { PAGE_SIZE } from "@/components/record-pagination.helpers";

export const Route = createFileRoute("/_authenticated/app/terminal")({
  head: () => ({
    meta: [
      { title: "Terminal · Hotspot Admin" },
      { name: "description", content: "REST command runner with reusable MikroTik templates." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TerminalPage,
});

type LogEntry = {
  id: number;
  when: string;
  router: string;
  method: string;
  path: string;
  status: number;
  ms: number;
  body: string;
};

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

type Template = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  method: Method;
  path: string;
  body: string | null;
  is_builtin: boolean;
  updated_at: string;
};

const EMPTY_FORM = {
  id: null as string | null,
  name: "",
  description: "",
  category: "general",
  method: "GET" as Method,
  path: "/",
  body: "",
};

function TerminalPage() {
  const qc = useQueryClient();
  const fetchMe = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });

  const fetchRouters = useServerFn(listTerminalRouters);
  const routers = useQuery({ queryKey: ["terminal-routers"], queryFn: () => fetchRouters() });

  const fetchTemplates = useServerFn(listTerminalTemplates);
  const templates = useQuery({
    queryKey: ["terminal-templates"],
    queryFn: () => fetchTemplates() as Promise<Template[]>,
  });

  const runCmd = useServerFn(runTerminalCommand);
  const createTpl = useServerFn(createTerminalTemplate);
  const updateTpl = useServerFn(updateTerminalTemplate);
  const deleteTpl = useServerFn(deleteTerminalTemplate);
  const fetchHistory = useServerFn(listTerminalHistory);
  const removeHistory = useServerFn(deleteTerminalHistory);

  const [routerId, setRouterId] = useState<string>("");
  const [method, setMethod] = useState<Method>("GET");
  const [path, setPath] = useState("/system/resource");
  const [body, setBody] = useState("");
  const [supportReason, setSupportReason] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [historyPage, setHistoryPage] = useState(1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const run = useMutation({
    mutationFn: (payload: {
      routerId: string;
      method: Method;
      path: string;
      body?: string;
      supportReason?: string;
    }) => runCmd({ data: payload }),
    onSuccess: (res, vars) => {
      const routerName =
        routers.data?.routers.find((r) => r.id === vars.routerId)?.name ?? vars.routerId;
      setLog((l) =>
        [
          {
            id: Date.now(),
            when: new Date().toLocaleTimeString(),
            router: routerName,
            method: vars.method,
            path: vars.path,
            status: res.status,
            ms: res.ms,
            body: res.body,
          },
          ...l,
        ].slice(0, 40),
      );
      if (res.status === 0) {
        toast.error(toErrorMessage(res.body.slice(0, 240) || "Router unreachable"));
      } else if (res.status < 200 || res.status >= 300) {
        toast.error(toErrorMessage(`HTTP ${res.status} — check path and credentials`));
      }
    },
    onError: (err) => {
      toast.error(toErrorMessage(err, "Terminal request failed"));
    },
  });

  const saveTpl = useMutation({
    mutationFn: async (f: typeof form) => {
      const payload = {
        name: f.name.trim(),
        description: f.description || null,
        category: f.category || "general",
        method: f.method,
        path: f.path,
        body: f.body || null,
      };
      if (f.id) await updateTpl({ data: { id: f.id, ...payload } });
      else await createTpl({ data: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["terminal-templates"] });
      setEditorOpen(false);
      setForm(EMPTY_FORM);
    },
  });

  const removeTpl = useMutation({
    mutationFn: (id: string) => deleteTpl({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["terminal-templates"] }),
  });

  const history = useQuery({
    queryKey: ["terminal-history", routerId || null],
    queryFn: () =>
      fetchHistory({ data: { router_id: routerId || null, limit: 5000 } }) as Promise<
        Array<{
          id: string;
          router_id: string;
          method: Method;
          path: string;
          body: string | null;
          status: number;
          ms: number;
          response_snippet: string | null;
          created_at: string;
        }>
      >,
  });
  const historyRows = history.data ?? [];
  const safeHistoryPage = Math.min(
    historyPage,
    Math.max(1, Math.ceil(historyRows.length / PAGE_SIZE)),
  );
  const pageHistory = historyRows.slice(
    (safeHistoryPage - 1) * PAGE_SIZE,
    safeHistoryPage * PAGE_SIZE,
  );

  const clearHistory = useMutation({
    mutationFn: () => removeHistory({ data: { all: true } }),
    onSuccess: () => {
      toast.success("History cleared");
      qc.invalidateQueries({ queryKey: ["terminal-history"] });
    },
  });

  const removeOne = useMutation({
    mutationFn: (id: string) => removeHistory({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["terminal-history"] }),
  });

  const selectedRouter = (routers.data?.routers ?? []).find((r) => r.id === routerId);
  const crossTenant = Boolean(
    routers.data?.isPlatformAdmin &&
    selectedRouter &&
    selectedRouter.ownerId !== routers.data.viewerTenantId,
  );
  const crossTenantWriteBlocked =
    crossTenant && method !== "GET" && supportReason.trim().length < 5;

  const categories = useMemo(() => {
    const set = new Set<string>(["all"]);
    (templates.data ?? []).forEach((t) => set.add(t.category));
    return Array.from(set);
  }, [templates.data]);

  const visible = useMemo(
    () => (templates.data ?? []).filter((t) => filter === "all" || t.category === filter),
    [templates.data, filter],
  );

  if (me.isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const canUseTerminal = isPrivilegedAccount(me.data?.roles, me.data?.isPlatformAdmin);
  if (!canUseTerminal)
    return (
      <div className="glass-card p-6 text-sm">
        <h1 className="text-lg font-semibold">Terminal is restricted</h1>
        <p className="mt-2 text-muted-foreground">
          The REST terminal is available to Developers only. If you need a command run on your
          router, message us on Telegram.
        </p>
        <TelegramCta label="Contact us on Telegram" variant="app" className="mt-4" />
      </div>
    );

  const submit = () => {
    if (!routerId) return;
    run.mutate({
      routerId,
      method,
      path,
      body: body || undefined,
      supportReason: supportReason || undefined,
    });
  };

  const loadTemplate = (t: Template) => {
    setMethod(t.method);
    setPath(t.path);
    setBody(t.body ?? "");
  };

  const editTemplate = (t: Template) => {
    setForm({
      id: t.id,
      name: t.name,
      description: t.description ?? "",
      category: t.category,
      method: t.method,
      path: t.path,
      body: t.body ?? "",
    });
    setEditorOpen(true);
  };

  const newFromCurrent = () => {
    setForm({ ...EMPTY_FORM, method, path, body });
    setEditorOpen(true);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Terminal</h1>
          <p className="text-sm text-muted-foreground">
            Run RouterOS REST paths (not Winbox CLI). Example: GET{" "}
            <code className="break-all font-mono text-xs">/system/resource</code>. Uses the same
            Magic Hub / Local Connector path as Routers → Test.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setForm(EMPTY_FORM);
            setEditorOpen(true);
          }}
          className="min-h-11 w-full shrink-0 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface/70 sm:w-auto sm:min-h-9"
        >
          + New template
        </button>
      </header>

      <section className="panel space-y-3 overflow-hidden p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,2fr)] lg:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,2fr)_auto]">
          <select
            value={routerId}
            onChange={(e) => setRouterId(e.target.value)}
            aria-label="Select router"
            className="min-h-11 min-w-0 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm sm:min-h-9"
          >
            <option value="">Select router…</option>
            {(routers.data?.routers ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.ownerLabel}
                {r.connectionMode ? ` · ${r.connectionMode}` : ""}
              </option>
            ))}
          </select>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as Method)}
            aria-label="HTTP method"
            className="min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm min-[480px]:w-auto sm:min-h-9"
          >
            {["GET", "POST", "PATCH", "PUT", "DELETE"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/system/resource"
            aria-label="REST path"
            className="min-h-11 min-w-0 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm sm:min-h-9 min-[480px]:col-span-2 sm:col-span-1"
          />
          <div className="grid grid-cols-2 gap-2 min-[480px]:col-span-2 sm:col-span-3 lg:col-span-1 lg:flex lg:flex-wrap">
            <button
              type="button"
              onClick={newFromCurrent}
              className="min-h-11 rounded-md border border-border bg-surface px-3 py-2 text-sm hover:bg-surface/70 sm:min-h-9"
              title="Save current command as a template"
            >
              Save
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={run.isPending || !routerId || crossTenantWriteBlocked}
              className="min-h-11 rounded-md border border-primary bg-primary/90 px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary disabled:opacity-60 sm:min-h-9 col-span-2 lg:col-span-1"
            >
              {run.isPending ? "Running…" : "Send"}
            </button>
          </div>
        </div>
        {method !== "GET" && (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder='{"key":"value"}'
            rows={3}
            className="w-full max-w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs"
          />
        )}
        {crossTenant && (
          <div className="rounded-md border border-violet-400/30 bg-violet-500/5 p-2 text-xs text-violet-100">
            Developer support mode · {selectedRouter?.ownerLabel} · terminal responses are redacted
            and audited.
            {method !== "GET" && (
              <label className="mt-2 block text-violet-100/85">
                Support reason required for a write
                <input
                  value={supportReason}
                  onChange={(event) => setSupportReason(event.target.value)}
                  maxLength={300}
                  placeholder="Example: approved support change after tenant report"
                  className="mt-1 w-full rounded-md border border-violet-300/40 bg-surface px-2 py-1.5 text-xs text-foreground"
                />
              </label>
            )}
          </div>
        )}
      </section>

      <section className="panel overflow-hidden p-3 sm:p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <h2 className="shrink-0 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Templates
          </h2>
          <div
            role="tablist"
            aria-label="Template categories"
            className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible"
          >
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={filter === c}
                onClick={() => setFilter(c)}
                className={`min-h-11 shrink-0 snap-start rounded-full border px-3 text-xs capitalize sm:min-h-8 ${
                  filter === c
                    ? "border-primary bg-primary/20 text-primary-foreground"
                    : "border-border bg-surface text-muted-foreground hover:text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        {templates.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading templates…</div>
        ) : visible.length === 0 ? (
          <div className="text-sm text-muted-foreground">No templates in this category yet.</div>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((t) => (
              <li
                key={t.id}
                className="group flex min-w-0 flex-col gap-1 rounded-md border border-border bg-surface/60 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{t.name}</div>
                    <div className="mt-0.5 break-all font-mono text-[11px] text-muted-foreground">
                      {t.method} {t.path}
                    </div>
                  </div>
                  {t.is_builtin && (
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      Built-in
                    </span>
                  )}
                </div>
                {t.description && (
                  <p className="text-xs text-muted-foreground break-words">{t.description}</p>
                )}
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:flex sm:flex-wrap">
                  <button
                    type="button"
                    onClick={() => loadTemplate(t)}
                    className="min-h-11 rounded-md border border-primary/60 bg-primary/10 px-2 py-1 text-primary-foreground hover:bg-primary/20 sm:min-h-0"
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      loadTemplate(t);
                      if (routerId)
                        run.mutate({
                          routerId,
                          method: t.method,
                          path: t.path,
                          body: t.body ?? undefined,
                          supportReason: supportReason || undefined,
                        });
                    }}
                    disabled={
                      !routerId ||
                      (crossTenant && t.method !== "GET" && supportReason.trim().length < 5)
                    }
                    className="min-h-11 rounded-md border border-border bg-surface px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-50 sm:min-h-0"
                  >
                    Load & run
                  </button>
                  <button
                    type="button"
                    onClick={() => editTemplate(t)}
                    className="min-h-11 rounded-md border border-border bg-surface px-2 py-1 text-muted-foreground hover:text-foreground sm:min-h-0"
                  >
                    Edit
                  </button>
                  {!t.is_builtin && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete template "${t.name}"?`)) removeTpl.mutate(t.id);
                      }}
                      className="min-h-11 rounded-md border border-destructive/60 bg-destructive/10 px-2 py-1 text-destructive hover:bg-destructive/20 sm:min-h-0"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-black/60 p-3 font-mono text-xs text-emerald-200/90">
        {log.length === 0 ? (
          <div className="text-emerald-300/50">$ awaiting command…</div>
        ) : (
          <div className="space-y-4">
            {log.map((e) => (
              <div key={e.id} className="min-w-0">
                <div className="break-words text-emerald-300">
                  [{e.when}] {e.router} · {e.method} {e.path} → {e.status} in {e.ms}ms
                </div>
                <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap break-all text-emerald-100/90">
                  {e.body || "(empty)"}
                </pre>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel overflow-hidden p-3 sm:p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="min-w-0 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Session history {routerId ? "· this router" : "· all routers"}
          </h2>
          <button
            type="button"
            onClick={() => {
              if (confirm("Clear your saved terminal history?")) clearHistory.mutate();
            }}
            disabled={clearHistory.isPending || historyRows.length === 0}
            className="min-h-11 w-full rounded-md border border-border bg-surface px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 sm:w-auto sm:min-h-0"
          >
            Clear all
          </button>
        </div>
        {history.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading history…</div>
        ) : historyRows.length === 0 ? (
          <div className="text-sm text-muted-foreground">No commands run yet.</div>
        ) : (
          <ul className="divide-y divide-border/40">
            {pageHistory.map((h) => {
              const routerName =
                routers.data?.routers.find((r) => r.id === h.router_id)?.name ??
                h.router_id.slice(0, 8);
              return (
                <li
                  key={h.id}
                  className="flex flex-col gap-2 py-3 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="break-words font-mono sm:truncate">
                      <span className="text-muted-foreground">
                        {new Date(h.created_at).toLocaleString()} · {routerName} ·
                      </span>{" "}
                      <span className="text-foreground">
                        {h.method} {h.path}
                      </span>{" "}
                      <span
                        className={
                          h.status >= 200 && h.status < 300 ? "text-emerald-400" : "text-red-400"
                        }
                      >
                        → {h.status} ({h.ms}ms)
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 sm:flex sm:shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setRouterId(h.router_id);
                        setMethod(h.method);
                        setPath(h.path);
                        setBody(h.body ?? "");
                      }}
                      className="min-h-11 rounded border border-border bg-surface px-2 text-muted-foreground hover:text-foreground sm:min-h-0 sm:py-0.5"
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        run.mutate({
                          routerId: h.router_id,
                          method: h.method,
                          path: h.path,
                          body: h.body ?? undefined,
                        })
                      }
                      className="min-h-11 rounded border border-primary/60 bg-primary/10 px-2 text-primary-foreground hover:bg-primary/20 sm:min-h-0 sm:py-0.5"
                    >
                      Re-run
                    </button>
                    <button
                      type="button"
                      onClick={() => removeOne.mutate(h.id)}
                      className="min-h-11 rounded border border-destructive/60 bg-destructive/10 px-2 text-destructive hover:bg-destructive/20 sm:min-h-0 sm:py-0.5"
                      aria-label="Delete history entry"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <RecordPagination
          page={safeHistoryPage}
          total={historyRows.length}
          onPageChange={setHistoryPage}
        />
      </section>

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <div className="max-h-[min(92dvh,100%)] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-2xl border border-border bg-background p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-lg sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="min-w-0 truncate text-lg font-semibold">
                {form.id ? "Edit template" : "New template"}
              </h3>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center text-sm text-muted-foreground hover:text-foreground"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="grid gap-2">
              <label className="text-xs text-muted-foreground">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm sm:min-h-0"
              />
              <label className="text-xs text-muted-foreground">Description</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm sm:min-h-0"
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="min-w-0">
                  <label className="text-xs text-muted-foreground">Category</label>
                  <input
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="mt-0.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm sm:min-h-0"
                  />
                </div>
                <div className="min-w-0">
                  <label className="text-xs text-muted-foreground">Method</label>
                  <select
                    value={form.method}
                    onChange={(e) => setForm({ ...form, method: e.target.value as Method })}
                    className="mt-0.5 min-h-11 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm sm:min-h-0"
                  >
                    {["GET", "POST", "PATCH", "PUT", "DELETE"].map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="text-xs text-muted-foreground">Path</label>
              <input
                value={form.path}
                onChange={(e) => setForm({ ...form, path: e.target.value })}
                className="min-h-11 w-full min-w-0 rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm sm:min-h-0"
              />
              <label className="text-xs text-muted-foreground">Body (JSON, optional)</label>
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={3}
                className="w-full max-w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs"
              />
            </div>
            {saveTpl.error && (
              <div className="break-words text-xs text-destructive">
                {(saveTpl.error as Error).message}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:justify-end">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="min-h-11 rounded-md border border-border bg-surface px-3 py-2 text-sm sm:min-h-0"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => saveTpl.mutate(form)}
                disabled={saveTpl.isPending || !form.name.trim() || !form.path.startsWith("/")}
                className="min-h-11 rounded-md border border-primary bg-primary/90 px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60 sm:min-h-0"
              >
                {saveTpl.isPending ? "Saving…" : "Save template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
