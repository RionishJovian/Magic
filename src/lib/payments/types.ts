// Provider-agnostic payment boundary.
//
// Nothing in this file talks to a real payment provider. Concrete providers
// implement `PaymentProvider`; the rest of the app only ever sees these types,
// so swapping/adding a provider never touches orders, vouchers or revenue.

export type PaymentMethod = "online" | "cash";

export type OrderStatus = "pending" | "settled" | "failed" | "refunded" | "cancelled";

export type PaymentEventType = "payment.settled" | "payment.failed" | "payment.refunded";

export interface OrderRecord {
  id: string;
  owner_id: string;
  status: OrderStatus;
  method: PaymentMethod;
  provider: string;
  provider_ref: string | null;
  amount_minor: number;
  currency: string;
  plan_id: string | null;
  plan_key: string | null;
  plan_label: string;
  router_id: string | null;
  site_id: string | null;
  device_mac: string | null;
  voucher_code_id: string | null;
  issued_code: string | null;
  fulfilled_at: string | null;
}

/** A provider callback after it has been verified and normalised. */
export interface NormalizedEvent {
  provider: string;
  /** Stable provider-side id — the idempotency key for the callback. */
  eventId: string;
  type: PaymentEventType;
  /** Our order id, or the provider reference we stored on the order. */
  orderRef: string;
  amountMinor?: number;
  currency?: string;
  reason?: string;
  raw?: unknown;
}

export interface CheckoutInput {
  orderId: string;
  amountMinor: number;
  currency: string;
  description: string;
  returnUrl: string;
}

export interface CheckoutHandle {
  providerRef: string | null;
  /** Where to send the guest. `null` means "no redirect" (e.g. cash). */
  checkoutUrl: string | null;
  /** Orders always start pending; providers may not settle synchronously. */
  status: Extract<OrderStatus, "pending" | "failed">;
}

export interface WebhookRequest {
  body: string;
  headers: Record<string, string>;
}

export interface PaymentProvider {
  id: string;
  label: string;
  /** False when the required secrets/config are not present. */
  configured: boolean;
  supportsOnline: boolean;
  createCheckout(input: CheckoutInput): Promise<CheckoutHandle>;
  /** Returns null when the signature is invalid or the payload is unknown. */
  parseWebhook(req: WebhookRequest): Promise<NormalizedEvent | null>;
}
