import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { deviceLimits, requestDeviceSlot } from "@/lib/devices.functions";
import { toErrorMessage } from "@/lib/error-message";

const LABEL = {
  routers: "router",
  controllers: "AP controller",
  sites: "site",
} as const;

/**
 * Shows how many devices of one kind the account may add and lets the user ask
 * the app owner for one more slot when they've hit the limit.
 */
export function DeviceLimitCard({ kind }: { kind: "routers" | "controllers" | "sites" }) {
  const qc = useQueryClient();
  const fetchLimits = useServerFn(deviceLimits);
  const q = useQuery({
    queryKey: ["device-limits"],
    queryFn: () => fetchLimits(),
    staleTime: 60_000,
  });
  const requestFn = useServerFn(requestDeviceSlot);
  const req = useMutation({
    mutationFn: () => requestFn({ data: { kind } }),
    onSuccess: (r) => {
      toast.success(
        r.alreadyPending
          ? "Your request is already waiting for owner approval."
          : "Request sent — the app owner will review it.",
      );
      qc.invalidateQueries({ queryKey: ["device-limits"] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  if (!q.data || q.data.privileged) return null;
  const used = q.data.used[kind];
  const max = q.data.allow[kind];
  const atLimit = used >= max;
  const pending = q.data.pending.some((p) => p.kind === kind);

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-[color:var(--glass-border)] bg-white/5 px-3 py-2.5 text-[11px] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <span className={`min-w-0 ${atLimit ? "text-warning" : "text-muted-foreground"}`}>
        {used} of {max} {LABEL[kind]}
        {max === 1 ? "" : "s"} used
        {atLimit ? " — at your plan limit. Request another slot from the app owner." : "."}
      </span>
      {atLimit && (
        <span className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {pending ? (
            <span className="chip self-start">Approval pending</span>
          ) : (
            <button
              type="button"
              className="min-h-11 rounded-full border border-[color:var(--glass-border)] bg-white/5 px-3 sm:min-h-9"
              disabled={req.isPending}
              onClick={() => req.mutate()}
            >
              {req.isPending ? "Sending…" : "Request another"}
            </button>
          )}
        </span>
      )}
    </div>
  );
}

export default DeviceLimitCard;
