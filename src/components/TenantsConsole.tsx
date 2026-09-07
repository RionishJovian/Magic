import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getMe } from "@/lib/auth.functions";
import { hasTenantPrimaryRole, TENANT_PRIMARY_ROLE } from "@/lib/app-role";
import { listTenantsOverview } from "@/lib/tenants.functions";
import { setAppUserRole, resetAppUserPassword, deleteAppUser } from "@/lib/users.functions";
import { usersPageCanCreatePrimary } from "@/lib/users-page-capabilities";
import { isValidPassword, PASSWORD_POLICY_MESSAGE } from "@/lib/password-policy";

function fmt(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString();
}

export function TenantsConsole() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchMe = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe() });
  const isPrimary = me.data?.roles?.includes("primary") ?? false;
  const isPlatformAdmin = me.data?.isPlatformAdmin ?? false;
  const canAccess = isPrimary || isPlatformAdmin;

  const listFn = useServerFn(listTenantsOverview);
  const list = useQuery({
    queryKey: ["tenants-overview"],
    queryFn: () => listFn(),
    enabled: canAccess,
    staleTime: 30_000,
  });

  const setRole = useServerFn(setAppUserRole);
  const resetPw = useServerFn(resetAppUserPassword);
  const del = useServerFn(deleteAppUser);

  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "primary" | "client">("all");
  const [err, setErr] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tenants-overview"] });
    qc.invalidateQueries({ queryKey: ["app-users"] });
  };

  const roleMut = useMutation({
    mutationFn: (v: { user_id: string; role: "primary" | "client" }) => setRole({ data: v }),
    onSuccess: invalidate,
    onError: (e: Error) => setErr(e.message),
  });
  const pwMut = useMutation({
    mutationFn: (v: { user_id: string; password: string }) => resetPw({ data: v }),
    onError: (e: Error) => setErr(e.message),
  });
  const delMut = useMutation({
    mutationFn: (user_id: string) => del({ data: { user_id } }),
    onSuccess: () => {
      invalidate();
    },
    onError: (e: Error) => setErr(e.message),
  });

  const filtered = useMemo(() => {
    const rows = list.data ?? [];
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (roleFilter === "primary" && !hasTenantPrimaryRole(r.roles)) return false;
      if (roleFilter === "client" && hasTenantPrimaryRole(r.roles)) return false;
      if (!needle) return true;
      return (
        (r.username ?? "").toLowerCase().includes(needle) ||
        (r.display_name ?? "").toLowerCase().includes(needle) ||
        (r.email ?? "").toLowerCase().includes(needle) ||
        r.id.toLowerCase().includes(needle)
      );
    });
  }, [list.data, q, roleFilter]);

  if (me.isLoading)
    return <div className="panel p-10 text-center text-muted-foreground">Loading…</div>;

  if (!canAccess) {
    return (
      <div className="panel mx-auto max-w-xl p-8 text-center">
        <h1 className="text-xl font-semibold">Tenant console is restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only a Primary tenant or a Developer can view and manage café accounts here.
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

  const totals = list.data ?? [];
  const totalRouters = totals.reduce((s, t) => s + t.router_count, 0);
  const primaryCount = totals.filter((t) => hasTenantPrimaryRole(t.roles)).length;
  const canAssignPrimary = usersPageCanCreatePrimary({ isPrimary, isPlatformAdmin }, primaryCount);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tenant console</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isPlatformAdmin
            ? "Search, inspect, and manage tenant accounts (roles, passwords, deletion) across every café."
            : "Search and manage Users and Agents in your café — roles, passwords, and removal."}
        </p>
      </div>

      {err && (
        <div className="rounded-md border border-red-500/40 bg-red-950/50 p-3 text-sm text-red-200">
          {err}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="panel p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {isPlatformAdmin ? "Total tenants" : "Team accounts"}
          </div>
          <div className="mt-1 text-2xl font-semibold">{totals.length}</div>
        </div>
        <div className="panel p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Primaries</div>
          <div className="mt-1 text-2xl font-semibold">
            {totals.filter((t) => hasTenantPrimaryRole(t.roles)).length}
          </div>
        </div>
        <div className="panel p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {isPlatformAdmin ? "Routers across fleet" : "Routers in your café"}
          </div>
          <div className="mt-1 text-2xl font-semibold">{totalRouters}</div>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          className="input w-full min-w-0 flex-1 sm:min-w-[240px]"
          placeholder="Search by username, display name, email, or UUID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="input w-full sm:w-auto"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
        >
          <option value="all">All roles</option>
          <option value="primary">Primaries</option>
          <option value="client">Users</option>
        </select>
        <button
          type="button"
          onClick={() => list.refetch()}
          className="min-h-11 w-full rounded-md border border-border px-3 text-xs hover:border-primary hover:text-primary sm:w-auto"
        >
          Refresh
        </button>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-border p-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Tenants ({filtered.length})
        </div>

        <ul className="divide-y divide-border md:hidden">
          {list.isLoading && (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              Loading tenants…
            </li>
          )}
          {!list.isLoading && filtered.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              No tenants match this search.
            </li>
          )}
          {filtered.map((t) => {
            const isSelf = t.id === me.data?.id;
            const currentRole = (hasTenantPrimaryRole(t.roles) ? TENANT_PRIMARY_ROLE : "client") as
              "primary" | "client";
            const label = t.username ?? t.display_name ?? t.email ?? t.id.slice(0, 8);
            return (
              <li key={t.id} className="space-y-3 p-4">
                <div className="min-w-0">
                  <div className="truncate font-medium">{label}</div>
                  <div className="break-all text-xs text-muted-foreground">{t.email ?? "—"}</div>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-muted-foreground">
                  <div>
                    <dt className="uppercase tracking-wide">Routers</dt>
                    <dd className="mt-0.5 text-foreground">{t.router_count}</dd>
                  </div>
                  <div>
                    <dt className="uppercase tracking-wide">Last sign-in</dt>
                    <dd className="mt-0.5 text-foreground">{fmt(t.last_sign_in_at)}</dd>
                  </div>
                  <div>
                    <dt className="uppercase tracking-wide">Last save</dt>
                    <dd className="mt-0.5 text-foreground">{fmt(t.last_router_save)}</dd>
                  </div>
                  <div>
                    <dt className="uppercase tracking-wide">Last deploy</dt>
                    <dd className="mt-0.5 text-foreground">{fmt(t.last_deploy)}</dd>
                  </div>
                </dl>
                <label className="block text-xs text-muted-foreground">
                  Role
                  <select
                    className="input mt-1 w-full"
                    value={currentRole}
                    disabled={isSelf || roleMut.isPending}
                    onChange={(e) =>
                      roleMut.mutate({
                        user_id: t.id,
                        role: e.target.value as "primary" | "client",
                      })
                    }
                  >
                    <option value="client">User</option>
                    {canAssignPrimary || currentRole === "primary" ? (
                      <option value="primary">Primary</option>
                    ) : null}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/app/routers" })}
                    className="min-h-11 rounded-md border border-border px-3 text-xs hover:border-primary hover:text-primary"
                  >
                    Open routers
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const pw = window.prompt(`New password for ${label}`);
                      if (pw && isValidPassword(pw)) {
                        pwMut.mutate({ user_id: t.id, password: pw });
                      } else if (pw) {
                        window.alert(PASSWORD_POLICY_MESSAGE);
                      }
                    }}
                    className="min-h-11 rounded-md border border-border px-3 text-xs hover:border-primary hover:text-primary"
                  >
                    Reset pw
                  </button>
                  <button
                    type="button"
                    disabled={isSelf}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete tenant ${label}? All owned data is orphaned. This cannot be undone.`,
                        )
                      ) {
                        delMut.mutate(t.id);
                      }
                    }}
                    className="col-span-2 min-h-11 rounded-md border border-red-500/40 px-3 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-surface/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Routers</th>
                <th className="px-4 py-3">Last sign-in</th>
                <th className="px-4 py-3">Last save</th>
                <th className="px-4 py-3">Last deploy</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Loading tenants…
                  </td>
                </tr>
              )}
              {!list.isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No tenants match this search.
                  </td>
                </tr>
              )}
              {filtered.map((t) => {
                const isSelf = t.id === me.data?.id;
                const currentRole = (
                  hasTenantPrimaryRole(t.roles) ? TENANT_PRIMARY_ROLE : "client"
                ) as "primary" | "client";
                const label = t.username ?? t.display_name ?? t.email ?? t.id.slice(0, 8);
                return (
                  <tr key={t.id} className="border-t border-border align-middle">
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium">{label}</div>
                        <div className="text-xs text-muted-foreground">{t.email ?? "—"}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="input py-1"
                        value={currentRole}
                        disabled={isSelf || roleMut.isPending}
                        onChange={(e) =>
                          roleMut.mutate({
                            user_id: t.id,
                            role: e.target.value as "primary" | "client",
                          })
                        }
                      >
                        <option value="client">User</option>
                        {canAssignPrimary || currentRole === "primary" ? (
                          <option value="primary">Primary</option>
                        ) : null}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-sm">{t.router_count}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {fmt(t.last_sign_in_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {fmt(t.last_router_save)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {fmt(t.last_deploy)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button
                          onClick={() => navigate({ to: "/app/routers" })}
                          className="rounded-md border border-border px-2 py-1 text-xs hover:border-primary hover:text-primary"
                        >
                          Open routers
                        </button>
                        <button
                          onClick={() => {
                            const pw = window.prompt(`New password for ${label}`);
                          if (pw && isValidPassword(pw)) {
                            pwMut.mutate({ user_id: t.id, password: pw });
                          } else if (pw) {
                            window.alert(PASSWORD_POLICY_MESSAGE);
                          }
                          }}
                          className="rounded-md border border-border px-2 py-1 text-xs hover:border-primary hover:text-primary"
                        >
                          Reset pw
                        </button>
                        <button
                          disabled={isSelf}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete tenant ${label}? All owned data is orphaned. This cannot be undone.`,
                              )
                            ) {
                              delMut.mutate(t.id);
                            }
                          }}
                          className="rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
