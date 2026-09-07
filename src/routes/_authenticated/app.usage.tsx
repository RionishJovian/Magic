import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getMe } from "@/lib/auth.functions";
import { isPrivilegedAccount } from "@/lib/app-role";
import { aiUsageSummary, type UsageRow } from "@/lib/usage.functions";
import { listDeviceRequests, decideDeviceRequest } from "@/lib/devices.functions";
import { DelayedFallback, SkeletonContent, SkeletonCard } from "@/components/ui/skeleton";
import { toErrorMessage } from "@/lib/error-message";

export const Route = createFileRoute("/_authenticated/app/usage")({
  head: () => ({
    meta: [
      { title: "Credit usage · MikroTik Magic" },
      {
        name: "description",
        content: "AI credit usage per account and feature, plus device-slot approval requests.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: UsagePage,
});

function Bar({ rows }: { rows: UsageRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.tokens));
  if (rows.length === 0)
    return <p className="mt-3 text-xs text-muted-foreground">No activity in this window.</p>;
  return (
    <ul className="mt-3 space-y-2">
      {rows.slice(0, 10).map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between text-xs">
            <span className="truncate font-medium">{r.key}</span>
            <span className="text-muted-foreground">
              {r.calls} calls · {r.tokens.toLocaleString()} tokens
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
            <div
              className="h-full rounded-full bg-primary/70"
              style={{ width: `${Math.round((r.tokens / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function UsagePage() {
  const fetchMe = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => fetchMe(), staleTime: 300_000 });
  const roles = me.data?.roles ?? [];
  const privileged = isPrivilegedAccount(roles, me.data?.isPlatformAdmin);

  const [days, setDays] = useState(30);
  const fetchUsage = useServerFn(aiUsageSummary);
  const usage = useQuery({
    queryKey: ["ai-usage", days],
    queryFn: () => fetchUsage({ data: { days } }),
    enabled: privileged,
    staleTime: 60_000,
  });

  const qc = useQueryClient();
  const fetchRequests = useServerFn(listDeviceRequests);
  const requests = useQuery({
    queryKey: ["device-requests"],
    queryFn: () => fetchRequests(),
    enabled: privileged,
    staleTime: 30_000,
  });
  const decideFn = useServerFn(decideDeviceRequest);
  const decide = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) => decideFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.approve ? "Extra device slot approved" : "Request denied");
      qc.invalidateQueries({ queryKey: ["device-requests"] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  if (me.isLoading) return null;
  if (!privileged) return <Navigate to="/app" />;

  const d = usage.data;

  return (
    <div className="space-y-4">
      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Credit usage</h1>
            <p className="text-xs text-muted-foreground">
              Every AI Gateway call this app makes, attributed to the account and the feature that
              triggered it.
            </p>
          </div>
          <div className="flex gap-1">
            {[7, 30, 90].map((n) => (
              <button
                key={n}
                onClick={() => setDays(n)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  days === n
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                {n}d
              </button>
            ))}
          </div>
        </div>

        {usage.isLoading && (
          <DelayedFallback
            loading
            label="Loading usage"
            fallback={
              <div className="mt-4 space-y-4">
                <SkeletonCard />
                <SkeletonContent lines={4} />
              </div>
            }
          />
        )}
        {usage.error && (
          <p className="mt-4 text-sm text-danger">{(usage.error as Error).message}</p>
        )}

        {d && (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                { label: "AI calls", value: d.totalCalls.toLocaleString() },
                { label: "Tokens", value: d.totalTokens.toLocaleString() },
                { label: "Est. credits", value: d.estimatedCredits.toFixed(2) },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {s.label}
                  </div>
                  <div className="mt-1 text-xl font-semibold">{s.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <h2 className="text-sm font-semibold">By account</h2>
                <Bar rows={d.byUser} />
              </div>
              <div>
                <h2 className="text-sm font-semibold">By feature</h2>
                <Bar rows={d.byFeature} />
              </div>
            </div>
          </>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="text-sm font-semibold">Cost-effective settings</h2>
        <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
          <li>
            • Automatic hourly fleet scans are off — scans run only when someone asks for one.
          </li>
          <li>
            • Client accounts get 30 AI scans per month (resets on the 1st). Owners and admins are
            unlimited. Owners can change any account's monthly grant in Users.
          </li>
          <li>• Fleet health, telemetry and traffic graphs are rule-based and cost nothing.</li>
          <li>
            • Syslog AI translation batches events, so translate in bulk rather than one by one.
          </li>
          <li>• Router and device limits keep snapshot payloads (and tokens per scan) small.</li>
        </ul>
      </section>

      <section className="panel p-5">
        <h2 className="text-sm font-semibold">Extra device requests</h2>
        <p className="text-xs text-muted-foreground">
          Accounts are limited to one router, one access-point controller and one site. Approving a
          request raises that account's allowance by one.
        </p>
        {requests.data && requests.data.length === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">No requests yet.</p>
        )}
        <ul className="mt-3 space-y-2">
          {(requests.data ?? []).map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs"
            >
              <div className="min-w-0">
                <div className="font-medium">
                  {r.requester} · {r.kind}
                </div>
                {r.reason ? <div className="text-muted-foreground">{r.reason}</div> : null}
              </div>
              {r.status === "pending" ? (
                <div className="flex gap-2">
                  <button
                    className="rounded-full border border-success/50 px-3 py-1 text-success"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: r.id, approve: true })}
                  >
                    Approve
                  </button>
                  <button
                    className="rounded-full border border-border px-3 py-1"
                    disabled={decide.isPending}
                    onClick={() => decide.mutate({ id: r.id, approve: false })}
                  >
                    Deny
                  </button>
                </div>
              ) : (
                <span className="chip">{r.status}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
