import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  applyProvisioning,
  discoverRouterState,
  planProvisioning,
} from "@/lib/provisioning.functions";
import type {
  Finding,
  MultiWanIntent,
  ProvisioningPlan,
  WanLinkIntent,
  WanProvider,
} from "@/lib/provisioning/types";
import { copyText } from "@/lib/browser/clipboard";
import { useT } from "@/lib/i18n";
import { toErrorMessage } from "@/lib/error-message";
import {
  DEFAULT_MULTI_WAN_POLICY,
  emptyWanLink,
  nextWanLinkIndex,
  suggestMultiWanSetup,
} from "@/lib/provisioning/multi-wan-form";

type Props = { routerId: string; routerName: string; privileged: boolean };

const sevStyle: Record<Finding["severity"], string> = {
  blocker: "border-danger/50 bg-danger/10 text-danger",
  warning: "border-warning/50 bg-warning/10 text-warning",
  info: "border-[color:var(--glass-border)] bg-white/5 text-muted-foreground",
};

const actionStyle: Record<string, string> = {
  add: "text-success",
  modify: "text-warning",
  remove: "text-danger",
  skip: "text-muted-foreground",
};

function applyProviderDefaults(provider: WanProvider, link: WanLinkIntent): Partial<WanLinkIntent> {
  if (provider === "starlink") {
    return { provider, cgnat: true, wantsInbound: false };
  }
  return { provider };
}

/**
 * Multi-WAN intent editor with the staged plan → preflight → apply flow.
 * Planning never touches the device; applying needs the Reboot / Multi-WAN
 * grant (owner/admin always have it), the router name typed as confirmation,
 * and always takes a rollback backup first.
 */
export function MultiWanPanel({ routerId, routerName, privileged }: Props) {
  const t = useT();
  const discover = useServerFn(discoverRouterState);
  const plan = useServerFn(planProvisioning);
  const apply = useServerFn(applyProvisioning);

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<MultiWanIntent["mode"]>("failover");
  const [lanInterface, setLanInterface] = useState("");
  const [links, setLinks] = useState<WanLinkIntent[]>([emptyWanLink(1), emptyWanLink(2)]);
  const [policy] = useState<MultiWanIntent["policy"]>(DEFAULT_MULTI_WAN_POLICY);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [detectedWanInterfaces, setDetectedWanInterfaces] = useState<string[]>([]);
  const [ack, setAck] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [reviewedIntent, setReviewedIntent] = useState<string | null>(null);

  const intent: MultiWanIntent = useMemo(
    () => ({
      kind: "multi-wan",
      routerId,
      mode,
      lanInterface: lanInterface.trim(),
      allowManagementPathChange: ack,
      policy,
      links: links.map((l) => ({
        ...l,
        gateway: l.gateway?.trim() ? l.gateway.trim() : undefined,
        iface: l.iface.trim(),
        healthCheckTarget: l.healthCheckTarget.trim(),
        secondaryHealthCheckTarget: l.secondaryHealthCheckTarget?.trim() || undefined,
      })),
    }),
    [routerId, mode, lanInterface, ack, policy, links],
  );

  const serializedIntent = JSON.stringify(intent);
  const planIsCurrent = reviewedIntent === serializedIntent;

  const discoverMut = useMutation({
    mutationFn: () => discover({ data: { routerId } }),
    onSuccess: (snapshot) => {
      const suggestion = suggestMultiWanSetup(snapshot);
      setLinks(suggestion.links);
      setLanInterface(suggestion.lanInterface);
      setDetectedWanInterfaces(suggestion.detectedWanInterfaces);
      setReviewedIntent(null);
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const planMut = useMutation({
    mutationFn: (request: { intent: MultiWanIntent; serializedIntent: string }) =>
      plan({ data: { intent: request.intent } }),
    onSuccess: (_result, request) => setReviewedIntent(request.serializedIntent),
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });
  const applyMut = useMutation({
    mutationFn: () =>
      apply({
        data: { intent, confirmation, reviewedIntentHash: planMut.data?.plan.intentHash ?? "" },
      }),
    onSuccess: (res) => {
      if (res.outcome.ok) {
        toast.success("Applied and verified on the router.");
      } else if (res.outcome.rolledBack) {
        toast.error("Apply failed — the router was restored from its backup.");
      } else {
        toast.error(res.outcome.error ?? "Apply failed.");
      }
      planMut.mutate({ intent, serializedIntent });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  const result = planMut.data;
  const p: ProvisioningPlan | undefined = result?.plan;
  const ifaceOptions =
    discoverMut.data?.interfaces.map((i) => i.name) ??
    result?.device.interfaces.map((i) => i.name) ??
    [];
  const canApply =
    !!p &&
    planIsCurrent &&
    !p.blocked &&
    !p.noop &&
    privileged &&
    confirmation.trim() === routerName;
  const rosTooOld = p?.findings.some((f) => f.id === "os-too-old") ?? false;
  const manualScript = useMemo(() => {
    if (!p) return "";
    return p.steps
      .filter((s) => s.action !== "skip")
      .map((s) => s.command)
      .join("\n");
  }, [p]);

  const patch = (i: number, next: Partial<WanLinkIntent>) =>
    setLinks((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...next } : l)));

  const copyManualScript = async () => {
    if (!manualScript) return;
    const ok = await copyText(manualScript);
    toast[ok ? "success" : "error"](
      ok ? "Commands copied — paste into a RouterOS terminal." : "Could not copy to clipboard.",
    );
  };

  const buildDryRun = () => {
    const enabled = links.filter((link) => link.enabled);
    if (enabled.length < 2 || enabled.some((link) => !link.iface)) {
      toast.error("Select two different RouterOS interfaces before building the dry run.");
      return;
    }
    if (!lanInterface) {
      setAdvancedOpen(true);
      toast.error("Select the customer LAN or HotSpot bridge in Advanced settings.");
      return;
    }
    setConfirmation("");
    planMut.mutate({ intent, serializedIntent });
  };

  return (
    <div className="mt-3 rounded-xl border border-[color:var(--glass-border)] bg-white/5 p-3 text-xs">
      <button
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && !discoverMut.data && !discoverMut.isPending) discoverMut.mutate();
        }}
      >
        <span className="font-medium text-foreground">
          {t.label("Multi-WAN & failover")}
          <span className="ml-2 text-[10px] text-muted-foreground">
            {t.label("Plan, preflight and apply safely")}
          </span>
        </span>
        <span aria-hidden>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          <div className="rounded-lg border border-sky-400/30 bg-sky-500/10 p-3">
            <p className="font-medium text-foreground">Choose how this router uses two ISPs</p>
            <p className="mt-1 text-muted-foreground">
              MikroMagic reads the router first. It never guesses that a LAN switch port is an
              internet connection.
            </p>
            <div
              className="mt-3 grid gap-2 sm:grid-cols-2"
              role="radiogroup"
              aria-label="Multi-WAN mode"
            >
              <button
                type="button"
                role="radio"
                aria-checked={mode === "failover"}
                className={`rounded-lg border p-3 text-left transition ${
                  mode === "failover"
                    ? "border-primary bg-primary/15 ring-1 ring-primary/40"
                    : "border-[color:var(--glass-border)] bg-white/5 hover:border-primary/40"
                }`}
                onClick={() => {
                  setMode("failover");
                  setReviewedIntent(null);
                }}
              >
                <span className="flex items-center justify-between gap-2 font-medium text-foreground">
                  Automatic failover
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] text-success">
                    Recommended
                  </span>
                </span>
                <span className="mt-1 block text-muted-foreground">
                  Use the primary ISP normally and switch to backup only when both health checks
                  fail.
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === "balance"}
                className={`rounded-lg border p-3 text-left transition ${
                  mode === "balance"
                    ? "border-warning bg-warning/10 ring-1 ring-warning/40"
                    : "border-[color:var(--glass-border)] bg-white/5 hover:border-warning/40"
                }`}
                onClick={() => {
                  setMode("balance");
                  setReviewedIntent(null);
                }}
              >
                <span className="font-medium text-foreground">Load balance + failover</span>
                <span className="mt-1 block text-muted-foreground">
                  Advanced PCC mode spreads new connections across both ISPs and fails over when one
                  becomes unavailable.
                </span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="min-h-[36px] rounded-full border border-[color:var(--glass-border)] bg-white/5 px-3 py-1 transition hover:border-primary/50 hover:text-primary disabled:opacity-60"
              disabled={discoverMut.isPending}
              onClick={() => discoverMut.mutate()}
            >
              {discoverMut.isPending ? "Detecting router ports…" : "Detect router ports again"}
            </button>
            {discoverMut.data && (
              <span className={detectedWanInterfaces.length >= 2 ? "text-success" : "text-warning"}>
                {detectedWanInterfaces.length >= 2
                  ? `Found ${detectedWanInterfaces.length} WAN interfaces.`
                  : "Only one WAN is confirmed. Connect and configure WAN 2 before applying."}
              </span>
            )}
          </div>

          <div className="space-y-3">
            {links.map((l, i) => (
              <div
                key={l.key}
                className="space-y-2 rounded-lg border border-[color:var(--glass-border)] bg-white/5 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-foreground">
                    {mode === "failover"
                      ? i === 0
                        ? "Primary internet"
                        : `Backup internet ${i}`
                      : `Internet connection ${i + 1}`}
                  </p>
                  {links.length > 2 && (
                    <button
                      type="button"
                      className="text-danger hover:underline"
                      onClick={() =>
                        setLinks((current) => current.filter((_, index) => index !== i))
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-muted-foreground">Name</span>
                    <input
                      className="input w-full"
                      aria-label={`Uplink ${i + 1} name`}
                      value={l.label}
                      onChange={(e) => patch(i, { label: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-muted-foreground">
                      Router port / interface
                    </span>
                    <select
                      className="input w-full"
                      aria-label={`Uplink ${i + 1} interface`}
                      value={l.iface}
                      onChange={(e) => patch(i, { iface: e.target.value })}
                    >
                      <option value="">Select the ISP interface</option>
                      {ifaceOptions.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-muted-foreground">Provider</span>
                    <select
                      className="input w-full"
                      aria-label={`Uplink ${i + 1} provider`}
                      value={l.provider}
                      onChange={(e) => {
                        const provider = e.target.value as WanProvider;
                        patch(i, applyProviderDefaults(provider, l));
                      }}
                    >
                      <option value="fiber">ISP fiber</option>
                      <option value="starlink">Starlink</option>
                      <option value="lte">LTE / 5G</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  {mode === "balance" && (
                    <label className="block">
                      <span className="mb-1 block text-muted-foreground">Traffic share</span>
                      <select
                        className="input w-full"
                        aria-label={`Uplink ${i + 1} traffic share`}
                        value={l.weight}
                        onChange={(e) => patch(i, { weight: Number(e.target.value) })}
                      >
                        <option value={1}>Normal (1 share)</option>
                        <option value={2}>Double (2 shares)</option>
                        <option value={3}>Triple (3 shares)</option>
                        <option value={4}>Four shares</option>
                      </select>
                    </label>
                  )}
                </div>
                {advancedOpen && (
                  <div className="grid gap-2 border-t border-[color:var(--glass-border)] pt-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-muted-foreground">Gateway override</span>
                      <input
                        className="input w-full"
                        aria-label={`Uplink ${i + 1} gateway`}
                        placeholder="Auto-filled from RouterOS when available"
                        value={l.gateway ?? ""}
                        onChange={(e) => patch(i, { gateway: e.target.value })}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-muted-foreground">Primary health check</span>
                      <input
                        className="input w-full"
                        aria-label={`Uplink ${i + 1} primary health-check target`}
                        value={l.healthCheckTarget}
                        onChange={(e) => patch(i, { healthCheckTarget: e.target.value })}
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-muted-foreground">
                        Secondary health check
                      </span>
                      <input
                        className="input w-full"
                        aria-label={`Uplink ${i + 1} secondary health-check target`}
                        value={l.secondaryHealthCheckTarget ?? ""}
                        onChange={(e) => patch(i, { secondaryHealthCheckTarget: e.target.value })}
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={l.cgnat}
                          onChange={(e) =>
                            patch(i, {
                              cgnat: e.target.checked,
                              ...(e.target.checked ? { wantsInbound: false } : {}),
                            })
                          }
                        />
                        CGNAT / no public IP
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={l.wantsInbound}
                          disabled={l.cgnat}
                          onChange={(e) => patch(i, { wantsInbound: e.target.checked })}
                        />
                        Needs inbound access
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={l.enabled}
                          onChange={(e) => patch(i, { enabled: e.target.checked })}
                        />
                        Enabled
                      </label>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="min-h-[36px] rounded-full border border-[color:var(--glass-border)] bg-white/5 px-3 py-1 transition hover:border-primary/50 hover:text-primary"
                onClick={() =>
                  setLinks((current) => [...current, emptyWanLink(nextWanLinkIndex(current))])
                }
              >
                Add another uplink
              </button>
              <button
                type="button"
                className="min-h-[36px] rounded-full border border-[color:var(--glass-border)] bg-white/5 px-3 py-1 transition hover:border-primary/50 hover:text-primary"
                aria-expanded={advancedOpen}
                onClick={() => setAdvancedOpen((current) => !current)}
              >
                {advancedOpen ? "Hide advanced settings" : "Advanced settings"}
              </button>
            </div>
            {advancedOpen && (
              <label className="block max-w-md">
                <span className="mb-1 block text-muted-foreground">
                  Customer LAN / guest bridge
                </span>
                <select
                  className="input w-full"
                  value={lanInterface}
                  onChange={(e) => setLanInterface(e.target.value)}
                >
                  <option value="">Select the LAN or HotSpot bridge</option>
                  {ifaceOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[10px] text-muted-foreground">
                  PCC marks customer sessions from this interface. Failover also validates it to
                  prevent a WAN/LAN mix-up.
                </span>
              </label>
            )}
          </div>

          {/* ---- Actions ------------------------------------------------ */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="min-h-[36px] rounded-full border border-primary/50 bg-primary/10 px-3 py-1 text-primary transition hover:bg-primary/20 disabled:opacity-60"
              disabled={planMut.isPending || discoverMut.isPending}
              onClick={buildDryRun}
            >
              {planMut.isPending ? "Building safe dry run…" : "Build safe dry run"}
            </button>
            <span className="text-muted-foreground">
              Reads this router, then shows the commands that will be applied. Nothing is written
              until you confirm below.
            </span>
          </div>

          {/* ---- Device + findings -------------------------------------- */}
          {result && (
            <p className="text-muted-foreground">
              {result.device.boardName} · RouterOS {result.device.version.raw || "unknown"} ·{" "}
              {result.device.managementIface
                ? `management via ${result.device.managementIface}`
                : "management path unknown"}
            </p>
          )}

          {p && !planIsCurrent && (
            <div className="rounded-lg border border-warning/50 bg-warning/10 p-2 text-warning">
              Settings changed after this dry run. Build a new dry run before applying.
            </div>
          )}

          {p?.findings.map((f) => (
            <div key={f.id} className={`rounded-lg border p-2 ${sevStyle[f.severity]}`}>
              <p className="font-medium">{f.title}</p>
              <p className="mt-1 break-words text-muted-foreground">{f.detail}</p>
              {f.remedy && <p className="mt-1 break-words">{f.remedy}</p>}
            </div>
          ))}

          {rosTooOld && manualScript && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                className="min-h-[36px] rounded-full border border-[color:var(--glass-border)] bg-white/5 px-3 py-1 transition hover:border-primary/50 hover:text-primary"
                onClick={() => void copyManualScript()}
              >
                Copy commands for terminal
              </button>
              <span className="text-muted-foreground">
                Remote apply needs RouterOS 7.1+. Paste these into Winbox or SSH instead.
              </span>
            </div>
          )}

          {p?.findings.some((f) => f.id === "management-path") && (
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>
                I understand this changes the link I manage this router through. Take a backup and
                restore it if a command fails or post-apply verification does not match.
              </span>
            </label>
          )}

          {/* ---- Diff --------------------------------------------------- */}
          {p && (
            <div className="rounded-lg border border-[color:var(--glass-border)] bg-black/20 p-2">
              <p className="mb-2 text-muted-foreground">
                {p.summary.add} add · {p.summary.modify} change · {p.summary.remove} remove ·{" "}
                {p.summary.skip} already in place
                {p.noop && " — nothing to do"}
              </p>
              <ul className="space-y-1 font-mono text-[11px] leading-relaxed">
                {p.steps.map((s) => (
                  <li key={s.id} className="break-all">
                    <span className={actionStyle[s.action]}>{s.action.padEnd(6)}</span>
                    <span className="text-muted-foreground">{s.section} </span>
                    {s.command}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ---- Apply -------------------------------------------------- */}
          {p && !p.noop && (
            <div className="flex flex-wrap items-center gap-2">
              {privileged ? (
                <>
                  <input
                    className="input max-w-[220px]"
                    aria-label={`Type ${routerName} to confirm`}
                    placeholder={`Type "${routerName}" to confirm`}
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                  <button
                    className="min-h-[36px] rounded-full border border-warning/50 bg-warning/10 px-3 py-1 text-warning transition hover:bg-warning/20 disabled:opacity-60"
                    disabled={!canApply || applyMut.isPending}
                    onClick={() => applyMut.mutate()}
                  >
                    {applyMut.isPending ? "Applying…" : "Apply to router"}
                  </button>
                  <button
                    className="min-h-[36px] rounded-full border border-[color:var(--glass-border)] bg-white/5 px-3 py-1 transition hover:border-primary/50 hover:text-primary"
                    onClick={() => {
                      planMut.reset();
                      setConfirmation("");
                    }}
                  >
                    Cancel
                  </button>
                  <span className="text-muted-foreground">
                    A configuration backup is saved first and restored automatically if any step
                    fails or verification does not match.
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  This account needs the Reboot / Multi-WAN permission before it can apply router
                  changes. The owner can grant it from Users.
                </span>
              )}
            </div>
          )}

          {applyMut.data && (
            <div className="rounded-lg border border-[color:var(--glass-border)] bg-white/5 p-2">
              <p className="font-medium">
                {applyMut.data.outcome.ok ? "Apply succeeded" : "Apply did not complete"}
              </p>
              <p className="mt-1 break-words text-muted-foreground">
                {applyMut.data.outcome.backup
                  ? `Backup: ${applyMut.data.outcome.backup.name}. `
                  : "No backup was stored. "}
                {applyMut.data.outcome.rolledBack ? "Configuration was rolled back. " : ""}
                {applyMut.data.outcome.error ?? ""}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
