import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { toErrorMessage } from "@/lib/error-message";
import {
  listScriptOperationRouters,
  scanCaptivePortalFilesFromScripts,
  syncVoucherPlansFromScripts,
} from "@/lib/script-router-operations.functions";

export function ScriptRouterOperationsPanel() {
  const listRouters = useServerFn(listScriptOperationRouters);
  const syncPlans = useServerFn(syncVoucherPlansFromScripts);
  const scanPortal = useServerFn(scanCaptivePortalFilesFromScripts);
  const routers = useQuery({
    queryKey: ["script-operation-routers"],
    queryFn: () => listRouters(),
  });
  const [routerId, setRouterId] = useState("");
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<string | null>(null);

  useEffect(() => {
    if (routerId && routers.data?.some((router) => router.id === routerId)) return;
    setRouterId(routers.data?.[0]?.id ?? "");
  }, [routerId, routers.data]);

  const sync = useMutation({
    mutationFn: () => syncPlans({ data: { routerId } }),
    onSuccess: (result) => {
      const failed = result.profiles.length - result.written;
      setSyncResult(
        failed
          ? `${result.written} profile(s) synced; ${failed} need attention.`
          : `${result.written} voucher profile(s) synced to ${result.routerName}.`,
      );
      if (failed) toast.error("Some voucher profiles could not be synced");
      else toast.success("Voucher profiles synced");
    },
    onError: (error) => toast.error(toErrorMessage(error)),
  });

  const scan = useMutation({
    mutationFn: () => scanPortal({ data: { routerId } }),
    onSuccess: (result) => {
      setScanResult(result.summary);
      if (result.status === "matches") toast.success("Captive portal files match saved settings");
      else toast.message("Captive portal scan completed");
    },
    onError: (error) => toast.error(toErrorMessage(error)),
  });

  const busy = sync.isPending || scan.isPending;
  const disabled = !routerId || busy || routers.isLoading;

  return (
    <section className="panel border-primary/30 p-5" aria-labelledby="router-operations-heading">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="chip text-primary">Primary & Developer only</div>
          <h2 id="router-operations-heading" className="mt-2 text-lg font-semibold">
            Live RouterOS operations
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Sync saved voucher plans or inspect the captive-portal files on one connected router.
          </p>
        </div>
        <label className="block min-w-60 text-xs font-medium text-muted-foreground">
          Target router
          <select
            value={routerId}
            onChange={(event) => setRouterId(event.target.value)}
            disabled={routers.isLoading || routers.isError}
            className="input mt-1 w-full"
          >
            {routers.isLoading ? <option>Loading routers…</option> : null}
            {!routers.isLoading && !routers.data?.length ? (
              <option value="">No live routers available</option>
            ) : null}
            {routers.data?.map((router) => (
              <option key={router.id} value={router.id}>
                {router.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-medium">Voucher plan sync</h3>
            <span className="chip">REST write</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Creates or updates the managed HotSpot profiles for every saved voucher plan. It does
            not issue vouchers or delete profiles.
          </p>
          <button
            onClick={() => sync.mutate()}
            disabled={disabled}
            className="mt-4 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sync.isPending ? "Syncing plans…" : "Sync voucher plans"}
          </button>
          {syncResult ? <p className="mt-3 text-xs text-muted-foreground">{syncResult}</p> : null}
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-medium">Captive portal file scan</h3>
            <span className="chip">Read-only GET /file</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Checks the live portal directory, profile mapping, text files, and configured image
            assets without changing the router.
          </p>
          <button
            onClick={() => scan.mutate()}
            disabled={disabled}
            className="mt-4 rounded-md border border-primary/50 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {scan.isPending ? "Scanning portal…" : "Scan captive portal files"}
          </button>
          {scanResult ? <p className="mt-3 text-xs text-muted-foreground">{scanResult}</p> : null}
        </div>
      </div>
    </section>
  );
}
