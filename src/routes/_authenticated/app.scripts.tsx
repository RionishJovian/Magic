import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CATEGORIES, SCRIPTS, type ScriptCategory } from "@/data/scripts";
import { ScriptCard } from "@/components/ScriptCard";
import { ScriptRouterOperationsPanel } from "@/components/ScriptRouterOperationsPanel";
import { getMe } from "@/lib/auth.functions";
import { isPrivilegedAccount } from "@/lib/app-role";

export const Route = createFileRoute("/_authenticated/app/scripts")({
  head: () => ({
    meta: [{ title: "Scripts — MikroTik Hotspot Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: ScriptsPage,
});

function ScriptsPage() {
  const fetchMe = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const isPrivileged = isPrivilegedAccount(me.data?.roles, me.data?.isPlatformAdmin);

  const [query, setQuery] = useState("");
  const [active, setActive] = useState<ScriptCategory | "All">("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SCRIPTS.filter((s) => {
      if (active !== "All" && s.category !== active) return false;
      if (!q) return true;
      return (
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)) ||
        s.code.toLowerCase().includes(q)
      );
    });
  }, [query, active]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { All: SCRIPTS.length };
    for (const c of CATEGORIES) m[c] = SCRIPTS.filter((s) => s.category === c).length;
    return m;
  }, []);

  if (me.isLoading) {
    return <div className="panel p-10 text-center text-muted-foreground">Loading…</div>;
  }
  if (!isPrivileged) {
    return (
      <div className="panel mx-auto max-w-xl p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10 text-amber-300">
          <svg
            viewBox="0 0 24 24"
            className="h-7 w-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold">Scripts library is restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The RouterOS scripts library is restricted to Primary and Developer accounts. Client
          accounts cannot view, copy, or run these operations.
        </p>
        <Link
          to="/app"
          className="mt-6 inline-block rounded-md border border-border px-4 py-2 text-xs font-medium hover:border-primary hover:text-primary"
        >
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">RouterOS scripts library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Copy-ready snippets for Magic Hub (Starlink hub prep), Syslog AI (HTTPS shipper),
          firewall, VLAN, PPPoE, WireGuard, IPsec, QoS, backup and monitoring.
        </p>
      </div>

      <ScriptRouterOperationsPanel />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search scripts, tags, RouterOS commands…"
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 pl-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            aria-label="Search MikroTik scripts"
          />
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3-3" />
          </svg>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <kbd className="rounded border border-border bg-surface px-1.5 py-0.5">
            {filtered.length}
          </kbd>
          <span>of {SCRIPTS.length} scripts</span>
        </div>
      </div>

      <div className="-mx-1 flex flex-wrap gap-1.5">
        {(["All", ...CATEGORIES] as const).map((c) => {
          const isActive = active === c;
          return (
            <button
              key={c}
              onClick={() => setActive(c)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                isActive
                  ? "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                  : "border-border bg-surface text-muted-foreground hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {c}
              <span className="ml-1.5 opacity-60">{counts[c] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="panel p-10 text-center text-muted-foreground">
          No scripts match <span className="text-foreground">"{query}"</span>.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {filtered.map((s) => (
            <ScriptCard key={s.id} script={s} />
          ))}
        </div>
      )}
    </div>
  );
}
