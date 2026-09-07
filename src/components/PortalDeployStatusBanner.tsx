/**
 * Live portal deploy probe — tells the operator whether the router already
 * carries a Magic portal that matches saved settings.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPortalDeployProbe } from "@/lib/portal.functions";
import { toErrorMessage } from "@/lib/error-message";

export function PortalDeployStatusBanner({
  routerId,
  routerName,
}: {
  routerId: string;
  routerName?: string;
}) {
  const fetchProbe = useServerFn(getPortalDeployProbe);
  const probe = useQuery({
    queryKey: ["portal-deploy-probe", routerId],
    queryFn: () => fetchProbe({ data: { routerId } }),
    enabled: Boolean(routerId),
    staleTime: 20_000,
  });

  if (!routerId) return null;
  if (probe.isLoading) {
    return (
      <div className="rounded-xl border border-border/60 bg-black/20 px-4 py-3 text-xs text-muted-foreground">
        Checking portal on {routerName ?? "router"}…
      </div>
    );
  }
  if (probe.isError) {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        <p className="font-medium">Could not probe portal files</p>
        <p className="mt-1 text-xs text-amber-100/80">
          {toErrorMessage(probe.error, "Router probe failed.")}
        </p>
      </div>
    );
  }

  const data = probe.data!;
  const tone =
    data.status === "matches"
      ? "emerald"
      : data.status === "outdated" || data.status === "partial"
        ? "amber"
        : data.status === "not_deployed"
          ? "border"
          : "amber";

  const borderClass =
    tone === "emerald"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
      : tone === "amber"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
        : "border-border/60 bg-black/20 text-muted-foreground";

  const title =
    data.status === "matches"
      ? "Portal already live on router"
      : data.status === "outdated"
        ? "Portal on router is outdated"
        : data.status === "partial"
          ? "Profiles point at different portal folders"
          : data.status === "not_deployed"
            ? "No Magic portal on router yet"
            : "Portal status unknown";

  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${borderClass}`}>
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-xs opacity-90">{data.summary}</p>
      {data.liveDirectory && data.status !== "not_deployed" && (
        <p className="mt-1 text-[11px] opacity-75">
          Live folder: <span className="font-mono">{data.liveDirectory}</span>
          {data.orphanDirectories.length > 0 && (
            <>
              {" "}
              · {data.orphanDirectories.length} orphan folder
              {data.orphanDirectories.length === 1 ? "" : "s"} queued for cleanup
            </>
          )}
        </p>
      )}
    </div>
  );
}
