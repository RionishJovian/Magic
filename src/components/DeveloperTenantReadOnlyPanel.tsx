import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDeveloperTenantSnapshot } from "@/lib/developer-tenant-view.functions";
import { toErrorMessage } from "@/lib/error-message";

export type DeveloperTenantOption = { id: string; label: string };

export function DeveloperTenantReadOnlyPanel({ tenants }: { tenants: DeveloperTenantOption[] }) {
  const [tenantId, setTenantId] = useState("");
  const fetchSnapshot = useServerFn(getDeveloperTenantSnapshot);
  const snapshot = useQuery({
    queryKey: ["developer-tenant-read-only", tenantId],
    queryFn: () => fetchSnapshot({ data: { tenantId } }),
    enabled: Boolean(tenantId),
    staleTime: 30_000,
  });

  return (
    <section className="mb-4 rounded-xl border border-violet-400/30 bg-violet-500/5 p-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-violet-100">Developer Tenant View</p>
          <p className="mt-0.5 text-xs text-violet-100/75">
            Select a tenant to inspect its router configuration summary and voucher plans. This mode
            is read-only, audited, and does not impersonate the tenant.
          </p>
        </div>
        <label className="text-xs text-violet-100/85">
          Viewing tenant
          <select
            className="ml-2 rounded-md border border-violet-300/40 bg-surface px-2 py-1 text-foreground"
            value={tenantId}
            onChange={(event) => setTenantId(event.target.value)}
          >
            <option value="">Select tenant</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {snapshot.isLoading && (
        <p className="mt-3 text-xs text-muted-foreground">Loading read-only tenant view…</p>
      )}
      {snapshot.isError && (
        <p className="mt-3 text-xs text-destructive">
          {toErrorMessage(snapshot.error, "Could not load tenant view")}
        </p>
      )}
      {snapshot.data && (
        <div className="mt-3 space-y-3">
          <div className="rounded-md border border-violet-300/25 bg-background/20 px-2.5 py-2 text-xs">
            <span className="font-semibold text-violet-100">
              Viewing {snapshot.data.tenant.displayName} — Read-only
            </span>
            <span className="ml-2 text-muted-foreground">
              No tenant identity, permissions, or data is changed.
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-md border border-border/60 p-2.5 text-xs">
              <p className="font-medium text-foreground">Portal configuration</p>
              {snapshot.data.portal ? (
                <dl className="mt-1 space-y-1 text-muted-foreground">
                  <div>
                    <dt className="inline">Business: </dt>
                    <dd className="inline text-foreground">
                      {snapshot.data.portal.businessName ?? "Not set"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline">Guest mode: </dt>
                    <dd className="inline text-foreground">
                      {snapshot.data.portal.guestMode ?? "Not set"}
                    </dd>
                  </div>
                  <div>
                    <dt className="inline">Voucher-only: </dt>
                    <dd className="inline text-foreground">
                      {snapshot.data.portal.voucherLoginOnly ? "Yes" : "No"}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-1 text-muted-foreground">No portal configuration yet.</p>
              )}
            </div>
            <div className="rounded-md border border-border/60 p-2.5 text-xs">
              <p className="font-medium text-foreground">Voucher-code status</p>
              <p className="mt-1 text-muted-foreground">
                {Object.keys(snapshot.data.voucherCounts).length
                  ? Object.entries(snapshot.data.voucherCounts)
                      .map(([status, count]) => `${status}: ${count}`)
                      .join(" · ")
                  : "No voucher codes"}
              </p>
            </div>
          </div>
          <div className="rounded-md border border-border/60 p-2.5 text-xs">
            <p className="font-medium text-foreground">Routers · configuration summary</p>
            {snapshot.data.routers.length ? (
              <ul className="mt-2 divide-y divide-border/50">
                {snapshot.data.routers.map((router) => (
                  <li key={router.id} className="py-1.5 text-muted-foreground first:pt-0 last:pb-0">
                    <span className="font-medium text-foreground">{router.name}</span>
                    <span>
                      {" "}
                      · {router.connectionMode ?? "unknown mode"} ·{" "}
                      {router.cloudStatus ?? "pending"} · TLS {router.useTls ? "on" : "off"}
                    </span>
                    {router.allowInsecureTls && (
                      <span className="text-amber-200"> · self-signed exception</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted-foreground">No physical routers.</p>
            )}
          </div>
          <div className="rounded-md border border-border/60 p-2.5 text-xs">
            <p className="font-medium text-foreground">Voucher plan templates</p>
            {snapshot.data.voucherPlans.length ? (
              <ul className="mt-2 divide-y divide-border/50">
                {snapshot.data.voucherPlans.map((plan) => (
                  <li key={plan.id} className="py-1.5 text-muted-foreground first:pt-0 last:pb-0">
                    <span className="font-medium text-foreground">{plan.label}</span>
                    <span>
                      {" "}
                      · {plan.status} · {plan.priceLabel ?? `${plan.priceMmk} MMK`}
                    </span>
                    {plan.durationLabel && <span> · {plan.durationLabel}</span>}
                    {plan.dataQuotaMb != null && <span> · {plan.dataQuotaMb} MB</span>}
                    {plan.rateLimit && <span> · {plan.rateLimit}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted-foreground">No voucher plans.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
