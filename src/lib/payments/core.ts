import type { NormalizedEvent, OrderRecord, OrderStatus } from "./types";

/**
 * Storage boundary for order fulfilment. The Supabase implementation lives in
 * `orders.server.ts`; tests use an in-memory one. Keeping the state machine
 * pure is what lets us prove "exactly once" without a database.
 */
export interface PaymentStore {
  /** Look an order up by our id or by the provider reference stored on it. */
  findOrder(ref: string): Promise<OrderRecord | null>;
  patchOrder(id: string, patch: Partial<OrderRecord>): Promise<void>;
  /**
   * Records the callback. Returns false when (provider, event_id) already
   * exists — that is the webhook idempotency gate.
   */
  claimEvent(event: {
    provider: string;
    eventId: string;
    type: string;
    orderId: string | null;
    ownerId: string | null;
    payload: unknown;
  }): Promise<boolean>;
  finishEvent(provider: string, eventId: string, outcome: string): Promise<void>;
  /**
   * Drops a claimed event so a failed fulfilment (e.g. RouterOS push) can be
   * retried with the same event id. Optional for older test doubles.
   */
  releaseEvent?(provider: string, eventId: string): Promise<void>;
  /** Creates the voucher for a settled order. Must be safe to call once. */
  issueVoucher(order: OrderRecord): Promise<{ voucherId: string; code: string }>;
}

export type FulfilmentOutcome =
  | "duplicate_event"
  | "unknown_order"
  | "fulfilled"
  | "already_fulfilled"
  | "failed"
  | "refunded"
  | "ignored";

export interface FulfilmentResult {
  outcome: FulfilmentOutcome;
  orderId: string | null;
  code?: string | null;
}

const TERMINAL: OrderStatus[] = ["refunded", "cancelled"];

/**
 * Applies one verified provider callback. Safe to call repeatedly with the
 * same event: the second call short-circuits on `claimEvent`, and even if an
 * event id were reused, `fulfilled_at` keeps voucher issuance to exactly once.
 */
export async function handlePaymentEvent(
  store: PaymentStore,
  event: NormalizedEvent,
): Promise<FulfilmentResult> {
  const order = await store.findOrder(event.orderRef);

  const fresh = await store.claimEvent({
    provider: event.provider,
    eventId: event.eventId,
    type: event.type,
    orderId: order?.id ?? null,
    ownerId: order?.owner_id ?? null,
    payload: event.raw ?? null,
  });
  if (!fresh) return { outcome: "duplicate_event", orderId: order?.id ?? null };

  if (!order) {
    await store.finishEvent(event.provider, event.eventId, "unknown_order");
    return { outcome: "unknown_order", orderId: null };
  }

  const done = (outcome: FulfilmentOutcome, code?: string | null) =>
    store
      .finishEvent(event.provider, event.eventId, outcome)
      .then(() => ({ outcome, orderId: order.id, code: code ?? null }));

  if (event.type === "payment.failed") {
    if (order.fulfilled_at) return done("ignored");
    await store.patchOrder(order.id, {
      status: "failed",
      failure_reason: event.reason ?? "Payment failed",
    } as never);
    return done("failed");
  }

  if (event.type === "payment.refunded") {
    await store.patchOrder(order.id, {
      status: "refunded",
      refunded_at: new Date().toISOString(),
      failure_reason: event.reason ?? null,
    } as never);
    return done("refunded");
  }

  // payment.settled
  if (TERMINAL.includes(order.status)) return done("ignored");
  if (order.fulfilled_at) return done("already_fulfilled", order.issued_code);

  try {
    const { voucherId, code } = await store.issueVoucher(order);
    const now = new Date().toISOString();
    await store.patchOrder(order.id, {
      status: "settled",
      settled_at: now,
      fulfilled_at: now,
      voucher_code_id: voucherId,
      issued_code: code,
      failure_reason: null,
    } as never);
    return done("fulfilled", code);
  } catch (err) {
    // Release the idempotency claim so desk cash / bank approve can retry
    // after a transient RouterOS failure instead of getting stuck on duplicate_event.
    if (store.releaseEvent) {
      await store.releaseEvent(event.provider, event.eventId).catch(() => null);
    }
    await store
      .patchOrder(order.id, {
        failure_reason: err instanceof Error ? err.message.slice(0, 300) : "Voucher issue failed",
      } as never)
      .catch(() => null);
    throw err;
  }
}

/**
 * Cash sales are settled the moment an operator records them, so they follow
 * the same path with a synthetic event id derived from the order.
 */
export function cashSettlementEvent(orderId: string, ref?: string): NormalizedEvent {
  return {
    provider: "manual",
    eventId: `cash:${ref ?? orderId}`,
    type: "payment.settled",
    orderRef: orderId,
  };
}
