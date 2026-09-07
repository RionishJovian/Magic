import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getMe } from "@/lib/auth.functions";
import { isPrivilegedAccount } from "@/lib/app-role";
import { MagicCoinIcon } from "@/components/MagicCoinIcon";
import {
  agentCreateUser,
  listMyReferrals,
  listAgentPoints,
  agentCommissionReport,
} from "@/lib/agents.functions";

export const Route = createFileRoute("/_authenticated/app/agent")({
  head: () => ({
    meta: [
      { title: "Magic Coins — Agent dashboard" },
      {
        name: "description",
        content: "Agent commission dashboard: referred accounts and Magic Coin earnings.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentPage,
});

function StatusPill({ role }: { role: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: {
      label: "Pending approval",
      cls: "border-sky-400/50 bg-sky-400/10 text-sky-300 shadow-[0_0_16px_-4px_#38bdf8]",
    },
    client: {
      label: "Active",
      cls: "border-emerald-400/50 bg-emerald-400/10 text-emerald-300 shadow-[0_0_16px_-4px_#34d399]",
    },
    expired: { label: "Expired", cls: "border-amber-400/40 bg-amber-400/10 text-amber-300" },
  };
  const s = map[role] ?? { label: role, cls: "border-border text-muted-foreground" };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${s.cls}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}

function AgentPage() {
  const fetchMe = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const roles = me.data?.roles ?? [];
  const isAgent = roles.includes("agent");
  const isStaff = isPrivilegedAccount(roles, me.data?.isPlatformAdmin);

  const points = useServerFn(listAgentPoints);
  const refsFn = useServerFn(listMyReferrals);
  const createFn = useServerFn(agentCreateUser);
  const qc = useQueryClient();

  const pointsQ = useQuery({
    queryKey: ["agent-points"],
    queryFn: () => points(),
    enabled: isAgent || isStaff,
  });
  const refsQ = useQuery({
    queryKey: ["agent-referrals"],
    queryFn: () => refsFn(),
    enabled: isAgent,
  });
  const reportFn = useServerFn(agentCommissionReport);
  const reportQ = useQuery({
    queryKey: ["agent-commission-report"],
    queryFn: () => reportFn(),
    enabled: isAgent,
  });

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          username: username.trim(),
          display_name: displayName.trim() || undefined,
          password,
        },
      }),
    onSuccess: () => {
      setUsername("");
      setDisplayName("");
      setPassword("");
      setErr(null);
      qc.invalidateQueries({ queryKey: ["agent-referrals"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  if (me.isLoading) {
    return <div className="panel p-10 text-center text-muted-foreground">Loading…</div>;
  }
  if (!isAgent && !isStaff) {
    return (
      <div className="panel mx-auto max-w-xl p-8 text-center">
        <h1 className="text-xl font-semibold">Magic Coins are for agents</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only agent accounts and the app owner can open this dashboard.
        </p>
      </div>
    );
  }

  const d = pointsQ.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <MagicCoinIcon className="h-8 w-8 shrink-0" />
          <h1 className="text-2xl font-semibold tracking-tight">Magic Coins</h1>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Magic Coins come only from paid Tier Pass orders placed by clients you registered:{" "}
          <span className="font-semibold">Emerald Monthly = 15 coins</span>,{" "}
          <span className="font-semibold">Sapphire Annual = 150 coins</span>.
        </p>
        <ul className="mt-2 max-w-3xl space-y-1 text-xs text-muted-foreground">
          <li>· Coins are awarded only after an admin approves the paid order.</li>
          <li>· Pending, rejected and cancelled orders award 0 coins.</li>
          <li>· Registering an account and voucher activity award 0 coins.</li>
          <li>· A refund creates one matching reversal that removes the awarded coins.</li>
          <li>· Each paid renewal earns again once, for its own billing period.</li>
          <li>· You only ever see your own clients, orders and coins.</li>
        </ul>
      </div>

      {err && (
        <div className="rounded-md border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
          {err}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Total Magic Coins", value: d?.total_points ?? 0, currency: true },
          { label: "This month", value: d?.month_points ?? 0, currency: true },
          { label: "Plan purchases", value: d?.purchase_count ?? 0, currency: false },
        ].map((c) => (
          <div key={c.label} className="panel p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</div>
            <div className="mt-1 flex items-center gap-1.5 text-2xl font-semibold text-primary">
              {c.currency ? <MagicCoinIcon className="h-6 w-6" /> : null}
              {c.value}
            </div>
          </div>
        ))}
      </div>

      {isAgent && (
        <section className="panel p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Register a new account
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setErr(null);
              createMut.mutate();
            }}
            className="mt-4 grid gap-3 sm:grid-cols-4"
          >
            <input
              className="input"
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <input
              className="input"
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <input
              className="input"
              placeholder="Password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="submit"
              disabled={createMut.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 disabled:opacity-50"
            >
              {createMut.isPending ? "Creating…" : "Create account"}
            </button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Registering here locks the referral to you at the moment the account is created — only
            accounts registered this way can generate Magic Coins for you. New accounts activate
            instantly and stay active for 7 days, then turn Expired (read-only) until renewed.
          </p>
        </section>
      )}

      {isAgent && (
        <section className="panel overflow-hidden">
          <div className="border-b border-border p-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            My accounts ({refsQ.data?.length ?? 0})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Renews / expires</th>
                </tr>
              </thead>
              <tbody>
                {refsQ.data?.map((r) => (
                  <tr key={r.user_id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3">
                      <StatusPill role={r.role} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {r.expires_at ? new Date(r.expires_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
                {refsQ.data?.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      No accounts yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isAgent && (
        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
            <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              My last 3 months
            </span>
            <span className="text-xs text-muted-foreground">
              Commission total: {(reportQ.data?.total_points ?? 0).toFixed(2)} points
            </span>
          </div>

          {reportQ.isLoading && (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading report…</div>
          )}
          {reportQ.isError && (
            <div className="p-6 text-center text-sm text-danger">
              Couldn’t load your commission report.{" "}
              <button className="underline" onClick={() => reportQ.refetch()}>
                Retry
              </button>
            </div>
          )}

          {reportQ.data && (
            <div className="grid gap-4 p-4 lg:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Clients ({reportQ.data.clients.length})
                </h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {reportQ.data.clients.map((c) => (
                    <li key={c.user_id} className="flex justify-between gap-2">
                      <span>{c.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(c.since).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                  {reportQ.data.clients.length === 0 && (
                    <li className="text-sm text-muted-foreground">
                      No registered clients yet — use Register a new account above.
                    </li>
                  )}
                </ul>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tier Pass orders ({reportQ.data.orders.length})
                </h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {reportQ.data.orders.map((o) => {
                    const row = o as unknown as {
                      id: string;
                      client_name: string;
                      service_label: string | null;
                      service_key: string;
                      status: string;
                      created_at: string;
                    };
                    return (
                      <li key={row.id} className="flex flex-wrap justify-between gap-2">
                        <span>
                          {row.client_name} · {row.service_label ?? row.service_key}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {row.status} · {new Date(row.created_at).toLocaleDateString()}
                        </span>
                      </li>
                    );
                  })}
                  {reportQ.data.orders.length === 0 && (
                    <li className="text-sm text-muted-foreground">
                      No Tier Pass orders from your clients in the last 3 months.
                    </li>
                  )}
                </ul>
              </div>

              <div className="lg:col-span-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Points by month
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {reportQ.data.by_month.map((m) => (
                    <span
                      key={m.month}
                      className="rounded-full border border-border px-3 py-1 text-xs"
                    >
                      {m.month}: {m.points.toFixed(2)}
                    </span>
                  ))}
                  {reportQ.data.by_month.length === 0 && (
                    <span className="text-sm text-muted-foreground">
                      No points recorded in the last 3 months.
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {isStaff && (d?.by_agent?.length ?? 0) > 0 && (
        <section className="panel overflow-hidden">
          <div className="border-b border-border p-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Magic Coins by agent
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Agent</th>
                  <th className="px-4 py-3">Events</th>
                  <th className="px-4 py-3 text-right">Magic Coins</th>
                </tr>
              </thead>
              <tbody>
                {d?.by_agent.map((a) => (
                  <tr key={a.agent_id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{a.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{a.events}</td>
                    <td className="px-4 py-3 text-right font-semibold text-primary">{a.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel overflow-hidden">
        <div className="border-b border-border p-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Point history
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {isStaff && <th className="px-4 py-3">Agent</th>}
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Points</th>
              </tr>
            </thead>
            <tbody>
              {d?.events.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  {isStaff && <td className="px-4 py-3">{e.agent_name}</td>}
                  <td className="px-4 py-3">{e.referred_name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    Approved Tier Pass order
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-primary">
                    {e.points >= 0 ? "+" : ""}
                    {Number(e.points).toFixed(2)}
                  </td>
                </tr>
              ))}
              {(d?.events.length ?? 0) === 0 && (
                <tr>
                  <td
                    colSpan={isStaff ? 5 : 4}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No Magic Coins earned yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
