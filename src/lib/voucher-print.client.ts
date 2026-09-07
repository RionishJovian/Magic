import QRCode from "qrcode";
import { toast } from "sonner";
import type { VoucherPrintLayout } from "./voucher-print-layout";

export type PrintableVoucher = {
  code: string;
  profile: string;
  priceMmk?: number;
  expiresAt?: string | null;
};

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>'"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]!,
  );

/** Opens the browser print dialog only; it never sends voucher data anywhere. */
export async function printVoucherThermalReceipt(
  voucher: PrintableVoucher,
  layout: VoucherPrintLayout,
) {
  const win = window.open("", "_blank", "width=420,height=760");
  if (!win) {
    toast.error("Popup blocked. Allow popups to print a voucher receipt.");
    return;
  }
  let qr = "";
  if (layout.show_qr) {
    try {
      qr = await QRCode.toDataURL(voucher.code, {
        width: 260,
        margin: 1,
        errorCorrectionLevel: "M",
      });
    } catch {
      // The voucher code remains the primary credential if QR generation fails.
    }
  }
  const price = voucher.priceMmk ? `${voucher.priceMmk.toLocaleString()} MMK` : "Included";
  const expiry = voucher.expiresAt
    ? new Date(voucher.expiresAt).toLocaleString()
    : "Starts when first used";
  const width = layout.paper_width_mm === 58 ? 52 : 74;
  const lines = [
    `Plan: ${escapeHtml(voucher.profile)}`,
    ...(layout.show_price ? [`Price: ${escapeHtml(price)}`] : []),
    `Wi-Fi: ${escapeHtml(layout.wifi_name)}`,
    ...(layout.show_expiry ? [`Expiry: ${escapeHtml(expiry)}`] : []),
    `Support: ${escapeHtml(layout.support_contact)}`,
  ].join("<br>");
  win.document
    .write(`<!doctype html><html><head><meta charset="utf-8"><title>Voucher receipt</title><style>
    @page { size:${layout.paper_width_mm}mm auto; margin:3mm; } body{width:${width}mm;margin:0 auto;font-family:ui-monospace,Menlo,monospace;color:#111;font-size:12px;text-align:center}.rule{border-top:1px dashed #111;margin:8px 0}.code{font-size:24px;font-weight:800;letter-spacing:2px;margin:10px 0}.left{text-align:left}.muted{font-size:10px;color:#444}.qr{width:34mm;height:34mm;image-rendering:auto}@media print{body{width:${width}mm}}
  </style></head><body><b>${escapeHtml(layout.business_name)}</b><div class="muted">Wi-Fi voucher receipt</div><div class="rule"></div>${qr ? `<img class="qr" src="${qr}" alt="Voucher QR code"/>` : ""}<div class="code">${escapeHtml(voucher.code)}</div><div class="left">${lines}</div><div class="rule"></div><div class="muted">${escapeHtml(layout.terms)}</div><div class="muted">Connect to Wi-Fi, then enter this voucher code in the captive portal.</div><script>window.onload=()=>setTimeout(()=>window.print(),150)</script></body></html>`);
  win.document.close();
}

/** Opens one browser print dialog for a batch using the saved default/custom layout. */
export async function printVoucherBatch(vouchers: PrintableVoucher[], layout: VoucherPrintLayout) {
  const win = window.open("", "_blank", "width=760,height=900");
  if (!win) {
    toast.error("Popup blocked. Allow popups to print vouchers.");
    return;
  }
  const cards = await Promise.all(vouchers.map(async (voucher) => {
    let qr = "";
    if (layout.show_qr) {
      try { qr = await QRCode.toDataURL(voucher.code, { width: 220, margin: 1, errorCorrectionLevel: "M" }); } catch { /* code remains printable */ }
    }
    const price = voucher.priceMmk ? `${voucher.priceMmk.toLocaleString()} MMK` : "Included";
    const expiry = voucher.expiresAt ? new Date(voucher.expiresAt).toLocaleString() : "Starts when first used";
    return `<article class="card">${qr ? `<img class="qr" src="${qr}" alt="QR code"/>` : ""}<div class="code">${escapeHtml(voucher.code)}</div><div>Plan: ${escapeHtml(voucher.profile)}</div>${layout.show_price ? `<div>Price: ${escapeHtml(price)}</div>` : ""}<div>Wi-Fi: ${escapeHtml(layout.wifi_name)}</div>${layout.show_expiry ? `<div>Expiry: ${escapeHtml(expiry)}</div>` : ""}<div>Support: ${escapeHtml(layout.support_contact)}</div></article>`;
  }));
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Wi-Fi vouchers</title><style>@page{margin:8mm}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#111;margin:0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8mm}.card{border:1px dashed #888;border-radius:10px;padding:8mm;text-align:center;break-inside:avoid}.code{font:800 22px ui-monospace,Menlo,monospace;letter-spacing:2px;margin:4mm 0}.card div{font-size:10px;margin-top:2px}.qr{width:28mm;height:28mm}@media print{.card{border-color:#333}}</style></head><body><div class="grid">${cards.join("")}</div><script>window.onload=()=>setTimeout(()=>window.print(),150)</script></body></html>`);
  win.document.close();
}
