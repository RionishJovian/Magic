// Server-only glue for guest hotspot receipt review. Guest receipts stay on
// the tenant Payments page. Telegram is reserved for owner/admin Tier Pass
// review on Services. Never logs account numbers or receipt contents.

import type { DatabaseClient } from "../database.types";

export const RECEIPT_BUCKET = "payment-receipts";
export const REVIEW_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface NotifyContext {
  ownerId: string;
  orderId: string;
  receiptId: string;
  planLabel: string;
  amountDisplay: string;
  siteLabel: string;
  receiptReference: string;
  origin: string;
}

/**
 * Guest hotspot receipts are reviewed on the tenant Payments page.
 * Telegram is reserved for owner/admin Tier Pass review on Services.
 */
export async function notifyOwnerOfReceipt(
  _db: DatabaseClient,
  _ctx: NotifyContext,
): Promise<{ notified: boolean; channel: string }> {
  // Guest hotspot receipts stay on the tenant Payments page.
  // Telegram is reserved for owner/admin Tier Pass review on Services.
  return { notified: false, channel: "none" };
}

/** Short-lived signed URL for a receipt object. Owner-side only. */
export async function signedReceiptUrl(
  admin: DatabaseClient,
  objectKey: string,
  seconds = 120,
): Promise<string> {
  const { data, error } = await admin.storage
    .from(RECEIPT_BUCKET)
    .createSignedUrl(objectKey, seconds);
  if (error) throw new Error(error.message);
  return data.signedUrl as string;
}
