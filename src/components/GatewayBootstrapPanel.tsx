import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  applyGatewayBootstrapFn,
  inspectGatewayBootstrap,
  planGatewayBootstrapFn,
} from "@/lib/gateway-bootstrap.functions";
import type { GatewayBootstrapIntent, GatewayBootstrapPlan } from "@/lib/gateway-bootstrap/types";
import { toErrorMessage } from "@/lib/error-message";

/** Server validation errors can be structured JSON; never expose that implementation detail to operators. */
function gatewayFormError(error: Error): string {
  const message = toErrorMessage(error);
  if (/wanInterface|bridge/.test(message)) {
    return "Select a WAN interface and an existing guest bridge before building a dry run.";
  }
  if (/gatewayCidr|dhcpRange/.test(message)) {
    return "Enter a valid guest gateway CIDR and DHCP range before building a dry run.";
  }
  return message.startsWith("[") || message.startsWith("{")
    ? "Check the Gateway Bootstrap fields and try again."
    : message;
}

export function GatewayBootstrapPanel({
  routerId,
  privileged,
}: {
  routerId: string;
  privileged: boolean;
}) {
  const [open, setOpen] = useState(false),
    [wan, setWan] = useState(""),
    [bridge, setBridge] = useState(""),
    [gatewayCidr, setGateway] = useState("10.5.50.1/24"),
    [dhcpRange, setRange] = useState("10.5.50.10-10.5.50.254"),
    [ports, setPorts] = useState(""),
    [typedApply, setTypedApply] = useState("");
  const inspect = useServerFn(inspectGatewayBootstrap),
    planFn = useServerFn(planGatewayBootstrapFn),
    apply = useServerFn(applyGatewayBootstrapFn);
  const intent = useMemo(
    () => ({
      kind: "gateway-bootstrap" as const,
      routerId,
      wanInterface: wan,
      strategy: "existing-bridge" as const,
      bridge,
      gatewayCidr,
      dhcpRange,
      guestPorts: ports
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      dnsServers: [],
    }),
    [routerId, wan, bridge, gatewayCidr, dhcpRange, ports],
  );
  const probe = useMutation({
    mutationFn: () => inspect({ data: { routerId } }),
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });
  const plan = useMutation({
    mutationFn: () => planFn({ data: intent }),
    onError: (e: Error) => toast.error(gatewayFormError(e)),
  });
  const p = plan.data as GatewayBootstrapPlan | undefined;
  const [reviewedIntent, setReviewedIntent] = useState<string | null>(null);
  const serializedIntent = JSON.stringify(intent);
  const planIsCurrent = reviewedIntent === serializedIntent;
  const applyMut = useMutation({
    mutationFn: () =>
      apply({ data: { ...intent, typedApply, reviewedIntentHash: p?.intentHash ?? "" } }),
    onSuccess: (r) =>
      toast[r.outcome.ok ? "success" : "error"](
        r.outcome.ok
          ? "Gateway foundation applied and verified."
          : (r.outcome.error ?? "Apply failed."),
      ),
    onError: (e: Error) => toast.error(gatewayFormError(e)),
  });
  const snap = probe.data;
  const canApply =
    !!p && planIsCurrent && !p.blocked && !p.noop && privileged && typedApply === "APPLY";
  const buildDryRun = () => {
    if (!wan || !bridge) {
      toast.error("Select a WAN interface and an existing guest bridge before building a dry run.");
      return;
    }
    plan.mutate(undefined, { onSuccess: () => setReviewedIntent(serializedIntent) });
  };
  return (
    <section className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
      <button
        className="flex w-full justify-between text-left"
        onClick={() => {
          setOpen(!open);
          if (!open) probe.mutate();
        }}
      >
        <span className="font-medium">
          Gateway Bootstrap{" "}
          <span className="ml-2 text-[10px] text-muted-foreground">
            Optional — use only when the guest bridge has no gateway
          </span>
        </span>
        <span>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-muted-foreground">
            Inspect → dry run → backup/export → typed APPLY → validate. It never configures or
            replaces WAN, routing, existing DHCP/NAT, Wi-Fi, HotSpot, or portal objects.
          </p>
          {snap &&
            (snap.discoveryFailures?.length ? (
              <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-danger">
                <p className="font-medium">Router discovery could not read required data</p>
                <p className="mt-1">
                  Failed checks: {snap.discoveryFailures.join(", ")}. Gateway Bootstrap is blocked
                  until the RouterOS account used by Magic Hub has read access.
                </p>
              </div>
            ) : (
              <p>
                {snap.bridges.length
                  ? `Found ${snap.bridges.length} bridge(s).`
                  : "No bridge found."}{" "}
                {snap.routes.some((r) => r.dst === "0.0.0.0/0")
                  ? "Default route present."
                  : "No default route detected; WAN must be fixed first."}
              </p>
            ))}
          <div className="grid gap-2 sm:grid-cols-2">
            <label>
              WAN interface
              <select className="input w-full" value={wan} onChange={(e) => setWan(e.target.value)}>
                <option value="">Select</option>
                {snap?.interfaces.map((i) => (
                  <option key={i.name} value={i.name}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Existing guest bridge
              <select
                className="input w-full"
                value={bridge}
                onChange={(e) => setBridge(e.target.value)}
              >
                <option value="">Select</option>
                {snap?.bridges.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Guest gateway CIDR
              <input
                className="input w-full"
                value={gatewayCidr}
                onChange={(e) => setGateway(e.target.value)}
              />
            </label>
            <label>
              DHCP range
              <input
                className="input w-full"
                value={dhcpRange}
                onChange={(e) => setRange(e.target.value)}
              />
            </label>
            <label>
              Optional guest ports
              <input
                className="input w-full"
                value={ports}
                onChange={(e) => setPorts(e.target.value)}
                placeholder="ether3, ether4"
              />
            </label>
          </div>
          <div className="rounded-lg border border-sky-400/30 bg-sky-500/10 p-3">
            <p className="mb-2 font-medium text-foreground">
              Step 1 — Inspect and review the safe plan
            </p>
            <p className="mb-3 text-muted-foreground">
              This does not change the router. It checks conflicts and shows every tagged object
              first.
            </p>
            <button
              type="button"
              className="w-full rounded-md bg-sky-500 px-4 py-2.5 font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={buildDryRun}
              disabled={plan.isPending || !!snap?.discoveryFailures?.length}
            >
              {plan.isPending ? "Building safe dry run…" : "Build safe dry run"}
            </button>
          </div>
          {p && (
            <div className="rounded-lg border border-[color:var(--glass-border)] bg-white/5 p-3">
              <p className="font-medium text-foreground">
                {p.blocked
                  ? "Plan blocked — resolve the findings below."
                  : p.noop
                    ? "Guest gateway already complete — no changes are needed."
                    : `Plan ready — ${p.summary.add} tagged object(s) would be added after backup.`}
              </p>
              <div className="mt-2 space-y-1">
                {p.findings.map((f) => (
                  <p
                    key={f.id}
                    className={f.severity === "blocker" ? "text-danger" : "text-muted-foreground"}
                  >
                    {f.title}: {f.detail}
                  </p>
                ))}
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer font-medium">
                  Review exact RouterOS commands
                </summary>
                <pre className="mt-2 overflow-auto rounded bg-black/20 p-2">
                  {p.steps
                    .filter((s) => s.action === "add")
                    .map((s) => s.command)
                    .join("\n")}
                </pre>
              </details>
            </div>
          )}
          {p && !p.blocked && !p.noop && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="font-medium text-foreground">Step 2 — Authorize the reviewed plan</p>
              <p className="mt-1 text-muted-foreground">
                RouterOS backup and export run before any tagged object is added.
              </p>
              <label className="mt-3 block">
                Type <strong>APPLY</strong> to authorize this router change
                <input
                  className="input mt-1 w-full"
                  value={typedApply}
                  onChange={(e) => setTypedApply(e.target.value)}
                  placeholder="APPLY"
                />
              </label>
              <button
                type="button"
                className="mt-3 w-full rounded-md bg-amber-500 px-4 py-2.5 font-semibold text-black transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canApply || applyMut.isPending}
                onClick={() => applyMut.mutate()}
              >
                {applyMut.isPending ? "Applying tagged plan…" : "Backup and apply tagged plan"}
              </button>
            </div>
          )}
          {!privileged && (
            <p className="text-warning">Operator/admin permission is required to apply.</p>
          )}
        </div>
      )}
    </section>
  );
}
