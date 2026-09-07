export const VOUCHER_PRINT_WIDTHS = [58, 80] as const;
export type VoucherPrintWidth = (typeof VOUCHER_PRINT_WIDTHS)[number];

/** One tenant-owned counter-print layout. It is deliberately separate from portal presentation. */
export type VoucherPrintLayout = {
  business_name: string;
  wifi_name: string;
  support_contact: string;
  terms: string;
  paper_width_mm: VoucherPrintWidth;
  show_qr: boolean;
  show_price: boolean;
  show_expiry: boolean;
};

export const DEFAULT_VOUCHER_PRINT_LAYOUT: VoucherPrintLayout = {
  business_name: "Wi-Fi",
  wifi_name: "Hotspot",
  support_contact: "Ask the front desk",
  terms: "Enter this code in the captive portal. One voucher is for its assigned access plan.",
  paper_width_mm: 80,
  show_qr: true,
  show_price: true,
  show_expiry: true,
};

export function normalizeVoucherPrintLayout(
  raw: Partial<Omit<VoucherPrintLayout, "paper_width_mm">> & { paper_width_mm?: number },
): VoucherPrintLayout {
  const text = (value: unknown, fallback: string) =>
    typeof value === "string" && value.trim() ? value.trim() : fallback;
  const width = Number(raw.paper_width_mm);
  return {
    business_name: text(raw.business_name, DEFAULT_VOUCHER_PRINT_LAYOUT.business_name),
    wifi_name: text(raw.wifi_name, DEFAULT_VOUCHER_PRINT_LAYOUT.wifi_name),
    support_contact: text(raw.support_contact, DEFAULT_VOUCHER_PRINT_LAYOUT.support_contact),
    terms: text(raw.terms, DEFAULT_VOUCHER_PRINT_LAYOUT.terms),
    paper_width_mm: width === 58 ? 58 : 80,
    show_qr: raw.show_qr !== false,
    show_price: raw.show_price !== false,
    show_expiry: raw.show_expiry !== false,
  };
}
