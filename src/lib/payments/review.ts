// Owner review of a bank-transfer receipt.
//
// The state machine is pure and sits on top of the existing payment store, so
// approval reuses `handlePaymentEvent` and inherits its exactly-once
// guarantee: a replayed Telegram callback can never issue a second voucher.

import { handlePaymentEvent, type PaymentStore } from "./core";
import type { NormalizedEvent } from "./types";

export interface ReviewTokenRow {
  id: string;
  order_id: string;
  owner_id: string;
  receipt_id: string | null;
  actor_ref: string | null;
  expires_at: string;
  used_at: string | null;
}

export type TokenFailure = "unknown" | "expired" | "used" | "actor_mismatch";

export interface TokenCheck {
  ok: boolean;
  reason?: TokenFailure;
}

const HEX = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  return HEX(await crypto.subtle.digest("SHA-256", data));
}

export async function newReviewToken(): Promise<{ token: string; hash: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return { token, hash: await hashToken(token) };
}

/**
 * Expiry, single use and actor binding. `actor` is the Telegram chat id the
 * callback arrived from; a token minted for one owner cannot be redeemed by
 * anybody else even if the link leaks.
 */
export function checkToken(
  row: ReviewTokenRow | null,
  opts: { now?: number; actor?: string | null } = {},
): TokenCheck {
  if (!row) return { ok: false, reason: "unknown" };
  const now = opts.now ?? Date.now();
  if (row.used_at) return { ok: false, reason: "used" };
  if (Date.parse(row.expires_at) <= now) return { ok: false, reason: "expired" };
  if (row.actor_ref && opts.actor && row.actor_ref !== String(opts.actor)) {
    return { ok: false, reason: "actor_mismatch" };
  }
  return { ok: true };
}

/** Approval is modelled as a settlement event keyed by the review token. */
export function approvalEvent(orderId: string, tokenId: string): NormalizedEvent {
  return {
    provider: "bank_transfer",
    eventId: `review:${tokenId}`,
    type: "payment.settled",
    orderRef: orderId,
  };
}

export interface ReviewStore extends PaymentStore {
  patchReceipt(
    receiptId: string,
    patch: {
      status?: string;
      reject_reason?: string | null;
      reviewed_at?: string;
      reviewed_by?: string | null;
    },
  ): Promise<void>;
  audit(entry: {
    orderId: string;
    ownerId: string;
    from: string | null;
    to: string;
    actor: string;
    actorUserId?: string | null;
    note?: string | null;
  }): Promise<void>;
}

export interface ReviewInput {
  orderId: string;
  ownerId: string;
  receiptId: string | null;
  tokenId: string;
  decision: "approve" | "reject";
  actor: string;
  actorUserId?: string | null;
  reason?: string | null;
}

export interface ReviewResult {
  outcome: "approved" | "already_approved" | "rejected" | "unknown_order" | "duplicate" | "ignored";
  code?: string | null;
}

export async function applyReview(store: ReviewStore, input: ReviewInput): Promise<ReviewResult> {
  const order = await store.findOrder(input.orderId);
  if (!order) return { outcome: "unknown_order" };
  const from = order.status;

  if (input.decision === "approve") {
    const res = await handlePaymentEvent(store, approvalEvent(order.id, input.tokenId));
    if (res.outcome === "duplicate_event") return { outcome: "duplicate", code: order.issued_code };
    if (res.outcome === "already_fulfilled") {
      return { outcome: "already_approved", code: res.code ?? order.issued_code };
    }
    if (res.outcome !== "fulfilled") return { outcome: "ignored", code: order.issued_code };

    if (input.receiptId) {
      await store.patchReceipt(input.receiptId, {
        status: "approved",
        reviewed_at: new Date().toISOString(),
        reviewed_by: input.actorUserId ?? null,
      });
    }
    await store.audit({
      orderId: order.id,
      ownerId: input.ownerId,
      from,
      to: "settled",
      actor: input.actor,
      actorUserId: input.actorUserId ?? null,
      note: "receipt approved",
    });
    return { outcome: "approved", code: res.code ?? null };
  }

  // Reject: keep the order re-submittable, never issue anything.
  if (order.fulfilled_at) return { outcome: "already_approved", code: order.issued_code };
  await store.patchOrder(order.id, {
    status: "rejected",
    failure_reason: input.reason ?? "Receipt rejected",
  } as never);
  if (input.receiptId) {
    await store.patchReceipt(input.receiptId, {
      status: "rejected",
      reject_reason: input.reason ?? "Receipt rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: input.actorUserId ?? null,
    });
  }
  await store.audit({
    orderId: order.id,
    ownerId: input.ownerId,
    from,
    to: "rejected",
    actor: input.actor,
    actorUserId: input.actorUserId ?? null,
    note: input.reason ?? null,
  });
  return { outcome: "rejected" };
}
