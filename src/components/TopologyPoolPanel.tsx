import type { SiteTopologySnapshot } from "@/lib/topology/types";

const HEALTH_STYLE: Record<
  SiteTopologySnapshot["poolHealth"],
  { border: string; bg: string; label: string }
> = {
  shared_ok: {
    border: "border-emerald-500/35",
    bg: "bg-emerald-500/10",
    label: "Shared pool OK",
  },
  high_usage: {
    border: "border-amber-500/35",
    bg: "bg-amber-500/10",
    label: "Pool nearly full",
  },
  split_pools: {
    border: "border-red-500/35",
    bg: "bg-red-500/10",
    label: "Split pools",
  },
  missing_pool: {
    border: "border-amber-500/35",
    bg: "bg-amber-500/10",
    label: "Pool missing",
  },
  no_dhcp_on_bridge: {
    border: "border-amber-500/35",
    bg: "bg-amber-500/10",
    label: "No DHCP on bridge",
  },
  no_hotspot: {
    border: "border-amber-500/35",
    bg: "bg-amber-500/10",
    label: "No hotspot server",
  },
  unknown: {
    border: "border-zinc-500/35",
    bg: "bg-zinc-500/10",
    label: "Pool status unknown",
  },
};

function usageBarColor(pct: number | null): string {
  if (pct == null) return "bg-zinc-500";
  if (pct >= 90) return "bg-red-500";
  if (pct >= 75) return "bg-amber-500";
  return "bg-emerald-500";
}

export function TopologyPoolPanel({ snapshot }: { snapshot: SiteTopologySnapshot }) {
  const style = HEALTH_STYLE[snapshot.poolHealth] ?? HEALTH_STYLE.unknown;
  const pool = snapshot.guestPool;
  const pct = pool?.usagePct ?? null;

  return (
    <section className={`space-y-3 rounded-xl border p-4 ${style.border} ${style.bg}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Guest IP pool</h2>
          <p className="text-xs text-muted-foreground">
            Hotspot and LAN DHCP should share one pool on{" "}
            {snapshot.hotspotBridge ?? "the LAN bridge"}.
          </p>
        </div>
        <span className="rounded-full border border-border/60 bg-black/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
          {style.label}
        </span>
      </div>

      <p className="text-xs leading-relaxed text-foreground/90">{snapshot.poolHealthDetail}</p>

      {pool && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-mono font-medium">{pool.name}</span>
            {pool.ranges && <span className="text-muted-foreground">{pool.ranges}</span>}
            {pool.total > 0 && (
              <span className="text-muted-foreground">
                {pool.used}/{pool.total}
                {pct != null ? ` (${pct}%)` : ""}
              </span>
            )}
          </div>
          {pool.total > 0 && (
            <div className="h-2 overflow-hidden rounded-full bg-black/30">
              <div
                className={`h-full rounded-full transition-all ${usageBarColor(pct)}`}
                style={{ width: `${Math.max(pct ?? 0, pool.used > 0 ? 4 : 0)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {snapshot.poolBindings.length > 0 && (
        <ul className="space-y-1 text-[11px] text-muted-foreground">
          {snapshot.poolBindings.map((b) => (
            <li key={`${b.role}-${b.serverName}`} className="font-mono">
              {b.role === "hotspot" ? "Hotspot" : "DHCP"} {b.serverName} on {b.interface || "?"}
              {b.addressPool ? ` → ${b.addressPool}` : " → (no pool)"}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
