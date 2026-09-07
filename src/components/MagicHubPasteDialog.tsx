import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { copyText } from "@/lib/browser/clipboard";
import { useT } from "@/lib/i18n";

function download(name: string, body: string) {
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One-time Magic Hub Connect paste dialog (page-level or CloudPanel). */
export function MagicHubPasteDialog({
  open,
  onOpenChange,
  script,
  rollbackScript,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  script: string | null | undefined;
  rollbackScript: string;
}) {
  const t = useT();
  const body = script?.trim() ? script : null;
  return (
    <Dialog open={open && Boolean(body)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="magic-hub-paste-dialog">
        <DialogHeader>
          <DialogTitle>{t.label("Paste this on the router")}</DialogTitle>
          <DialogDescription>
            {t.copy(
              "This window is Magic Hub (Cloud Remote). Stay here — do not hop to the Scripts page for the key script.",
            )}
          </DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-1.5 pl-4 text-[11px] leading-snug text-muted-foreground">
          <li>
            {t.copy(
              "From WinBox on this board (not your Mac/PC): /ping 8.8.8.8 must succeed. LAN and WAN must not share the same IP.",
            )}
          </li>
          <li>
            {t.copy(
              "Copy script → WinBox New Terminal → paste once. If you see STOP, fix WAN and paste again — the hub is not installed until preflight passes.",
            )}
          </li>
          <li>
            {t.copy(
              "Wait for last-handshake a few seconds ago in the printout. Ignore ping timeouts to the hub or 10.77.0.1.",
            )}
          </li>
          <li>
            {t.copy(
              "Back in the app: Check now → Test. App password must match WinBox. Expect Reachable — REST OK.",
            )}
          </li>
        </ol>
        <p className="text-[11px] text-warning">
          {t.copy(
            "Private key is shown only once (kept for this browser tab). Do not invent keys or edit the hub endpoint. Do not save this into the Scripts library.",
          )}
        </p>
        {body && (
          <div className="flex flex-wrap gap-1.5 text-xs">
            <button
              type="button"
              className="min-h-11 rounded-full border border-[color:var(--glass-border)] bg-white/5 px-3 hover:text-primary sm:min-h-9"
              onClick={() => {
                void copyText(body).then((ok) => {
                  if (ok) toast.success("Script copied");
                  else toast.error("Copy failed");
                });
              }}
            >
              Copy script
            </button>
            <button
              type="button"
              className="min-h-11 rounded-full border border-[color:var(--glass-border)] bg-white/5 px-3 hover:text-primary sm:min-h-9"
              onClick={() => download("magic-hub.rsc", body)}
            >
              Download .rsc
            </button>
            <button
              type="button"
              className="min-h-11 rounded-full border border-[color:var(--glass-border)] bg-white/5 px-3 hover:text-primary sm:min-h-9"
              onClick={() => download("magic-hub-rollback.rsc", rollbackScript)}
            >
              Rollback script
            </button>
          </div>
        )}
        <pre className="max-h-[50dvh] overflow-auto rounded-lg border border-[color:var(--glass-border)] bg-black/40 p-2 font-mono text-[10px] leading-relaxed">
          {body}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
