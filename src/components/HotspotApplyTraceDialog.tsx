/**
 * Step-by-step trace after hotspot setup apply — maps to terminal_history rows.
 */
import { Link } from "@tanstack/react-router";
import type { HotspotApplyResult } from "@/lib/wifi-hotspot.server";
import { toErrorMessage } from "@/lib/error-message";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const OUTCOME_STYLE: Record<string, string> = {
  created: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  skipped: "border-zinc-500/40 bg-zinc-500/10 text-muted-foreground",
  failed: "border-red-500/40 bg-red-500/10 text-red-200",
};

const OUTCOME_LABEL: Record<string, string> = {
  created: "Created",
  skipped: "Skipped",
  failed: "Failed",
};

export function HotspotApplyTraceDialog({
  open,
  onOpenChange,
  routerName,
  result,
  suggestPortalPublish = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routerName: string;
  result: HotspotApplyResult | null;
  /** Nudge Portal publish after a successful foundation apply. */
  suggestPortalPublish?: boolean;
}) {
  if (!result) return null;

  const created = result.steps.filter((s) => s.outcome === "created").length;
  const skipped = result.steps.filter((s) => s.outcome === "skipped").length;
  const failed = result.steps.filter((s) => s.outcome === "failed").length;
  const showNextSteps = result.ok && failed === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-4">
        <DialogHeader>
          <DialogTitle>{result.ok ? "Hotspot apply trace" : "Hotspot apply stopped"}</DialogTitle>
          <DialogDescription>
            What MikroTik Magic sent to{" "}
            <span className="font-medium text-foreground">{routerName}</span>. Each step is also
            saved under Terminal → History (path{" "}
            <code className="rounded bg-black/30 px-1">/hotspot-setup/step</code>).
          </DialogDescription>
        </DialogHeader>

        {!result.ok && result.error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100">
            {toErrorMessage(result.error)}
          </div>
        )}

        {result.rolledBack && result.rolledBack.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
            <p className="font-medium text-amber-50">Rolled back on the router</p>
            <p className="mt-1 opacity-90">
              Magic deleted these objects it had just created so a failed apply does not leave a
              half-built guest network: {result.rolledBack.join(" · ")}
            </p>
          </div>
        )}

        {!result.ok && (!result.rolledBack || result.rolledBack.length === 0) && created > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
            Some earlier create steps may still be on the router. Open Terminal → History, then
            re-run setup or remove Magic guest Wi‑Fi from the Hotspot panel before trying again.
          </div>
        )}

        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">
            {created} created
          </span>
          <span className="rounded-full border border-zinc-500/40 bg-zinc-500/10 px-2 py-0.5 text-muted-foreground">
            {skipped} skipped (already on router)
          </span>
          {failed > 0 && (
            <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-red-200">
              {failed} failed
            </span>
          )}
        </div>

        <ol className="max-h-72 space-y-2 overflow-y-auto text-xs">
          {result.steps.map((step, i) => (
            <li
              key={`${step.label}-${i}`}
              className={`rounded-lg border px-3 py-2 ${OUTCOME_STYLE[step.outcome] ?? OUTCOME_STYLE.skipped}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{step.label}</span>
                <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] uppercase">
                  {OUTCOME_LABEL[step.outcome]}
                </span>
                <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] uppercase">
                  {step.transport}
                </span>
              </div>
              {step.note && <p className="mt-1 opacity-90">{step.note}</p>}
              {step.command && (
                <pre className="mt-1.5 overflow-x-auto rounded bg-black/30 p-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-all">
                  {step.command}
                </pre>
              )}
              {step.error && <p className="mt-1 text-red-200">{toErrorMessage(step.error)}</p>}
            </li>
          ))}
        </ol>

        {result.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
            {result.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        )}

        {showNextSteps && (
          <div className="rounded-lg border border-border/60 bg-black/20 px-3 py-2.5 text-xs">
            <p className="font-medium text-foreground">After apply checklist</p>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-muted-foreground">
              <li>
                Confirm the guest SSID on the Hotspot Wi‑Fi panel — Guest phones must join that
                name, not a staff or private network.
              </li>
              <li className={suggestPortalPublish ? "font-medium text-primary" : undefined}>
                {suggestPortalPublish
                  ? "Publish Portal — the board still shows the stock MikroTik login page until you deploy your branded captive portal."
                  : "Open Portal and publish (or re-publish) if guests should see your branded page."}
              </li>
              <li>Create or restock vouchers / plans so guests can redeem or buy access.</li>
              <li>
                If you use trial / commerce modes, verify temporary access from a phone on the guest
                SSID (not from this dashboard alone).
              </li>
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                to="/app/vouchers"
                className="rounded-md border border-border/70 bg-surface px-3 py-1.5 text-foreground hover:bg-muted/40"
                onClick={() => onOpenChange(false)}
              >
                Vouchers
              </Link>
              <Link
                to="/app/portal"
                className={`rounded-md border px-3 py-1.5 ${
                  suggestPortalPublish
                    ? "border-primary/60 bg-primary/15 text-primary font-semibold"
                    : "border-border/70 bg-surface text-foreground hover:bg-muted/40"
                }`}
                onClick={() => onOpenChange(false)}
              >
                Portal{suggestPortalPublish ? " → Publish" : ""}
              </Link>
            </div>
          </div>
        )}

        <DialogFooter>
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => onOpenChange(false)}
          >
            Done
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
