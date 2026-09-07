import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { deviceLimits } from "@/lib/devices.functions";

const ROWS = [
  { key: "routers", label: "Routers" },
  { key: "controllers", label: "Access points" },
  { key: "sites", label: "Sites" },
] as const;

/**
 * Live "x of y used" meter for the signed-in account, shown on each pricing
 * card. Renders nothing for visitors who aren't signed in.
 */
export function PlanUsageMeter({ accent, unlimited }: { accent: string; unlimited?: boolean }) {
  const fetchLimits = useServerFn(deviceLimits);
  const q = useQuery({
    queryKey: ["device-limits"],
    queryFn: () => fetchLimits(),
    retry: false,
    staleTime: 30_000,
  });

  if (!q.data) return null;
  const { used, allow, privileged } = q.data;

  return (
    <div className="relative mt-4 rounded-2xl border border-[color:var(--glass-border)] bg-white/5 p-3.5">
      <div className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Your current usage
      </div>
      <ul className="mt-2.5 space-y-2">
        {ROWS.map((r) => {
          const u = used[r.key];
          const max = allow[r.key];
          const cap = privileged || unlimited ? null : max;
          const pct = cap ? Math.min(100, (u / Math.max(1, cap)) * 100) : 100;
          const atLimit = cap != null && u >= cap;
          return (
            <li key={r.key} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{r.label}</span>
                <span className={atLimit ? "font-semibold text-warning" : "font-semibold"}>
                  {u} {cap == null ? "used · unlimited" : `of ${cap} used`}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${pct}%`, background: accent }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2.5 text-[11px] text-muted-foreground">
        {privileged
          ? "Owner and developer accounts have no device limits."
          : unlimited
            ? "Amethyst removes device limits — your counters keep tracking usage only."
            : "Counters update automatically when your approved allowance changes."}
      </p>
    </div>
  );
}

export default PlanUsageMeter;
