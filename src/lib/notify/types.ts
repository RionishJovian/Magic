// Notifier boundary. The app only ever sees this interface, so a missing or
// unconfigured channel degrades to "web review only" instead of failing a
// guest's checkout.

export interface ReviewNotification {
  orderId: string;
  planLabel: string;
  amountDisplay: string;
  siteLabel: string;
  receiptReference: string;
  submittedAt: string;
  /** Owner-only web fallback (deep link into /app/orders). */
  reviewUrl: string;
  approveToken: string;
  rejectToken: string;
}

export interface Notifier {
  id: string;
  configured: boolean;
  /** Returns false when the message could not be delivered. Never throws. */
  notifyReceipt(input: ReviewNotification): Promise<boolean>;
}

export const nullNotifier: Notifier = {
  id: "none",
  configured: false,
  async notifyReceipt() {
    return false;
  },
};

/** Human-readable, secret-free summary used by every channel. */
export function reviewSummaryLines(n: ReviewNotification): string[] {
  return [
    "New bank-transfer receipt awaiting review",
    `Plan: ${n.planLabel}`,
    `Amount: ${n.amountDisplay}`,
    `Site: ${n.siteLabel}`,
    `Reference: ${n.receiptReference}`,
    `Order: ${n.orderId.slice(0, 8)}`,
    `Submitted: ${n.submittedAt}`,
  ];
}
