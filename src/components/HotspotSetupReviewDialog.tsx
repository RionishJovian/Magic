/**
 * Visual review dialog before applying hotspot setup to the router.
 */
import type { HotspotSetupPreview } from "@/lib/wifi-hotspot.server";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ButtonSpinner } from "@/components/ui/button";

const KIND_ICON: Record<string, string> = {
  pool: "🗂",
  profile: "📋",
  server: "🔥",
  wifi: "📶",
  bridge: "🌉",
  port: "🔌",
  cap: "📡",
};

const STATUS_STYLE: Record<string, string> = {
  create: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  skip: "border-zinc-500/40 bg-zinc-500/10 text-muted-foreground",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-200",
};

const STATUS_LABEL: Record<string, string> = {
  create: "Will create",
  skip: "Already OK",
  info: "Your action",
  warn: "Note",
};

const FOUNDATION_KINDS = new Set(["pool", "profile", "server"]);

function groupReviewItems(items: HotspotSetupPreview["items"]) {
  const foundation = items.filter((item) => FOUNDATION_KINDS.has(item.kind));
  const rest = items.filter((item) => !FOUNDATION_KINDS.has(item.kind));
  return { foundation, rest };
}

function FoundationReviewGroup({ items }: { items: HotspotSetupPreview["items"] }) {
  if (items.length === 0) return null;
  const willCreate = items.some((item) => item.status === "create");
  const status = willCreate ? "create" : "skip";
  return (
    <li className={`rounded-lg border px-3 py-2.5 ${STATUS_STYLE[status] ?? STATUS_STYLE.info}`}>
      <div className="flex items-start gap-3">
        <span className="text-lg leading-none" aria-hidden>
          🔥
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">Captive portal foundation</span>
            <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] uppercase tracking-wide">
              {STATUS_LABEL[status]}
            </span>
          </div>
          <p className="mt-0.5 text-xs opacity-90">
            IP pool, login profile, and hotspot server on your bridge — handled together.
          </p>
          <ul className="mt-2 space-y-1 text-xs opacity-90">
            {items.map((item) => (
              <li key={item.id} className="flex gap-2">
                <span aria-hidden>{item.status === "create" ? "+" : "✓"}</span>
                <span>
                  {item.label}
                  {item.detail ? ` — ${item.detail}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}

function TopologyDiagram({ preview }: { preview: HotspotSetupPreview }) {
  const isBuiltin = preview.mode === "builtin-wifi";
  return (
    <div className="rounded-xl border border-border/60 bg-surface/60 p-4" aria-hidden>
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
        <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-center">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Router</div>
          <div className="font-mono font-semibold">{preview.bridge || "bridge"}</div>
          {preview.gatewayIp && (
            <div className="text-[10px] text-muted-foreground">{preview.gatewayIp}</div>
          )}
        </div>
        <div className="text-muted-foreground">→</div>
        {isBuiltin ? (
          <>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Wi‑Fi</div>
              <div className="font-semibold">
                {preview.bands.length ? preview.bands.join(" + ") : "2.4 + 5"}
              </div>
            </div>
            <div className="text-muted-foreground">→</div>
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">SSID</div>
              <div className="text-sm font-bold tracking-wide">{preview.ssid}</div>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Port</div>
              <div className="font-mono font-semibold">
                {preview.lanPorts.length ? preview.lanPorts.join(" · ") : "ether?"}
              </div>
            </div>
            <div className="text-muted-foreground">→</div>
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                AP SSID
              </div>
              <div className="text-sm font-bold">{preview.ssid}</div>
              <div className="text-[10px] text-muted-foreground">set on AP</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function HotspotSetupReviewDialog({
  open,
  onOpenChange,
  preview,
  routerName,
  applying,
  canApply,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: HotspotSetupPreview | null;
  routerName: string;
  applying: boolean;
  canApply: boolean;
  onApply: () => void;
}) {
  if (!preview) return null;

  const groupedItems = groupReviewItems(preview.items);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-5 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review hotspot setup</DialogTitle>
          <DialogDescription>
            On <span className="font-medium text-foreground">{routerName}</span> — confirm before
            applying to the router.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <span
            className={`chip text-[10px] ${preview.mode === "builtin-wifi" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}
          >
            {preview.mode === "builtin-wifi" ? "📡 Built-in Wi‑Fi" : "🔌 AP on LAN port"}
          </span>
          {preview.poolRange && (
            <span className="chip text-[10px] text-muted-foreground">Pool {preview.poolRange}</span>
          )}
        </div>

        <TopologyDiagram preview={preview} />

        <ul className="space-y-2">
          <FoundationReviewGroup items={groupedItems.foundation} />
          {groupedItems.rest.map((item) => (
            <li
              key={item.id}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${STATUS_STYLE[item.status] ?? STATUS_STYLE.info}`}
            >
              <span className="text-lg leading-none" aria-hidden>
                {KIND_ICON[item.kind] ?? "•"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                    {STATUS_LABEL[item.status]}
                  </span>
                </div>
                {item.detail && (
                  <p className="mt-0.5 text-xs opacity-90 break-words">{item.detail}</p>
                )}
              </div>
            </li>
          ))}
        </ul>

        {preview.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
            {preview.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        )}

        {!preview.canApply && preview.blockReason && (
          <p className="text-xs text-danger">{preview.blockReason}</p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <button
            type="button"
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted/50"
            disabled={applying}
            onClick={() => onOpenChange(false)}
          >
            Change
          </button>
          <button
            type="button"
            disabled={!canApply || !preview.canApply || applying}
            onClick={onApply}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {applying && <ButtonSpinner />}
            Apply to router
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
