import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, ChevronDown } from "lucide-react";
import {
  listDeployableRouters,
  listPlans,
  savePlan,
  deletePlan,
  pushPlansToRouter,
  issuePlanVouchers,
  getTicketActivationPref,
  saveTicketActivationPref,
} from "@/lib/portal.functions";
import type {
  PushedVoucherProfile,
  PlanPushPlanResult,
  PushPlansScope,
} from "@/lib/portal.functions";
import { fmtMMK, APP_TZ_LABEL } from "@/lib/time";
import { Switch } from "@/components/ui/switch";
import { TypedConfirmDialog } from "@/components/TypedConfirmDialog";
import { REMOVE_PLANS_PHRASE } from "@/lib/device-removal";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useSelectedSite } from "@/hooks/useSelectedSite";
import { toErrorMessage } from "@/lib/error-message";
import {
  classifyVoucherPlan,
  dedupeVoucherPlans,
  groupVoucherPlans,
  isArchivedVoucherPlan,
  planLimitLabel,
  type PlanGroupId,
} from "@/lib/portal/plan-groups";

type PlanDraft = {
  id?: string;
  plan_key: string;
  label: string;
  duration_label: string;
  duration_minutes: number | null;
  device_limit: number;
  rate_limit: string | null;
  price_mmk: number;
  is_vip: boolean;
  manual_code: string | null;
  sort: number;
  data_quota_mb?: number | null;
  validity_days?: number | null;
  status?: "active" | "inactive";
};

export function PlansPanel({
  routerId: routerIdProp,
  routerName,
  hideRouterPicker,
  onIssued,
}: {
  routerId?: string;
  routerName?: string;
  hideRouterPicker?: boolean;
  onIssued?: () => void;
} = {}) {
  const qc = useQueryClient();
  const fetchPlans = useServerFn(listPlans);
  const fetchRouters = useServerFn(listDeployableRouters);
  const save = useServerFn(savePlan);
  const remove = useServerFn(deletePlan);
  const push = useServerFn(pushPlansToRouter);
  const issue = useServerFn(issuePlanVouchers);
  const fetchAlertPref = useServerFn(getTicketActivationPref);
  const saveAlertPref = useServerFn(saveTicketActivationPref);
  const t = useT();
  const { site: selectedSite } = useSelectedSite();

  const plans = useQuery({ queryKey: ["portal-plans"], queryFn: () => fetchPlans() });
  const alertPref = useQuery({
    queryKey: ["ticket-activation-pref"],
    queryFn: () => fetchAlertPref(),
  });
  const routers = useQuery({
    queryKey: ["deployable-routers"],
    queryFn: () => fetchRouters(),
    enabled: !hideRouterPicker,
  });
  const siteRouters = useMemo(
    () => (routers.data ?? []).filter((r) => (selectedSite ? r.site_id === selectedSite.id : true)),
    [routers.data, selectedSite],
  );
  const [internalRouterId, setInternalRouterId] = useState<string>("");
  const [count, setCount] = useState(10);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<
    { kind: "replace" } | { kind: "delete"; id: string; label: string } | null
  >(null);
  const [pushScope, setPushScope] = useState<PushPlansScope>("default");
  const [recentlyPushed, setRecentlyPushed] = useState<{
    routerId: string;
    at: number;
    profiles: PushedVoucherProfile[];
  } | null>(null);
  const [lastPushOutcome, setLastPushOutcome] = useState<{
    routerId: string;
    at: number;
    ok: boolean;
    planResults: PlanPushPlanResult[];
    summaryError: string | null;
  } | null>(null);

  useEffect(() => {
    if (routerIdProp) return;
    if (internalRouterId && siteRouters.some((r) => r.id === internalRouterId)) return;
    if (siteRouters[0]?.id) setInternalRouterId(siteRouters[0].id);
    else if (internalRouterId) setInternalRouterId("");
  }, [siteRouters, internalRouterId, routerIdProp]);

  const routerId = routerIdProp || internalRouterId;

  const groups = useMemo(
    () =>
      groupVoucherPlans(
        dedupeVoucherPlans((plans.data ?? []) as unknown as PlanDraft[]).filter(
          (plan) => !isArchivedVoucherPlan(plan),
        ),
      ),
    [plans.data],
  );

  const saveMut = useMutation({
    mutationFn: (d: PlanDraft) => save({ data: d }),
    onSuccess: () => {
      toast.success("Plan saved");
      qc.invalidateQueries({ queryKey: ["portal-plans"] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const delMut = useMutation({
    mutationFn: (input: { id: string; confirmation: string }) => remove({ data: input }),
    onSuccess: () => {
      setPending(null);
      qc.invalidateQueries({ queryKey: ["portal-plans"] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const pushMut = useMutation({
    mutationFn: (input: { mode: "add" | "replace"; confirmation?: string }) =>
      push({
        data: {
          routerIds: [routerId],
          mode: input.mode,
          scope: pushScope,
          confirmation: input.confirmation,
        },
      }),
    onSuccess: (r) => {
      const bad = r.results.filter((x) => !x.ok);
      const first = r.results.find((x) => x.routerId === routerId) ?? r.results[0];
      const planResults = (first?.planResults ?? []) as PlanPushPlanResult[];
      const failedPlans = planResults.filter((p) => !p.ok);
      setLastPushOutcome({
        routerId: String(first?.routerId ?? routerId),
        at: Date.now(),
        ok: Boolean(first?.ok),
        planResults,
        summaryError: first?.error ?? null,
      });
      if (bad.length) {
        if (failedPlans.length > 0) {
          toast.error(
            `${failedPlans.length} of ${planResults.length} profile(s) failed — see details below`,
          );
        } else {
          toast.error(bad[0]!.error ?? "Push failed");
        }
      } else {
        const n = first?.profilesWritten?.length ?? first?.written ?? 0;
        toast.success(
          r.mode === "replace"
            ? `Old plans removed — ${n} profile(s) on the board`
            : `${n} profile(s) landed on the board`,
        );
      }
      if (first && "timezoneWarning" in first && first.timezoneWarning) {
        toast.message("Timezone not set on router", {
          description: String(first.timezoneWarning),
        });
      }
      if (r.mode === "replace") setPending(null);

      setRecentlyPushed({
        routerId: String(first?.routerId ?? routerId),
        at: Date.now(),
        profiles: (first?.profilesWritten ?? []) as PushedVoucherProfile[],
      });
      void qc.invalidateQueries({ queryKey: ["magic-go-live"] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const issueMut = useMutation({
    mutationFn: (planId: string) => issue({ data: { planId, routerId, count } }),
    onSuccess: (r) => {
      const failed = r.failed?.length ?? 0;
      if (failed > 0) {
        toast.message(`${r.issued.length} created, ${failed} failed`, {
          description: r.failed?.[0]?.error,
        });
      } else {
        toast.success(`${r.issued.length} code(s) created on the board`);
      }
      qc.invalidateQueries({ queryKey: ["snapshot"] });
      void qc.invalidateQueries({ queryKey: ["magic-go-live"] });
      onIssued?.();
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const alertMut = useMutation({
    mutationFn: (enabled: boolean) => saveAlertPref({ data: { enabled } }),
    onMutate: async (enabled) => {
      await qc.cancelQueries({ queryKey: ["ticket-activation-pref"] });
      const prev = qc.getQueryData<{ enabled: boolean }>(["ticket-activation-pref"]);
      qc.setQueryData(["ticket-activation-pref"], { enabled });
      return { prev };
    },
    onSuccess: (r) => {
      toast.success(r.enabled ? "Real-time notifications on" : "Real-time notifications off");
    },
    onError: (e: Error, _enabled, ctx) => {
      if (ctx?.prev) qc.setQueryData(["ticket-activation-pref"], ctx.prev);
      toast.error(toErrorMessage(e));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["ticket-activation-pref"] });
    },
  });

  return (
    <section className="panel space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Voucher plans</h2>
          <p className="text-[11px] text-muted-foreground">
            {t.copy(
              "One device per code. Open a plan only when you need to change price or limits.",
            )}{" "}
            Times follow app time ({APP_TZ_LABEL}).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!hideRouterPicker && (
            <select
              className="input min-h-[36px] text-xs"
              value={routerId}
              onChange={(e) => setInternalRouterId(e.target.value)}
              aria-label="Router to apply plans to"
            >
              {siteRouters.length === 0 && (
                <option value="">
                  {selectedSite ? `No routers on ${selectedSite.name}` : "No routers yet"}
                </option>
              )}
              {siteRouters.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
          <select
            className="input min-h-[36px] text-xs"
            value={pushScope}
            onChange={(e) => setPushScope(e.target.value as PushPlansScope)}
            aria-label="Voucher profiles scope to push"
          >
            <option value="default">Default voucher profiles</option>
            <option value="all">All voucher profiles</option>
            <option value="time">Time profiles only</option>
            <option value="data">Default data profiles only</option>
            <option value="custom">Custom profiles only</option>
          </select>
          <button
            onClick={() => pushMut.mutate({ mode: "add" })}
            disabled={!routerId || pushMut.isPending}
            className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
          >
            {pushMut.isPending && pending?.kind !== "replace" ? "Working…" : "Add to router"}
          </button>
          <button
            onClick={() => setPending({ kind: "replace" })}
            disabled={!routerId || pushMut.isPending}
            className="rounded-md border border-danger/50 px-3 py-2 text-xs text-danger disabled:opacity-60"
          >
            Remove old plans and save new plans
          </button>
        </div>
      </div>

      {lastPushOutcome?.routerId === routerId && lastPushOutcome.planResults.length > 0 && (
        <section
          className={`rounded-xl border p-3 text-xs ${
            lastPushOutcome.ok
              ? "border-emerald-400/30 bg-emerald-400/5"
              : "border-warning/40 bg-warning/5"
          }`}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold">
              {lastPushOutcome.ok ? "All profiles landed" : "Push finished with errors"}
            </p>
            <p className="text-muted-foreground">
              {new Date(lastPushOutcome.at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          {lastPushOutcome.summaryError &&
            !lastPushOutcome.ok &&
            failedPlansOnly(lastPushOutcome.planResults).length === 0 && (
              <p className="mt-2 text-[11px] text-danger">{lastPushOutcome.summaryError}</p>
            )}
          <ul className="mt-2 space-y-1">
            {lastPushOutcome.planResults.map((row) => (
              <li
                key={row.hotspotProfile}
                className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border/50 bg-surface/40 px-2 py-1.5"
              >
                <div className="min-w-0">
                  <span className="font-medium">{row.planLabel}</span>
                  <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                    {row.hotspotProfile}
                  </span>
                </div>
                {row.ok ? (
                  <span className="shrink-0 text-[10px] font-semibold text-emerald-400">
                    {row.action === "updated" ? "Updated" : "Added"}
                  </span>
                ) : (
                  <span
                    className="min-w-0 shrink-0 text-[10px] text-danger"
                    title={row.error ?? undefined}
                  >
                    {row.error ?? "Failed"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {recentlyPushed?.routerId &&
        recentlyPushed.routerId === routerId &&
        recentlyPushed.profiles.length > 0 && (
          <section className="rounded-xl border border-border/60 bg-surface/40 p-3 text-xs">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">Recently added to {routerName ?? "router"}</p>
              <p className="text-muted-foreground">
                {new Date(recentlyPushed.at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {recentlyPushed.profiles.slice(0, 10).map((p) => (
                <span
                  key={`${p.planKey}:${p.hotspotProfile}`}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    p.action === "created"
                      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                      : "border-sky-400/40 bg-sky-400/10 text-sky-200"
                  }`}
                  title={p.hotspotProfile}
                >
                  {p.action === "created" ? "Added" : "Updated"} · {p.planLabel}
                </span>
              ))}
              {recentlyPushed.profiles.length > 10 && (
                <span className="text-muted-foreground">
                  +{recentlyPushed.profiles.length - 10} more
                </span>
              )}
            </div>
          </section>
        )}

      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/60 p-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400"
          aria-hidden
        >
          <Bell className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t.label("Real-time notifications")}</p>
          <p className="text-[11px] text-muted-foreground">
            {t.copy("Receive automatic notifications the exact moment a ticket is activated.")}
          </p>
        </div>
        <Switch
          checked={Boolean(alertPref.data?.enabled)}
          disabled={alertPref.isLoading || alertMut.isPending}
          onCheckedChange={(on) => alertMut.mutate(on)}
          aria-label="Real-time notifications"
        />
      </div>

      <div className="space-y-4">
        {groups.map((g) => (
          <PlanGroup
            key={g.id}
            id={g.id}
            title={g.id === "time" ? t.ui("Time") : g.id === "data" ? t.ui("Data") : t.ui("Custom")}
            plans={g.plans}
            openId={openId}
            onToggle={(id) => setOpenId((cur) => (cur === id ? null : id))}
            onSave={(d) => saveMut.mutate(d)}
            onDelete={(p) => {
              if (p.id) setPending({ kind: "delete", id: p.id, label: p.label });
            }}
            onIssue={(p) => p.id && issueMut.mutate(p.id)}
            issuing={issueMut.isPending}
            canIssue={Boolean(routerId)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <label className="flex items-center gap-2">
          Codes to create per batch
          <input
            type="number"
            min={1}
            max={100}
            className="input w-20"
            value={count}
            onChange={(e) => setCount(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
          />
        </label>
        <button
          onClick={() =>
            saveMut.mutate({
              plan_key: `custom-${Date.now().toString(36)}`,
              label: "New plan",
              duration_label: "1 hour",
              duration_minutes: 60,
              device_limit: 1,
              rate_limit: "5M/5M",
              price_mmk: 500,
              is_vip: false,
              manual_code: null,
              sort: (plans.data?.length ?? 0) + 1,
              data_quota_mb: null,
              validity_days: 30,
              status: "active",
            })
          }
          className="rounded-md border border-border px-3 py-2"
        >
          + Add plan
        </button>
      </div>

      <TypedConfirmDialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={
          pending?.kind === "delete"
            ? t.copy("Delete the {name} plan?", { name: pending.label })
            : t.copy("Remove the voucher plans on {name}?", {
                name:
                  routerName ||
                  siteRouters.find((r) => r.id === routerId)?.name ||
                  routers.data?.find((r) => r.id === routerId)?.name ||
                  "this router",
              })
        }
        description={
          pending?.kind === "delete"
            ? t.copy(
                "This plan is already in use. Continue, then type the confirmation phrase. Removing it from the catalog does not delete codes already on the router.",
              )
            : t.copy(
                "This router already has voucher plans from the app. Continue, then type the confirmation phrase. Only the profiles in the selected scope are deleted and re-saved; plans outside that scope stay on the device.",
              )
        }
        typeHint={t.copy("Type the English phrase below exactly to confirm.")}
        phrase={REMOVE_PLANS_PHRASE}
        confirmLabel={pending?.kind === "delete" ? "Delete" : "Remove"}
        pending={pending?.kind === "delete" ? delMut.isPending : pushMut.isPending}
        pendingLabel={pending?.kind === "delete" ? "Deleting…" : "Removing…"}
        onConfirm={(typed) => {
          if (pending?.kind === "delete") delMut.mutate({ id: pending.id, confirmation: typed });
          else pushMut.mutate({ mode: "replace", confirmation: typed });
        }}
      />
    </section>
  );
}

function failedPlansOnly(rows: PlanPushPlanResult[]): PlanPushPlanResult[] {
  return rows.filter((r) => !r.ok);
}

function PlanGroup({
  id,
  title,
  plans,
  openId,
  onToggle,
  onSave,
  onDelete,
  onIssue,
  issuing,
  canIssue,
}: {
  id: PlanGroupId;
  title: string;
  plans: PlanDraft[];
  openId: string | null;
  onToggle: (id: string) => void;
  onSave: (d: PlanDraft) => void;
  onDelete: (p: PlanDraft) => void;
  onIssue: (p: PlanDraft) => void;
  issuing: boolean;
  canIssue: boolean;
}) {
  return (
    <section aria-labelledby={`plan-group-${id}`}>
      <div className="mb-1.5 flex items-baseline justify-between px-0.5">
        <h3
          id={`plan-group-${id}`}
          className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {title}
        </h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">{plans.length}</span>
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface/60">
        {plans.map((p) => {
          const rowId = p.id ?? p.plan_key;
          return (
            <PlanRow
              key={rowId}
              plan={p}
              open={openId === rowId}
              onToggle={() => onToggle(rowId)}
              onSave={onSave}
              onDelete={() => onDelete(p)}
              onIssue={() => onIssue(p)}
              issuing={issuing}
              canIssue={canIssue}
            />
          );
        })}
      </div>
    </section>
  );
}

function PlanRow({
  plan,
  open,
  onToggle,
  onSave,
  onDelete,
  onIssue,
  issuing,
  canIssue,
}: {
  plan: PlanDraft;
  open: boolean;
  onToggle: () => void;
  onSave: (d: PlanDraft) => void;
  onDelete: () => void;
  onIssue: () => void;
  issuing: boolean;
  canIssue: boolean;
}) {
  const [d, setD] = useState<PlanDraft>(plan);
  const [details, setDetails] = useState(false);
  useEffect(() => setD(plan), [plan]);
  useEffect(() => {
    if (!open) setDetails(false);
  }, [open]);

  const kind = classifyVoucherPlan(d);
  const hidden = d.status === "inactive";
  const devices =
    d.device_limit > 0
      ? `${d.device_limit} device${d.device_limit === 1 ? "" : "s"}`
      : "Unlimited devices";

  return (
    <div className={cn(open && "bg-background/40")}>
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{d.label}</span>
              {hidden && <span className="chip text-muted-foreground">Hidden</span>}
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              {planLimitLabel(d)} · {devices}
            </p>
          </div>
          <span className="shrink-0 tabular-nums text-sm font-medium">{fmtMMK(d.price_mmk)}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
        <div className="flex items-center pr-2">
          <button
            type="button"
            onClick={onIssue}
            disabled={!canIssue || issuing || !plan.id}
            className="rounded-md border border-border px-2.5 py-1.5 text-[11px] disabled:opacity-60"
          >
            {issuing ? "Creating…" : "Create"}
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 block sm:col-span-1">
              <span className="mb-1 block text-muted-foreground">Name</span>
              <input
                className="input font-semibold"
                value={d.label}
                onChange={(e) => setD({ ...d, label: e.target.value })}
                aria-label="Plan name"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-muted-foreground">Price (MMK)</span>
              <input
                type="number"
                min={0}
                required
                className="input"
                value={d.price_mmk}
                onChange={(e) =>
                  setD({ ...d, price_mmk: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            </label>
            {kind === "data" ? (
              <label className="block">
                <span className="mb-1 block text-muted-foreground">Data (MB)</span>
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={d.data_quota_mb ?? ""}
                  onChange={(e) =>
                    setD({ ...d, data_quota_mb: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </label>
            ) : d.is_vip ? (
              <label className="block">
                <span className="mb-1 block text-muted-foreground">VIP code</span>
                <input
                  className="input font-mono uppercase"
                  value={d.manual_code ?? ""}
                  onChange={(e) => setD({ ...d, manual_code: e.target.value.toUpperCase() })}
                />
              </label>
            ) : (
              <label className="block">
                <span className="mb-1 block text-muted-foreground">Minutes</span>
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={d.duration_minutes ?? ""}
                  onChange={(e) =>
                    setD({
                      ...d,
                      duration_minutes: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-muted-foreground">On guest portal</span>
              <select
                className="input"
                value={d.status ?? "active"}
                onChange={(e) => setD({ ...d, status: e.target.value as "active" | "inactive" })}
              >
                <option value="active">Active</option>
                <option value="inactive">Hidden</option>
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={() => setDetails((v) => !v)}
            className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {details ? "Hide details" : "More details"}
          </button>

          {details && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-muted-foreground">Duration label</span>
                <input
                  className="input"
                  value={d.duration_label}
                  onChange={(e) => setD({ ...d, duration_label: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-muted-foreground">Devices per code</span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  className="input"
                  value={d.device_limit}
                  onChange={(e) => setD({ ...d, device_limit: Number(e.target.value) || 0 })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-muted-foreground">Speed</span>
                <input
                  className="input"
                  placeholder="5M/5M"
                  disabled={d.is_vip}
                  value={d.rate_limit ?? ""}
                  onChange={(e) => setD({ ...d, rate_limit: e.target.value || null })}
                />
              </label>
              {kind !== "data" && (
                <label className="block">
                  <span className="mb-1 block text-muted-foreground">Data quota (MB)</span>
                  <input
                    type="number"
                    min={0}
                    className="input"
                    value={d.data_quota_mb ?? ""}
                    onChange={(e) =>
                      setD({ ...d, data_quota_mb: e.target.value ? Number(e.target.value) : null })
                    }
                  />
                </label>
              )}
              {kind === "data" && (
                <label className="block">
                  <span className="mb-1 block text-muted-foreground">Minutes</span>
                  <input
                    type="number"
                    min={0}
                    className="input"
                    disabled={d.is_vip}
                    value={d.duration_minutes ?? ""}
                    onChange={(e) =>
                      setD({
                        ...d,
                        duration_minutes: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </label>
              )}
              <label className="block">
                <span className="mb-1 block text-muted-foreground">Validity (days)</span>
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={d.validity_days ?? ""}
                  onChange={(e) =>
                    setD({ ...d, validity_days: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </label>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={() => onSave(d)}
              className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground"
            >
              Save
            </button>
            <button
              onClick={onDelete}
              className="rounded-md border border-danger/50 px-3 py-1.5 text-danger"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
