import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { TenantsConsole } from "@/components/TenantsConsole";
import { getMe } from "@/lib/auth.functions";
import {
  listAppUsers,
  createAppUser,
  setAppUserRole,
  resetAppUserPassword,
  deleteAppUser,
  activateAppUser,
  setAppUserExpires,
  approvePendingUser,
  rejectPendingUser,
} from "@/lib/users.functions";
import { OperatorFeatureGrantsAdmin } from "@/components/OperatorFeatureGrantsAdmin";
import { VerifiedAgentBadge } from "@/components/VerifiedAgentBadge";
import { toErrorMessage } from "@/lib/error-message";
import { isValidPassword, PASSWORD_POLICY_MESSAGE } from "@/lib/password-policy";
import {
  USERS_PAGE_CAPABILITIES,
  usersPageCanAssignPrimaryRole,
  usersPageCanCreatePrimary,
  usersPageCanManageAccount,
  usersPageCoerceView,
  usersPageHeadline,
  usersPageSubtitle,
  usersPageViews,
} from "@/lib/users-page-capabilities";

type AccountRole = "primary" | "client" | "expired" | "agent" | "pending";

function StatusPill({ role }: { role: AccountRole }) {
  if (role === "agent") {
    return <VerifiedAgentBadge />;
  }
  const map: Record<Exclude<AccountRole, "agent">, { label: string; cls: string }> = {
    pending: {
      label: "Pending",
      cls: "border-sky-400/50 bg-sky-400/10 text-sky-300 shadow-[0_0_16px_-4px_#38bdf8]",
    },
    client: {
      label: "User",
      cls: "border-emerald-400/50 bg-emerald-400/10 text-emerald-300 shadow-[0_0_16px_-4px_#34d399]",
    },
    primary: { label: "Primary", cls: "border-primary/50 bg-primary/10 text-primary" },
    expired: { label: "Expired", cls: "border-amber-400/40 bg-amber-400/10 text-amber-300" },
  };
  const s = map[role];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${s.cls}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** End of selected local calendar day as ISO (stable for expiry comparisons). */
function endOfLocalDayIso(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function ExpiresCell({
  expiresAt,
  editable,
  pending,
  onSave,
}: {
  expiresAt: string | null;
  editable: boolean;
  pending: boolean;
  onSave: (expiresAtIso: string) => void;
}) {
  const [value, setValue] = useState(toDateInputValue(expiresAt));
  const dirty = value !== toDateInputValue(expiresAt);

  if (!editable) {
    return <span className="text-xs text-muted-foreground">Never</span>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          aria-label="Account expiry date"
          className="input w-[9.5rem] py-1"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {dirty && value && (
          <button
            type="button"
            disabled={pending}
            onClick={() => onSave(endOfLocalDayIso(value))}
            className="rounded-md border border-primary/50 bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {[
          { label: "+7d", days: 7 },
          { label: "+30d", days: 30 },
          { label: "+1y", days: 365 },
        ].map((p) => (
          <button
            key={p.label}
            type="button"
            disabled={pending}
            onClick={() => {
              const iso = addDaysIso(p.days);
              setValue(toDateInputValue(iso));
              onSave(iso);
            }}
            className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/app/users")({
  validateSearch: (raw: Record<string, unknown>) => ({
    view: raw.view === "tenants" ? ("tenants" as const) : ("accounts" as const),
  }),
  head: () => ({
    meta: [{ title: "User management — Hotspot Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: UsersPage,
});

function UsersCapabilitiesPanel({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const items = isPlatformAdmin
    ? [...USERS_PAGE_CAPABILITIES.primary, ...USERS_PAGE_CAPABILITIES.developer]
    : USERS_PAGE_CAPABILITIES.primary;
  return (
    <section className="panel p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        What you can do here
      </h2>
      <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
        {items.map((line) => (
          <li key={line} className="flex gap-2">
            <span className="text-primary">•</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function UsersPage() {
  const { view: rawView } = Route.useSearch();
  const navigate = useNavigate();
  const fetchMe = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const isPrimary = me.data?.roles?.includes("primary") ?? false;
  const isPlatformAdmin = me.data?.isPlatformAdmin ?? false;
  const canManage = isPrimary || isPlatformAdmin;
  const actor = { isPrimary, isPlatformAdmin };
  const view = usersPageCoerceView(actor, rawView);
  const pageViews = usersPageViews(actor);

  useEffect(() => {
    if (rawView !== view) {
      navigate({ to: "/app/users", search: { view }, replace: true });
    }
  }, [rawView, view, navigate]);

  const list = useServerFn(listAppUsers);
  const create = useServerFn(createAppUser);
  const setRole = useServerFn(setAppUserRole);
  const resetPw = useServerFn(resetAppUserPassword);
  const del = useServerFn(deleteAppUser);
  const activate = useServerFn(activateAppUser);
  const setExpires = useServerFn(setAppUserExpires);
  const approve = useServerFn(approvePendingUser);
  const reject = useServerFn(rejectPendingUser);

  const qc = useQueryClient();

  const users = useQuery({
    queryKey: ["app-users"],
    queryFn: () => list(),
    enabled: canManage,
  });

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole2] = useState<"primary" | "client" | "agent">("client");
  const [err, setErr] = useState<string | null>(null);

  const primaryAccounts = (users.data ?? []).filter((u) => u.roles.includes("primary"));
  const canCreatePrimary = usersPageCanCreatePrimary(actor, primaryAccounts.length);
  const accountNameById = new Map(
    (users.data ?? []).map((u) => [
      u.id,
      u.username ?? u.display_name ?? u.email ?? u.id.slice(0, 8),
    ]),
  );

  /** Direct parent/creator is shown separately from referral attribution. */
  const ownershipLabel = (u: { id: string; owner_id: string | null; roles: string[] }) => {
    if (u.roles.includes("primary")) return "Self (Primary)";
    if (!u.owner_id || u.owner_id === u.id) return "Self";
    return accountNameById.get(u.owner_id) ?? u.owner_id.slice(0, 8);
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ["app-users"] });

  const createMut = useMutation({
    mutationFn: () =>
      create({
        data: {
          username: username.trim(),
          display_name: displayName.trim() || undefined,
          password,
          role,
        },
      }),
    onSuccess: () => {
      setUsername("");
      setDisplayName("");
      setPassword("");
      setRole2("client");
      setErr(null);
      invalidate();
    },
    onError: (e: unknown) =>
      setErr(toErrorMessage(e, "Could not create the account. Please retry.")),
  });

  const roleMut = useMutation({
    mutationFn: (v: { user_id: string; role: AccountRole }) => setRole({ data: v }),
    onSuccess: invalidate,
    onError: (e: unknown) => setErr(toErrorMessage(e)),
  });

  const approveMut = useMutation({
    mutationFn: (user_id: string) => approve({ data: { user_id } }),
    onSuccess: invalidate,
    onError: (e: unknown) => setErr(toErrorMessage(e)),
  });

  const rejectMut = useMutation({
    mutationFn: (user_id: string) => reject({ data: { user_id } }),
    onSuccess: invalidate,
    onError: (e: unknown) => setErr(toErrorMessage(e)),
  });

  const pwMut = useMutation({
    mutationFn: (v: { user_id: string; password: string }) => resetPw({ data: v }),
    onError: (e: unknown) => setErr(toErrorMessage(e)),
  });

  const delMut = useMutation({
    mutationFn: (user_id: string) => del({ data: { user_id } }),
    onSuccess: invalidate,
    onError: (e: unknown) => setErr(toErrorMessage(e)),
  });

  const activateMut = useMutation({
    mutationFn: (user_id: string) => activate({ data: { user_id } }),
    onSuccess: invalidate,
    onError: (e: unknown) => setErr(toErrorMessage(e)),
  });

  const expiresMut = useMutation({
    mutationFn: (v: { user_id: string; expires_at: string }) => setExpires({ data: v }),
    onSuccess: invalidate,
    onError: (e: unknown) => setErr(toErrorMessage(e)),
  });

  if (me.isLoading) {
    return <div className="panel p-10 text-center text-muted-foreground">Loading…</div>;
  }
  if (!canManage) {
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
        <h1 className="text-xl font-semibold">User management is restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only a Primary tenant or a Developer can create accounts, change roles, or remove users.
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
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {usersPageHeadline(actor, view)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{usersPageSubtitle(actor, view)}</p>
        </div>
        {pageViews.length > 1 ? (
          <div className="flex shrink-0 rounded-full border border-[color:var(--glass-border)] p-1 text-xs">
            {pageViews.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => navigate({ to: "/app/users", search: { view: v } })}
                aria-pressed={view === v}
                className={`min-h-11 rounded-full px-3 font-medium capitalize transition sm:min-h-9 ${
                  view === v
                    ? "bg-primary/15 text-primary shadow-[0_0_18px_-4px_var(--color-primary)]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {(view === "accounts" || view === "tenants") && (
        <UsersCapabilitiesPanel isPlatformAdmin={isPlatformAdmin} />
      )}

      {view === "tenants" ? (
        <TenantsConsole />
      ) : (
        <>
          {err && (
            <div className="rounded-md border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
              {err}
            </div>
          )}

          <section className="panel p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Create new user
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setErr(null);
                createMut.mutate();
              }}
              className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
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
              <select
                className="input"
                value={role}
                onChange={(e) => {
                  const next = e.target.value as "primary" | "client" | "agent";
                  setRole2(next);
                }}
              >
                <option value="client">User</option>
                <option value="agent">Verified Agent</option>
                {canCreatePrimary ? <option value="primary">Primary</option> : null}
              </select>
              <button
                type="submit"
                disabled={createMut.isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[var(--shadow-glow)] hover:opacity-90 disabled:opacity-50"
              >
                {createMut.isPending ? "Creating…" : "Add user"}
              </button>
            </form>
            <p className="mt-2 text-xs text-muted-foreground">
              {isPlatformAdmin
                ? "User = café shop owner (own RouterBOARD Hotspot). Primary = Application owner (no café). Developer builds the app (no café). Verified Agents recruit café Users for the Application owner and earn Magic Coins on monthly/annual purchases under their ID tag. One Primary per cloud."
                : "Create café Users (Hotspot shop owners) and Verified Agents (recruiters). Each café User owns their routers, plans, and portal. New Users activate for 7 days. Agents never expire; they earn Magic Coins commission on referred monthly/annual purchases."}
              {!canCreatePrimary && isPlatformAdmin ? (
                <span className="mt-1 block">
                  Primary already exists — creating or granting another Primary is blocked.
                </span>
              ) : null}
            </p>
          </section>

          <OperatorFeatureGrantsAdmin users={users.data ?? []} showRoleDefaults={false} />

          {(users.data ?? []).some((u) => u.roles.includes("pending")) && (
            <section className="panel overflow-hidden">
              <div className="border-b border-border p-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Pending approvals
              </div>
              <div className="divide-y divide-border">
                {(users.data ?? [])
                  .filter((u) => u.roles.includes("pending"))
                  .map((u) => (
                    <div
                      key={u.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{u.username ?? u.display_name ?? "—"}</span>
                          <StatusPill role="pending" />
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Created by {u.agent_name ?? "—"} ·{" "}
                          {new Date(u.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          disabled={approveMut.isPending}
                          onClick={() => approveMut.mutate(u.id)}
                          className="rounded-md border border-emerald-400/50 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-400/20 disabled:opacity-50"
                        >
                          {approveMut.isPending ? "Approving…" : "Approve"}
                        </button>
                        <button
                          disabled={rejectMut.isPending}
                          onClick={() => {
                            if (window.confirm(`Reject and delete ${u.username ?? u.email}?`)) {
                              rejectMut.mutate(u.id);
                            }
                          }}
                          className="rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
              <p className="border-t border-border p-3 text-xs text-muted-foreground">
                Approving activates the account for one month. Magic Coins are earned only when a
                paid Tier Pass is approved — not on signup.
              </p>
            </section>
          )}

          <section className="panel overflow-hidden">
            <div className="border-b border-border p-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Accounts ({users.data?.length ?? 0})
            </div>

            {/* Mobile stacked cards — actions stay reachable without sideways scroll */}
            <ul className="divide-y divide-border md:hidden">
              {users.isLoading && (
                <li className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</li>
              )}
              {!users.isLoading && (users.data?.length ?? 0) === 0 && (
                <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No accounts yet.
                </li>
              )}
              {users.data?.map((u) => {
                const isSelf = u.id === me.data?.id;
                const canManageRow = usersPageCanManageAccount(actor, u, me.data?.id ?? "");
                const currentRole = (
                  u.roles.includes("primary")
                    ? "primary"
                    : u.roles.includes("agent")
                      ? "agent"
                      : u.roles.includes("pending")
                        ? "pending"
                        : u.roles.includes("expired")
                          ? "expired"
                          : "client"
                ) as AccountRole;
                const isExpiredRole = currentRole === "expired";
                const canAssignPrimary = usersPageCanAssignPrimaryRole(
                  actor,
                  primaryAccounts.length,
                  currentRole === "primary",
                );
                const ownerLabel = ownershipLabel(u);
                return (
                  <li key={u.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {u.username ?? u.display_name ?? "—"}
                        </div>
                        <div className="break-all text-xs text-muted-foreground">
                          {u.email ?? "—"}
                        </div>
                      </div>
                      <StatusPill role={currentRole} />
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-muted-foreground">
                      {isPlatformAdmin ? (
                        <div>
                          <dt className="uppercase tracking-wide">Owner</dt>
                          <dd className="mt-0.5 text-foreground">{ownerLabel}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt className="uppercase tracking-wide">Referred by</dt>
                        <dd className="mt-0.5 text-foreground">{u.agent_name ?? "—"}</dd>
                      </div>
                      <div>
                        <dt className="uppercase tracking-wide">Expires</dt>
                        <dd className="mt-0.5">
                          {currentRole === "primary" || currentRole === "agent" ? (
                            <span className="text-foreground">Never</span>
                          ) : (
                            <ExpiresCell
                              key={`${u.id}-${u.client_expires_at ?? "none"}`}
                              expiresAt={u.client_expires_at}
                              editable={canManageRow}
                              pending={
                                expiresMut.isPending && expiresMut.variables?.user_id === u.id
                              }
                              onSave={(expires_at) =>
                                expiresMut.mutate({ user_id: u.id, expires_at })
                              }
                            />
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="uppercase tracking-wide">Last sign-in</dt>
                        <dd className="mt-0.5 text-foreground">
                          {u.last_sign_in_at
                            ? new Date(u.last_sign_in_at).toLocaleString()
                            : "Never"}
                        </dd>
                      </div>
                    </dl>
                    <label className="block text-xs text-muted-foreground">
                      Role
                      <select
                        className="input mt-1 w-full"
                        value={currentRole}
                        disabled={isSelf || !canManageRow || roleMut.isPending}
                        onChange={(e) =>
                          roleMut.mutate({
                            user_id: u.id,
                            role: e.target.value as AccountRole,
                          })
                        }
                      >
                        <option value="client">User</option>
                        <option value="agent">Verified Agent</option>
                        {canAssignPrimary ? <option value="primary">Primary</option> : null}
                        <option value="pending">Pending</option>
                        <option value="expired">Expired</option>
                      </select>
                    </label>
                    {!canManageRow && !isSelf ? (
                      <p className="text-[11px] text-muted-foreground">
                        Primary accounts are managed by a Developer.
                      </p>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2">
                      {currentRole === "pending" && canManageRow && (
                        <button
                          type="button"
                          disabled={approveMut.isPending}
                          onClick={() => approveMut.mutate(u.id)}
                          className="col-span-2 min-h-11 rounded-md border border-emerald-400/50 bg-emerald-400/10 px-3 text-xs font-medium text-emerald-200 hover:bg-emerald-400/20 disabled:opacity-50"
                        >
                          {approveMut.isPending ? "Approving…" : "Approve"}
                        </button>
                      )}
                      {isExpiredRole && canManageRow && (
                        <button
                          type="button"
                          disabled={activateMut.isPending}
                          onClick={() => activateMut.mutate(u.id)}
                          className="col-span-2 min-h-11 rounded-md border border-emerald-400/50 bg-emerald-400/10 px-3 text-xs font-medium text-emerald-200 hover:bg-emerald-400/20 disabled:opacity-50"
                        >
                          {activateMut.isPending ? "Activating…" : "Activate account"}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={!canManageRow}
                        onClick={() => {
                          const pw = window.prompt(`New password for ${u.username ?? u.email}`);
                          if (pw && isValidPassword(pw)) {
                            pwMut.mutate({ user_id: u.id, password: pw });
                          } else if (pw) {
                            window.alert(PASSWORD_POLICY_MESSAGE);
                          }
                        }}
                        className="min-h-11 rounded-md border border-border px-3 text-xs hover:border-primary hover:text-primary disabled:opacity-40"
                      >
                        Reset password
                      </button>
                      <button
                        type="button"
                        disabled={isSelf || !canManageRow}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete user ${u.username ?? u.email}? This cannot be undone.`,
                            )
                          ) {
                            delMut.mutate(u.id);
                          }
                        }}
                        className="min-h-11 rounded-md border border-red-500/40 px-3 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-surface/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Role</th>
                    {isPlatformAdmin ? <th className="px-4 py-3">Owner</th> : null}
                    <th className="px-4 py-3">Referred by</th>
                    <th className="px-4 py-3">Expires</th>
                    <th className="px-4 py-3">Last sign-in</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.isLoading && (
                    <tr>
                      <td
                        colSpan={isPlatformAdmin ? 8 : 7}
                        className="px-4 py-8 text-center text-muted-foreground"
                      >
                        Loading…
                      </td>
                    </tr>
                  )}
                  {users.data?.map((u) => {
                    const isSelf = u.id === me.data?.id;
                    const canManageRow = usersPageCanManageAccount(actor, u, me.data?.id ?? "");
                    const currentRole = (
                      u.roles.includes("primary")
                        ? "primary"
                        : u.roles.includes("agent")
                          ? "agent"
                          : u.roles.includes("pending")
                            ? "pending"
                            : u.roles.includes("expired")
                              ? "expired"
                              : "client"
                    ) as AccountRole;
                    const isExpiredRole = currentRole === "expired";
                    const canAssignPrimary = usersPageCanAssignPrimaryRole(
                      actor,
                      primaryAccounts.length,
                      currentRole === "primary",
                    );
                    const ownerLabel = ownershipLabel(u);
                    return (
                      <tr key={u.id} className="border-t border-border align-middle">
                        <td className="max-w-[240px] px-4 py-3 align-top">
                          <div className="break-words font-medium">
                            {u.username ?? u.display_name ?? "—"}
                          </div>
                          <div className="break-all text-xs text-muted-foreground">
                            {u.email ?? "—"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill role={currentRole} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <select
                              className="input py-1"
                              value={currentRole}
                              disabled={isSelf || !canManageRow || roleMut.isPending}
                              onChange={(e) =>
                                roleMut.mutate({
                                  user_id: u.id,
                                  role: e.target.value as AccountRole,
                                })
                              }
                            >
                              <option value="client">User</option>
                              <option value="agent">Verified Agent</option>
                              {canAssignPrimary ? <option value="primary">Primary</option> : null}
                              <option value="pending">Pending</option>
                              <option value="expired">Expired</option>
                            </select>
                            {(isExpiredRole || currentRole === "pending") && (
                              <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                                Read-only
                              </span>
                            )}
                          </div>
                        </td>
                        {isPlatformAdmin ? (
                          <td className="px-4 py-3 text-xs text-muted-foreground">{ownerLabel}</td>
                        ) : null}
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {u.agent_name ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {currentRole === "primary" || currentRole === "agent" ? (
                            <span className="text-xs text-muted-foreground">Never</span>
                          ) : (
                            <ExpiresCell
                              key={`${u.id}-${u.client_expires_at ?? "none"}`}
                              expiresAt={u.client_expires_at}
                              editable={canManageRow}
                              pending={
                                expiresMut.isPending && expiresMut.variables?.user_id === u.id
                              }
                              onSave={(expires_at) =>
                                expiresMut.mutate({ user_id: u.id, expires_at })
                              }
                            />
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {u.last_sign_in_at
                            ? new Date(u.last_sign_in_at).toLocaleString()
                            : "Never"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            {currentRole === "pending" && canManageRow && (
                              <button
                                disabled={approveMut.isPending}
                                onClick={() => approveMut.mutate(u.id)}
                                className="rounded-md border border-emerald-400/50 bg-emerald-400/10 px-2 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-400/20 disabled:opacity-50"
                              >
                                {approveMut.isPending ? "Approving…" : "Approve"}
                              </button>
                            )}
                            {isExpiredRole && canManageRow && (
                              <button
                                disabled={activateMut.isPending}
                                onClick={() => activateMut.mutate(u.id)}
                                className="rounded-md border border-emerald-400/50 bg-emerald-400/10 px-2 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-400/20 disabled:opacity-50"
                              >
                                {activateMut.isPending ? "Activating…" : "Activate account"}
                              </button>
                            )}
                            <button
                              disabled={!canManageRow}
                              onClick={() => {
                                const pw = window.prompt(
                                  `New password for ${u.username ?? u.email}`,
                                );
                                if (pw && isValidPassword(pw)) {
                                  pwMut.mutate({ user_id: u.id, password: pw });
                                } else if (pw) {
                                  window.alert(PASSWORD_POLICY_MESSAGE);
                                }
                              }}
                              className="rounded-md border border-border px-2 py-1 text-xs hover:border-primary hover:text-primary disabled:opacity-40"
                            >
                              Reset password
                            </button>
                            <button
                              disabled={isSelf || !canManageRow}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Delete user ${u.username ?? u.email}? This cannot be undone.`,
                                  )
                                ) {
                                  delMut.mutate(u.id);
                                }
                              }}
                              className="rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {users.data?.length === 0 && (
                    <tr>
                      <td
                        colSpan={isPlatformAdmin ? 8 : 7}
                        className="px-4 py-8 text-center text-muted-foreground"
                      >
                        No accounts yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
