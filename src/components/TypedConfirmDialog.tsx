import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { matchesTypedConfirmation } from "@/lib/device-removal";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  typeHint: string;
  phrase: string;
  confirmLabel: string;
  pending?: boolean;
  pendingLabel?: string;
  onConfirm: (typed: string) => void;
};

/**
 * Two-step destructive confirm: Continue, then type an exact English phrase.
 * Step 1 is the warning; step 2 unlocks the action only when the phrase matches.
 */
export function TypedConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  typeHint,
  phrase,
  confirmLabel,
  pending = false,
  pendingLabel = "Removing…",
  onConfirm,
}: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");
  const ready = matchesTypedConfirmation(typed, phrase);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setTyped("");
    }
  }, [open]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending && !next) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{step === 1 ? description : typeHint}</AlertDialogDescription>
        </AlertDialogHeader>
        {step === 2 && (
          <div className="space-y-2">
            <p className="select-all rounded-md border border-[color:var(--glass-border)] bg-black/30 px-3 py-2 font-mono text-xs font-semibold tracking-wide text-foreground">
              {phrase}
            </p>
            <input
              autoFocus
              className="input min-h-[44px] w-full font-mono text-sm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && ready && !pending) onConfirm(typed);
              }}
              aria-label={phrase}
              placeholder={phrase}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          {step === 1 ? (
            <Button type="button" onClick={() => setStep(2)}>
              Continue
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              disabled={!ready || pending}
              onClick={() => onConfirm(typed)}
            >
              {pending ? pendingLabel : confirmLabel}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
