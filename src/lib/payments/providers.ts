import type { CheckoutInput, CheckoutHandle, NormalizedEvent, PaymentProvider } from "./types";

/**
 * Cash / counter sales. Always available, never redirects the guest anywhere:
 * the order stays pending until an operator records the cash.
 */
export const manualProvider: PaymentProvider = {
  id: "manual",
  label: "Cash at counter",
  configured: true,
  supportsOnline: false,
  async createCheckout(input: CheckoutInput): Promise<CheckoutHandle> {
    return { providerRef: `manual:${input.orderId}`, checkoutUrl: null, status: "pending" };
  },
  async parseWebhook(): Promise<NormalizedEvent | null> {
    return null;
  },
};

/**
 * The product sells hotspot vouchers, not generic online payments: the only
 * payment paths are cash at the counter and manual bank-transfer receipts
 * reviewed by the owner. No hosted payment gateway is wired up on purpose.
 */
export function providerById(_id: string): PaymentProvider {
  return manualProvider;
}

/** Providers usable right now. */
export function availableProviders(): PaymentProvider[] {
  return [manualProvider];
}
