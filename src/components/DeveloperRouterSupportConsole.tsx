import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getLatestSupportSyncAudit,
  inspectDeveloperSupportRouter,
  rebootDeveloperSupportRouter,
  syncPlansForSupportRouter,
} from "@/lib/developer-router-support.functions";
import { toErrorMessage } from "@/lib/error-message";

export function DeveloperRouterSupportConsole({
  routerId,
  routerName,
}: {
  routerId: string;
  routerName: string;
}) {
  const inspectFn = useServerFn(inspectDeveloperSupportRouter);
  const rebootFn = useServerFn(rebootDeveloperSupportRouter);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const inspect = useMutation({
    mutationFn: () => inspectFn({ data: { routerId } }),
    onError: (error: Error) => toast.error(toErrorMessage(error, "Could not inspect router")),
  });
  const reboot = useMutation({
    mutationFn: () => rebootFn({ data: { routerId, reason, confirmation } }),
    onSuccess: () => {
      toast.success(`${routerName} is rebooting`);
      setReason("");
      setConfirmation("");
    },
    onError: (error: Error) => toast.error(toErrorMessage(error, "Reboot failed")),
  });
  const syncFn = useServerFn(syncPlansForSupportRouter);
  const auditFn = useServerFn(getLatestSupportSyncAudit);
  const [syncReason, setSyncReason] = useState("");
  const [syncConfirmation, setSyncConfirmation] = useState("");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const audit = useMutation({
    mutationFn: () => auditFn({ data: { routerId } }),
  });
  const loadAudit = () => {
    setAuditOpen(true);
    audit.mutate();
  };
  const syncPlans = useMutation({
    mutationFn: () => {
      setSyncError(null);
      return syncFn({ data: { routerId, reason: syncReason, confirmation: syncConfirmation } });
    },
    onSuccess: (data) => {
      if (data.error) {
        toast.warning(`Synced ${data.written}/${data.total} voucher profiles: ${data.error}`);
        setSyncError(`Partial sync: ${data.error}`);
      } else {
        toast.success(`Synced ${data.written} voucher profiles to ${routerName}`);
      }
      setSyncReason("");
      setSyncConfirmation("");
      loadAudit();
    },
    onError: (error: Error) => {
      const message = toErrorMessage(error, "Plan sync failed");
      setSyncError(message);
      toast.error(message);
      loadAudit();
    },
  });
  const result = inspect.data;
  const rebootPhrase = result?.ok ? result.rebootConfirmation : `REBOOT ${routerName}`;
  const syncPhrase = `SYNC PLANS ${routerName}`;

  return (
    <div className="mt-2 rounded-lg border border-violet-400/30 bg-violet-500/5 p-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-foreground">Platform Support Console</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Cross-customer support is audited. Credentials and generic terminal access are never
            shown.
          </p>
        </div>
        <button
          type="button"
          className="rounded-md border border-violet-400/40 px-2 py-1 text-[11px] font-medium text-violet-100 hover:bg-violet-500/10 disabled:opacity-60"
          onClick={() => inspect.mutate()}
          disabled={inspect.isPending}
        >
          {inspect.isPending ? "Checking…" : "Read-only check"}
        </button>
      </div>

      {result && (
        <div
          className={`mt-2 rounded-md border px-2 py-1.5 text-[11px] ${
            result.ok
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-100"
              : "border-danger/30 bg-danger/5 text-danger"
          }`}
        >
          {result.ok
            ? `${result.identity ?? result.routerName} · RouterOS ${result.version ?? "unknown"} · ${result.board ?? "unknown board"} · ${result.durationMs} ms`
            : result.error}
        </div>
      )}

      <details className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5">
        <summary className="cursor-pointer font-medium text-amber-100">
          Controlled write: reboot router
        </summary>
        <p className="mt-1 text-[11px] text-amber-100/80">
          This drops HotSpot users for about a minute. Give a support reason, then type the exact
          phrase. The action and reason are audited.
        </p>
        <label className="mt-2 block text-[11px] text-muted-foreground">
          Support reason
          <input
            className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
            value={reason}
            maxLength={300}
            placeholder="Example: approved recovery after owner reported a stalled router"
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <label className="mt-2 block text-[11px] text-muted-foreground">
          Type <code className="text-foreground">{rebootPhrase}</code>
          <input
            className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs text-foreground"
            value={confirmation}
            maxLength={200}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="mt-2 rounded-md border border-danger/50 bg-danger/5 px-2 py-1.5 text-[11px] font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={reason.trim().length < 5 || confirmation !== rebootPhrase || reboot.isPending}
          onClick={() => reboot.mutate()}
        >
          {reboot.isPending ? "Rebooting…" : "Reboot with audit"}
        </button>
      </details>

      <details className="mt-2 rounded-md border border-sky-500/30 bg-sky-500/5 px-2 py-1.5">
        <summary className="cursor-pointer font-medium text-sky-100">
          Controlled write: sync this customer&apos;s voucher plans
        </summary>
        <p className="mt-1 text-[11px] text-sky-100/80">
          Add-only. Pushes the customer&apos;s own saved voucher plans as HotSpot user profiles;
          nothing is removed, so custom profiles on the board survive. Requires the board to already
          have a working HotSpot. Basic support allowance is available while the customer account is
          active; the action and reason are audited.
        </p>
        <label className="mt-2 block text-[11px] text-muted-foreground">
          Support reason
          <input
            className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
            value={syncReason}
            maxLength={300}
            placeholder="Example: owner asked us to re-apply their voucher plans after a reset"
            onChange={(event) => setSyncReason(event.target.value)}
          />
        </label>
        <label className="mt-2 block text-[11px] text-muted-foreground">
          Type <code className="text-foreground">{syncPhrase}</code>
          <input
            className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-xs text-foreground"
            value={syncConfirmation}
            maxLength={200}
            onChange={(event) => setSyncConfirmation(event.target.value)}
          />
        </label>
        {syncConfirmation.length > 0 && syncConfirmation !== syncPhrase && (
          <p className="mt-1 text-[11px] font-medium text-amber-200">
            Confirmation does not match. Type exactly{" "}
            <code className="text-foreground">{syncPhrase}</code> — it is case-sensitive and must
            include the router name.
          </p>
        )}
        {syncError && (
          <div className="mt-2 rounded-md border border-danger/40 bg-danger/10 px-2 py-1.5 text-[11px] text-danger">
            <p className="font-semibold">Plan sync could not complete</p>
            <p className="mt-0.5 whitespace-pre-wrap">{syncError}</p>
          </div>
        )}
        <button
          type="button"
          className="mt-2 rounded-md border border-sky-500/50 bg-sky-500/5 px-2 py-1.5 text-[11px] font-semibold text-sky-100 hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={
            syncReason.trim().length < 5 || syncConfirmation !== syncPhrase || syncPlans.isPending
          }
          onClick={() => syncPlans.mutate()}
        >
          {syncPlans.isPending ? "Syncing…" : "Sync voucher plans with audit"}
        </button>
        <button
          type="button"
          className="mt-2 ml-2 rounded-md border border-border px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-surface disabled:opacity-60"
          onClick={loadAudit}
          disabled={audit.isPending}
        >
          {audit.isPending ? "Loading audit…" : "Show last sync audit"}
        </button>
      </details>

      {auditOpen && (
        <div className="mt-2 rounded-md border border-border bg-surface/80 px-2.5 py-2 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-foreground">Last plan-sync audit entry</p>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setAuditOpen(false)}
            >
              Close
            </button>
          </div>
          {audit.isPending && <p className="mt-1 text-muted-foreground">Loading…</p>}
          {audit.isError && (
            <p className="mt-1 text-danger">
              {toErrorMessage(audit.error as Error, "Could not load audit entry")}
            </p>
          )}
          {audit.data && (
            <div className="mt-1.5 space-y-1 text-muted-foreground">
              <p>
                Router:{" "}
                <span className="text-foreground">
                  {audit.data.router.name} · {audit.data.router.environment} ·{" "}
                  {audit.data.router.connectionMode}
                </span>
              </p>
              <p>
                Tenant:{" "}
                <span className="text-foreground">
                  {audit.data.tenant.label} ({audit.data.tenant.ownerId})
                </span>
              </p>
              {audit.data.entry ? (
                <>
                  <p>
                    Action: <span className="text-foreground">{audit.data.entry.action}</span> ·
                    Outcome:{" "}
                    <span
                      className={
                        audit.data.entry.outcome === "ok"
                          ? "text-emerald-300"
                          : audit.data.entry.outcome === "partial"
                            ? "text-amber-200"
                            : "text-danger"
                      }
                    >
                      {audit.data.entry.outcome}
                    </span>
                  </p>
                  <p>
                    When:{" "}
                    <span className="text-foreground">
                      {new Date(audit.data.entry.created_at).toLocaleString()}
                    </span>
                    {audit.data.entry.duration_ms != null
                      ? ` · ${audit.data.entry.duration_ms} ms`
                      : ""}
                  </p>
                  {audit.data.entry.detail && (
                    <p className="whitespace-pre-wrap text-foreground/90">
                      {audit.data.entry.detail}
                    </p>
                  )}
                  {audit.data.entry.error_message && (
                    <p className="whitespace-pre-wrap text-danger">
                      {audit.data.entry.error_message}
                    </p>
                  )}
                </>
              ) : (
                <p>No plan-sync audit entry recorded for this router yet.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
