import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { listRouters } from "@/lib/routers.functions";
import { getSnapshot, kickUser, banMac, setUserRate, unbanMac } from "@/lib/mikrotik.functions";
import { useSelectedSite } from "@/hooks/useSelectedSite";
import { copyText } from "@/lib/browser/clipboard";
import { toErrorMessage } from "@/lib/error-message";

export const Route = createFileRoute("/_authenticated/app/live")({
  head: () => ({
    meta: [
      { title: "Live users — MikroTik Hotspot Admin" },
      {
        name: "description",
        content:
          "Monitor active hotspot sessions in real time: IP, MAC, bandwidth, and kick or ban controls.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LivePage,
});

type ActiveRow = Record<string, string> & { ".id": string };
type BindingRow = Record<string, string> & { ".id": string };
type UserRow = Record<string, string> & { ".id": string };

type Status = "active" | "idle" | "near" | "over" | "banned";

interface Session {
  id: string;
  user: string;
  ip: string;
  mac: string;
  uptime: string;
  timeLeft: string | null;
  bytesIn: number;
  bytesOut: number;
  bytesLimitLeft: number | null;
  status: Status;
  matchedUser?: UserRow;
}

const STATUS_META: Record<Status, { label: string; dot: string; text: string; bg: string }> = {
  active: {
    label: "Active",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-500/10",
  },
  idle: {
    label: "Idle",
    dot: "bg-slate-400",
    text: "text-slate-600 dark:text-slate-300",
    bg: "bg-slate-500/10",
  },
  near: {
    label: "Near expiry",
    dot: "bg-amber-500 animate-pulse",
    text: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-500/10",
  },
  over: {
    label: "Over quota",
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-300",
    bg: "bg-red-500/10",
  },
  banned: {
    label: "Banned MAC",
    dot: "bg-red-600",
    text: "text-red-700 dark:text-red-300",
    bg: "bg-red-500/15",
  },
};

function toNumber(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

function parseDurationSec(s: string | undefined | null): number | null {
  if (!s) return null;
  // Formats like "1d2h3m4s", "45m10s", "10s"
  let total = 0;
  const rx = /(\d+)([dhms])/g;
  let m: RegExpExecArray | null;
  let matched = false;
  while ((m = rx.exec(s))) {
    matched = true;
    const n = Number(m[1]);
    total += n * (m[2] === "d" ? 86400 : m[2] === "h" ? 3600 : m[2] === "m" ? 60 : 1);
  }
  return matched ? total : null;
}

function humanBytes(v: unknown): string {
  const n = toNumber(v);
  if (n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let x = n;
  while (x >= 1024 && i < u.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x.toFixed(x < 10 ? 1 : 0)} ${u[i]}`;
}

function LivePage() {
  const qc = useQueryClient();
  const fetchRouters = useServerFn(listRouters);
  const snapshot = useServerFn(getSnapshot);
  const kick = useServerFn(kickUser);
  const ban = useServerFn(banMac);
  const rate = useServerFn(setUserRate);
  const unban = useServerFn(unbanMac);

  const routers = useQuery({ queryKey: ["routers"], queryFn: () => fetchRouters() });
  const { site: selectedSite } = useSelectedSite();
  const siteRouters = useMemo(
    () => (routers.data ?? []).filter((r) => (selectedSite ? r.site_id === selectedSite.id : true)),
    [routers.data, selectedSite],
  );
  const [routerId, setRouterId] = useState<string>("");
  const chosen =
    (routerId && siteRouters.some((r) => r.id === routerId) ? routerId : null) ||
    siteRouters[0]?.id ||
    "";
  const chosenRouter = siteRouters.find((r) => r.id === chosen);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [sort, setSort] = useState<"recent" | "uptime" | "data" | "left">("recent");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<
    | { kind: "kick"; ids: string[]; label: string }
    | { kind: "ban"; macs: string[]; label: string }
    | null
  >(null);

  const snap = useQuery({
    queryKey: ["snapshot", chosen],
    queryFn: () => snapshot({ data: { routerId: chosen } }),
    enabled: !!chosen,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["snapshot", chosen] });

  const kickMut = useMutation({
    mutationFn: (id: string) => kick({ data: { routerId: chosen, id } }),
    onSuccess: (_r, id) => {
      toast.success("User kicked");
      // Optimistic remove
      qc.setQueryData<Awaited<ReturnType<typeof snapshot>>>(["snapshot", chosen], (prev) =>
        prev ? { ...prev, active: (prev.active ?? []).filter((s) => s[".id"] !== id) } : prev,
      );
      invalidate();
    },
    onError: (e: Error) => toast.error("Kick failed", { description: toErrorMessage(e) }),
  });
  const banMut = useMutation({
    mutationFn: (mac: string) => ban({ data: { routerId: chosen, mac } }),
    onSuccess: () => {
      toast.success("MAC banned");
      invalidate();
    },
    onError: (e: Error) => toast.error("Ban failed", { description: toErrorMessage(e) }),
  });
  const unbanMut = useMutation({
    mutationFn: (mac: string) => unban({ data: { routerId: chosen, mac } }),
    onSuccess: (r) => {
      toast.success(
        r?.removed
          ? `Removed ${r.removed} binding${r.removed > 1 ? "s" : ""}`
          : "No matching bindings",
      );
      invalidate();
    },
    onError: (e: Error) => toast.error("Unban failed", { description: toErrorMessage(e) }),
  });
  const rateMut = useMutation({
    mutationFn: (v: { id: string; rate: string }) => rate({ data: { routerId: chosen, ...v } }),
    onSuccess: () => {
      toast.success("Bandwidth updated");
      invalidate();
    },
    onError: (e: Error) =>
      toast.error("Bandwidth update failed", { description: toErrorMessage(e) }),
  });

  // Memoised so the `?? []` fallbacks don't produce a new array identity on
  // every render and invalidate the memos below.
  const active = useMemo(() => (snap.data?.active ?? []) as ActiveRow[], [snap.data?.active]);
  const users = useMemo(() => (snap.data?.users ?? []) as UserRow[], [snap.data?.users]);
  const bindings = useMemo(
    () => (snap.data?.bindings ?? []) as BindingRow[],
    [snap.data?.bindings],
  );

  const usersByName = useMemo(() => {
    const m: Record<string, UserRow> = {};
    for (const u of users) m[u.name] = u;
    return m;
  }, [users]);

  const bannedMacs = useMemo(() => {
    const s = new Set<string>();
    for (const b of bindings) {
      if (b.type === "blocked" && b["mac-address"]) s.add(b["mac-address"].toUpperCase());
    }
    return s;
  }, [bindings]);

  const sessions: Session[] = useMemo(() => {
    return active.map((s) => {
      const mac = (s["mac-address"] ?? "").toUpperCase();
      const timeLeftSec = parseDurationSec(s["session-time-left"]);
      const bytesLimitLeft =
        s["bytes-in-limit-left"] != null || s["bytes-out-limit-left"] != null
          ? toNumber(s["bytes-in-limit-left"]) + toNumber(s["bytes-out-limit-left"])
          : null;
      const bytesIn = toNumber(s["bytes-in"]);
      const bytesOut = toNumber(s["bytes-out"]);
      const idle = parseDurationSec(s["idle-time"]);

      let status: Status = "active";
      if (bannedMacs.has(mac)) status = "banned";
      else if (bytesLimitLeft != null && bytesLimitLeft <= 0) status = "over";
      else if (timeLeftSec != null && timeLeftSec !== null && timeLeftSec <= 0) status = "over";
      else if (
        (timeLeftSec != null && timeLeftSec < 600) ||
        (bytesLimitLeft != null && bytesLimitLeft < 50 * 1024 * 1024)
      )
        status = "near";
      else if (idle != null && idle > 120) status = "idle";

      return {
        id: s[".id"],
        user: s.user ?? "—",
        ip: s.address ?? "—",
        mac: s["mac-address"] ?? "—",
        uptime: s.uptime ?? "—",
        timeLeft: s["session-time-left"] ?? null,
        bytesIn,
        bytesOut,
        bytesLimitLeft,
        status,
        matchedUser: usersByName[s.user],
      };
    });
  }, [active, bannedMacs, usersByName]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = sessions.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      return (
        s.user.toLowerCase().includes(q) ||
        s.ip.toLowerCase().includes(q) ||
        s.mac.toLowerCase().includes(q)
      );
    });
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "uptime":
          return (parseDurationSec(b.uptime) ?? 0) - (parseDurationSec(a.uptime) ?? 0);
        case "data":
          return b.bytesIn + b.bytesOut - (a.bytesIn + a.bytesOut);
        case "left":
          return (
            (parseDurationSec(a.timeLeft) ?? Infinity) - (parseDurationSec(b.timeLeft) ?? Infinity)
          );
        default:
          return (parseDurationSec(a.uptime) ?? 0) - (parseDurationSec(b.uptime) ?? 0);
      }
    });
    return list;
  }, [sessions, search, statusFilter, sort]);

  const counts = useMemo(() => {
    const c = { all: sessions.length, active: 0, idle: 0, near: 0, over: 0, banned: 0 };
    for (const s of sessions) c[s.status]++;
    return c;
  }, [sessions]);

  /** Real top talkers from live hotspot sessions on the selected router. */
  const topTalkers = useMemo(
    () =>
      [...sessions].sort((a, b) => b.bytesIn + b.bytesOut - (a.bytesIn + a.bytesOut)).slice(0, 5),
    [sessions],
  );

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function copyDetails(s: Session) {
    const line = `${s.user} | ${s.ip} | ${s.mac} | up ${s.uptime}`;
    void copyText(line).then((ok) => {
      if (ok) toast.success("Details copied");
      else toast.error("Copy failed");
    });
  }

  function runConfirm() {
    if (!confirm) return;
    if (confirm.kind === "kick") {
      confirm.ids.forEach((id) => kickMut.mutate(id));
    } else {
      confirm.macs.forEach((m) => banMut.mutate(m));
    }
    setSelected(new Set());
    setConfirm(null);
  }

  const lastUpdated = snap.dataUpdatedAt ? new Date(snap.dataUpdatedAt) : null;

  if (!siteRouters.length) {
    return (
      <div className="panel p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {selectedSite
            ? `No routers on site “${selectedSite.name}”. Pick another site or add a router.`
            : "Add a router first to see live users."}
        </p>
        <Link
          to="/app/routers"
          className="mt-3 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Add a router
        </Link>
      </div>
    );
  }

  const selectedSessions = filtered.filter((s) => selected.has(s.id));

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Live User Monitor</h1>

      {/* Toolbar */}
      <div className="panel sticky top-0 z-20 space-y-3 p-3 backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {siteRouters.length > 1 && (
            <select
              value={chosen}
              onChange={(e) => {
                setRouterId(e.target.value);
                setSelected(new Set());
              }}
              className="min-h-11 w-full min-w-0 rounded-md border border-border bg-surface px-3 py-2 text-sm sm:h-9 sm:min-h-0 sm:w-auto"
              aria-label="Select router"
            >
              {siteRouters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user, IP or MAC"
            className="h-11 w-full sm:h-9 sm:w-64"
            aria-label="Search sessions"
          />
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <select
              value={sort}
              onChange={(e) => {
                const value = e.target.value;
                if (
                  value === "recent" ||
                  value === "uptime" ||
                  value === "data" ||
                  value === "left"
                )
                  setSort(value);
              }}
              className="h-11 w-full rounded-md border border-border bg-surface px-2 text-sm sm:h-9 sm:w-auto"
              aria-label="Sort sessions"
            >
              <option value="recent">Recent join</option>
              <option value="uptime">Longest uptime</option>
              <option value="data">Most data</option>
              <option value="left">Least time left</option>
            </select>
            <button
              type="button"
              onClick={() => snap.refetch()}
              className="h-11 w-full shrink-0 rounded-md border border-border bg-surface px-3 text-xs font-medium hover:bg-surface-elevated sm:h-9 sm:w-auto"
              aria-label="Refresh now"
            >
              {snap.isFetching ? "Syncing…" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:overflow-visible">
          <Chip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            All <span className="opacity-70">· {counts.all}</span>
          </Chip>
          {(["active", "idle", "near", "over", "banned"] as Status[]).map((k) => (
            <Chip key={k} active={statusFilter === k} onClick={() => setStatusFilter(k)}>
              <span
                className={`mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle ${STATUS_META[k].dot}`}
              />
              {STATUS_META[k].label} <span className="opacity-70">· {counts[k]}</span>
            </Chip>
          ))}
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            {chosenRouter ? `${chosenRouter.name} · ` : ""}
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "—"}
          </span>
          {snap.error && <span className="text-red-500">{(snap.error as Error).message}</span>}
        </div>
      </div>

      {topTalkers.length > 0 && (
        <section className="panel p-3" aria-label="Top talkers">
          <div className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            Top talkers (this router)
          </div>
          <ul className="space-y-1.5 text-xs">
            {topTalkers.map((s, idx) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-surface/40 px-2 py-1.5"
              >
                <span className="font-medium">
                  #{idx + 1} {s.user || "guest"}{" "}
                  <span className="font-mono text-muted-foreground">{s.ip}</span>
                </span>
                <span className="font-mono text-muted-foreground">
                  {humanBytes(s.bytesIn)} ↓ / {humanBytes(s.bytesOut)} ↑
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="panel sticky top-[9.5rem] z-10 flex flex-wrap items-center justify-between gap-2 p-3">
          <span className="text-xs font-medium">{selected.size} selected</span>
          <div className="flex gap-2">
            <button
              onClick={() =>
                setConfirm({
                  kind: "kick",
                  ids: selectedSessions.map((s) => s.id),
                  label: `${selected.size} session${selected.size > 1 ? "s" : ""}`,
                })
              }
              className="h-11 rounded-md border border-border bg-surface px-3 text-xs font-medium sm:h-9"
            >
              Kick
            </button>
            <button
              onClick={() =>
                setConfirm({
                  kind: "ban",
                  macs: [...new Set(selectedSessions.map((s) => s.mac).filter(Boolean))],
                  label: `${selected.size} MAC${selected.size > 1 ? "s" : ""}`,
                })
              }
              className="h-11 rounded-md border border-red-500/50 px-3 text-xs font-medium text-red-600 dark:text-red-400 sm:h-9"
            >
              Ban MAC
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="h-11 rounded-md px-3 text-xs text-muted-foreground sm:h-9"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Empty */}
      {snap.isLoading ? (
        <div className="panel space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-surface-elevated/60" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState hasAny={sessions.length > 0} />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {filtered.map((s) => (
              <SessionCard
                key={s.id}
                s={s}
                bannedMacs={bannedMacs}
                selected={selected.has(s.id)}
                onSelect={() => toggleSelect(s.id)}
                onKick={() => setConfirm({ kind: "kick", ids: [s.id], label: s.user })}
                onBan={() => setConfirm({ kind: "ban", macs: [s.mac], label: s.user })}
                onUnban={() => unbanMut.mutate(s.mac)}
                onRate={(v) =>
                  s.matchedUser && rateMut.mutate({ id: s.matchedUser[".id"], rate: v })
                }
                canRate={!!s.matchedUser}
                onCopy={() => copyDetails(s)}
              />
            ))}
          </div>

          {/* Desktop table */}
          <section className="panel hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-surface-elevated text-muted-foreground">
                  <tr>
                    <Th className="w-8">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={filtered.length > 0 && filtered.every((s) => selected.has(s.id))}
                        onChange={(e) => {
                          if (e.target.checked) setSelected(new Set(filtered.map((s) => s.id)));
                          else setSelected(new Set());
                        }}
                      />
                    </Th>
                    <Th>Status</Th>
                    <Th>Voucher</Th>
                    <Th>IP</Th>
                    <Th>MAC</Th>
                    <Th>Uptime</Th>
                    <Th>Left</Th>
                    <Th>Down / Up</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => (
                    <tr key={s.id} className="border-t border-border hover:bg-surface-elevated/40">
                      <Td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${s.user}`}
                          checked={selected.has(s.id)}
                          onChange={() => toggleSelect(s.id)}
                        />
                      </Td>
                      <Td>
                        <StatusBadge status={s.status} />
                      </Td>
                      <Td className="font-mono">{s.user}</Td>
                      <Td className="font-mono">
                        <CopyableText text={s.ip} />
                      </Td>
                      <Td className="font-mono">
                        <CopyableText text={s.mac} />
                      </Td>
                      <Td>{s.uptime}</Td>
                      <Td>{s.timeLeft ?? "—"}</Td>
                      <Td>
                        {humanBytes(s.bytesIn)} ↓ / {humanBytes(s.bytesOut)} ↑
                      </Td>
                      <Td className="text-right">
                        <RowActions
                          s={s}
                          isBanned={bannedMacs.has(s.mac.toUpperCase())}
                          onKick={() => setConfirm({ kind: "kick", ids: [s.id], label: s.user })}
                          onBan={() => setConfirm({ kind: "ban", macs: [s.mac], label: s.user })}
                          onUnban={() => unbanMut.mutate(s.mac)}
                          onRate={(v) =>
                            s.matchedUser && rateMut.mutate({ id: s.matchedUser[".id"], rate: v })
                          }
                          canRate={!!s.matchedUser}
                          onCopy={() => copyDetails(s)}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* Bindings summary */}
      {bindings.length > 0 && (
        <section className="panel p-4">
          <details>
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
              IP bindings ({bindings.length})
            </summary>
            <ul className="mt-3 space-y-1 text-xs">
              {bindings.map((b) => (
                <li
                  key={b[".id"]}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-2 py-1"
                >
                  <span className="font-mono">{b["mac-address"]}</span>
                  <span className={b.type === "blocked" ? "text-red-500" : "text-muted-foreground"}>
                    {b.type}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{b.comment}</span>
                  {b.type === "blocked" && (
                    <button
                      onClick={() => unbanMut.mutate(b["mac-address"])}
                      className="h-8 rounded-md border border-border px-2 text-xs"
                    >
                      Unban
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "kick" ? "Kick session?" : "Ban MAC address?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "kick"
                ? `Disconnect ${confirm.label} from the hotspot immediately. They can reconnect using their voucher.`
                : `Add a blocked IP binding for ${confirm?.label}. The device will not be able to reconnect until you unban the MAC.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runConfirm}>
              {confirm?.kind === "kick" ? "Kick" : "Ban"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 shrink-0 rounded-full border px-3 text-[11px] font-medium transition sm:min-h-8 ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-surface text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.bg} ${m.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function CopyableText({ text }: { text: string }) {
  return (
    <button
      type="button"
      onClick={() =>
        void copyText(text).then((ok) => {
          if (ok) toast.success("Copied");
        })
      }
      className="rounded px-1 text-left hover:bg-surface-elevated"
      title="Click to copy"
    >
      {text}
    </button>
  );
}

const RATE_PRESETS = ["256k/512k", "512k/1M", "1M/2M", "2M/5M", "5M/10M"];

function RatePopover({
  onRate,
  canRate,
  children,
}: {
  onRate: (v: string) => void;
  canRate: boolean;
  children: React.ReactNode;
}) {
  const [custom, setCustom] = useState("");
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64 p-3 sm:w-56">
        {!canRate ? (
          <p className="text-xs text-muted-foreground">
            This session isn't tied to a voucher user, so bandwidth can't be adjusted.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground">Presets (up/down)</p>
            <div className="grid grid-cols-2 gap-1.5">
              {RATE_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => onRate(p)}
                  className="min-h-10 rounded-lg border border-border/80 bg-surface px-2 py-1.5 text-xs font-mono shadow-sm transition-colors hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {p}
                </button>
              ))}
            </div>
            <p className="text-[11px] font-semibold text-muted-foreground">Custom</p>
            <div className="flex gap-1">
              <Input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="2M/5M"
                className="h-9 text-xs font-mono"
              />
              <button
                onClick={() => custom && /^\d+[KMG]?\/\d+[KMG]?$/i.test(custom) && onRate(custom)}
                className="h-9 shrink-0 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
              >
                Set
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function RowActions({
  s,
  isBanned,
  onKick,
  onBan,
  onUnban,
  onRate,
  canRate,
  onCopy,
}: {
  s: Session;
  isBanned: boolean;
  onKick: () => void;
  onBan: () => void;
  onUnban: () => void;
  onRate: (v: string) => void;
  canRate: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      <button
        onClick={onKick}
        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-elevated"
      >
        Kick
      </button>
      {isBanned ? (
        <button
          onClick={onUnban}
          className="rounded-md border border-emerald-500/50 px-2 py-1 text-xs text-emerald-600 dark:text-emerald-400"
        >
          Unban
        </button>
      ) : (
        <button
          onClick={onBan}
          className="rounded-md border border-red-500/50 px-2 py-1 text-xs text-red-600 dark:text-red-400"
        >
          Ban MAC
        </button>
      )}
      <RatePopover onRate={onRate} canRate={canRate}>
        <button className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-elevated">
          Rate
        </button>
      </RatePopover>
      <button
        onClick={onCopy}
        className="rounded-md border border-border px-2 py-1 text-xs"
        aria-label="Copy session details"
      >
        Copy
      </button>
    </div>
  );
}

function SessionCard({
  s,
  bannedMacs,
  selected,
  onSelect,
  onKick,
  onBan,
  onUnban,
  onRate,
  canRate,
  onCopy,
}: {
  s: Session;
  bannedMacs: Set<string>;
  selected: boolean;
  onSelect: () => void;
  onKick: () => void;
  onBan: () => void;
  onUnban: () => void;
  onRate: (v: string) => void;
  canRate: boolean;
  onCopy: () => void;
}) {
  const isBanned = bannedMacs.has(s.mac.toUpperCase());
  return (
    <article className={`panel space-y-3 p-4 ${selected ? "ring-2 ring-primary" : ""}`}>
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5"
          checked={selected}
          onChange={onSelect}
          aria-label={`Select ${s.user}`}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-mono text-sm font-semibold">{s.user}</span>
            <StatusBadge status={s.status} />
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            up {s.uptime}
            {s.timeLeft ? ` · ${s.timeLeft} left` : ""}
          </div>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <dt className="text-muted-foreground">IP</dt>
          <dd className="font-mono">
            <CopyableText text={s.ip} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">MAC</dt>
          <dd className="font-mono break-all">
            <CopyableText text={s.mac} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Down</dt>
          <dd className="font-mono">{humanBytes(s.bytesIn)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Up</dt>
          <dd className="font-mono">{humanBytes(s.bytesOut)}</dd>
        </div>
      </dl>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onKick}
          className="h-11 rounded-md bg-primary text-sm font-medium text-primary-foreground"
        >
          Kick
        </button>
        {isBanned ? (
          <button
            onClick={onUnban}
            className="h-11 rounded-md border border-emerald-500/60 text-sm font-medium text-emerald-600 dark:text-emerald-400"
          >
            Unban MAC
          </button>
        ) : (
          <button
            onClick={onBan}
            className="h-11 rounded-md border border-red-500/60 text-sm font-medium text-red-600 dark:text-red-400"
          >
            Ban MAC
          </button>
        )}
        <RatePopover onRate={onRate} canRate={canRate}>
          <button className="h-11 rounded-md border border-border text-sm">Bandwidth</button>
        </RatePopover>
        <button onClick={onCopy} className="h-11 rounded-md border border-border text-sm">
          Copy
        </button>
      </div>
    </article>
  );
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  if (hasAny) {
    return (
      <div className="panel p-8 text-center text-sm text-muted-foreground">
        No sessions match your filter.
      </div>
    );
  }
  return (
    <div className="panel space-y-3 p-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M2 12a10 10 0 0 1 20 0" />
          <path d="M5 12a7 7 0 0 1 14 0" />
          <path d="M8.5 12a3.5 3.5 0 0 1 7 0" />
          <circle cx="12" cy="12" r="1" />
        </svg>
      </div>
      <h2 className="text-sm font-semibold">No active hotspot users</h2>
      <p className="mx-auto max-w-xs text-xs text-muted-foreground">
        When someone signs in with a voucher, they'll appear here in real time.
      </p>
      <Link
        to="/app/vouchers"
        className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Create a voucher
      </Link>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-left font-medium ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
