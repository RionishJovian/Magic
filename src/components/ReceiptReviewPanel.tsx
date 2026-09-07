import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listReceiptReviews, getReceiptUrl, reviewOrder } from "@/lib/bank.functions";
import { fmtDateTime, fmtMMK } from "@/lib/time";
import { toErrorMessage } from "@/lib/error-message";

/**
 * Tenant review queue for guest hotspot bank-transfer receipts. Receipts are
 * never public: we mint a short-lived signed URL only when the operator asks
 * to look at one. Telegram is not used here.
 */
export function ReceiptReviewPanel() {
  const qc = useQueryClient();
  const fetchReviews = useServerFn(listReceiptReviews);
  const signFn = useServerFn(getReceiptUrl);
  const decideFn = useServerFn(reviewOrder);
  const [reason, setReason] = useState<Record<string, string>>({});

  const reviews = useQuery({
    queryKey: ["receipt-reviews"],
    queryFn: () => fetchReviews({ data: { status: "active" } }),
  });
  const decide = useMutation({
    mutationFn: (v: { order_id: string; decision: "approve" | "reject"; reason?: string }) =>
      decideFn({ data: v }),
    onSuccess: (r) => {
      toast.success(
        r.outcome === "approved"
          ? `Approved — voucher ${r.code ?? "issued"}`
          : r.outcome === "already_approved"
            ? "This order was already approved."
            : r.outcome === "rejected"
              ? "Rejected. The guest can submit a new receipt."
              : `No change (${r.outcome}).`,
      );
      void qc.invalidateQueries({ queryKey: ["receipt-reviews"] });
      void qc.invalidateQueries({ queryKey: ["orders"] });
      void qc.invalidateQueries({ queryKey: ["revenue-breakdown"] });
    },
    onError: (e: Error) => toast.error(toErrorMessage(e)),
  });

  async function view(receiptId: string) {
    try {
      const { url } = await signFn({ data: { receipt_id: receiptId } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(toErrorMessage(e, "Could not open the receipt."));
    }
  }

  const rows = reviews.data ?? [];

  return (
    <section className="glass-panel space-y-3 rounded-2xl p-4">
      <h2 className="text-sm font-medium">Receipts awaiting review</h2>
      {reviews.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : reviews.error ? (
        <p role="alert" className="text-sm text-red-300">
          {reviews.error instanceof Error ? reviews.error.message : "Could not load receipts."}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing to review. Bank transfer receipts from guests appear here.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-border/50 p-3 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-medium">{r.order?.plan_label ?? "Plan"}</p>
                  <p className="text-muted-foreground">
                    {fmtMMK(r.order?.amount_minor ?? 0)} · {fmtDateTime(r.submitted_at)}
                  </p>
                  <p className="break-all text-muted-foreground">
                    Ref {r.reference || r.id.slice(0, 8)} · order {String(r.order_id).slice(0, 8)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void view(r.id)}
                  className="min-h-9 shrink-0 rounded-lg border border-border/60 px-3"
                >
                  View receipt
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={reason[r.order_id] ?? ""}
                  onChange={(e) =>
                    setReason((s) => ({ ...s, [r.order_id]: e.target.value.slice(0, 300) }))
                  }
                  placeholder="Reason (for reject)"
                  aria-label="Rejection reason"
                  className="min-h-10 min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-3"
                />
                <button
                  type="button"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ order_id: r.order_id, decision: "approve" })}
                  className="min-h-10 rounded-lg bg-primary px-3 font-medium text-primary-foreground disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={decide.isPending}
                  onClick={() =>
                    decide.mutate({
                      order_id: r.order_id,
                      decision: "reject",
                      reason: reason[r.order_id] || undefined,
                    })
                  }
                  className="min-h-10 rounded-lg border border-border/60 px-3 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
