import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  deleteReadNotifications,
} from "@/lib/notifications.functions";
import { useInAppNotice } from "@/components/InAppNotice.context";
import { NOTICE_ICON, noticeToneForKind } from "@/lib/notify/tone";

type Notif = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export function NotificationsBell({ enabled }: { enabled: boolean }) {
  const list = useServerFn(listMyNotifications);
  const markOne = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const removeOne = useServerFn(deleteNotification);
  const removeRead = useServerFn(deleteReadNotifications);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { pushNotice } = useInAppNotice();
  const rootRef = useRef<HTMLDivElement>(null);

  const q = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: () => list() as Promise<Notif[]>,
    enabled,
    refetchInterval: enabled ? 60_000 : false,
    staleTime: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-notifications"] });
  const markOneMut = useMutation({
    mutationFn: (id: string) => markOne({ data: { id } }),
    onSuccess: invalidate,
  });
  const markAllMut = useMutation({ mutationFn: () => markAll(), onSuccess: invalidate });
  const removeOneMut = useMutation({
    mutationFn: (id: string) => removeOne({ data: { id } }),
    onSuccess: invalidate,
  });
  const removeReadMut = useMutation({ mutationFn: () => removeRead(), onSuccess: invalidate });

  const seen = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);
  useEffect(() => {
    if (!q.data) return;
    for (const n of q.data) {
      if (n.read_at) continue;
      if (seen.current.has(n.id)) continue;
      seen.current.add(n.id);
      if (!firstLoad.current) {
        pushNotice({
          id: `notif:${n.id}`,
          tone: noticeToneForKind(n.kind),
          title: n.title,
          body: n.body ?? undefined,
        });
      }
    }
    firstLoad.current = false;
  }, [q.data, pushNotice]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!enabled) return null;
  const unread = (q.data ?? []).filter((n) => !n.read_at).length;
  const readCount = (q.data ?? []).filter((n) => n.read_at).length;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label={`Notifications (${unread} unread)`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="touch-icon relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--glass-border)] bg-[color:var(--surface-tint)] transition hover:border-primary/50 hover:text-primary active:scale-95 sm:h-9 sm:w-9"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="notice-surface fixed inset-x-3 top-[max(3.75rem,calc(env(safe-area-inset-top)+3.25rem))] z-50 mx-auto max-h-[min(24rem,70dvh)] w-auto max-w-sm overflow-hidden rounded-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mx-0 sm:mt-2 sm:w-80 sm:max-w-none"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs">
            <span className="font-semibold uppercase tracking-wide text-muted-foreground">
              Notifications
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => markAllMut.mutate()}
                disabled={unread === 0 || markAllMut.isPending}
                className="text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                Mark all read
              </button>
              <button
                onClick={() => removeReadMut.mutate()}
                disabled={readCount === 0 || removeReadMut.isPending}
                className="text-muted-foreground hover:text-red-300 disabled:opacity-40"
              >
                Clear read
              </button>
            </div>
          </div>
          <div className="max-h-[min(20rem,60dvh)] overflow-y-auto">
            {q.isLoading && (
              <div className="p-4 text-center text-xs text-muted-foreground">Loading…</div>
            )}
            {q.data?.length === 0 && (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No notifications yet.
              </div>
            )}
            {q.data?.map((n) => {
              const d = (n.data ?? {}) as {
                client_name?: string;
                client_email?: string;
                expired_at?: string;
              };
              const expiredAt = d.expired_at ? new Date(d.expired_at) : new Date(n.created_at);
              const tone = noticeToneForKind(n.kind);
              const titleClass =
                tone === "critical"
                  ? "text-[color:var(--danger)]"
                  : tone === "caution"
                    ? "text-[color:var(--warning)]"
                    : "";
              return (
                <div
                  key={n.id}
                  className={`flex w-full items-start gap-2 border-b border-[color:var(--glass-border)] px-3 py-3 text-left text-xs transition-colors last:border-b-0 hover:bg-[color:color-mix(in_srgb,currentColor_8%,transparent)] ${
                    n.read_at ? "opacity-65" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => !n.read_at && markOneMut.mutate(n.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className={`font-semibold ${titleClass}`}>
                        <span className="mr-1" aria-hidden>
                          {NOTICE_ICON[tone]}
                        </span>
                        {n.title}
                      </div>
                      {!n.read_at && (
                        <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </div>
                    {n.kind === "client_expired" ? (
                      <div className="mt-1 space-y-0.5 opacity-80">
                        <div>
                          Client:{" "}
                          <span className="font-medium opacity-100">
                            {d.client_name ?? d.client_email ?? "unknown"}
                          </span>
                        </div>
                        <div>
                          Expired:{" "}
                          <span className="font-medium opacity-100">
                            {expiredAt.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ) : (
                      n.body && <div className="mt-1 opacity-85">{n.body}</div>
                    )}
                    <div className="mt-1 text-[10px] font-medium uppercase tracking-wide opacity-60">
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label="Remove notification"
                    disabled={removeOneMut.isPending}
                    onClick={() => removeOneMut.mutate(n.id)}
                    className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:bg-red-500/15 hover:text-red-300"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
