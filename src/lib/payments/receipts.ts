// Receipt upload rules. Pure so the validation can be tested without storage.

export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024; // 8 MB — a phone photo or a PDF.

/**
 * Deliberately narrow. SVG and HTML are excluded: they can carry script and
 * we never want to render guest-supplied markup in the owner's browser.
 */
export const ALLOWED_RECEIPT_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

export type ReceiptRejection = "unsupported_type" | "too_large" | "empty_file";

export interface ReceiptValidation {
  ok: boolean;
  reason?: ReceiptRejection;
  extension?: string;
}

export function validateReceipt(input: { mime: string; size: number }): ReceiptValidation {
  const mime = (input.mime ?? "").toLowerCase().split(";")[0]!.trim();
  const ext = ALLOWED_RECEIPT_MIME[mime];
  if (!ext) return { ok: false, reason: "unsupported_type" };
  if (!input.size || input.size <= 0) return { ok: false, reason: "empty_file" };
  if (input.size > MAX_RECEIPT_BYTES) return { ok: false, reason: "too_large" };
  return { ok: true, extension: ext };
}

/**
 * Object keys are generated, never derived from the uploaded filename, so a
 * guest cannot influence the storage path or collide with another tenant.
 */
export function receiptObjectKey(input: {
  ownerId: string;
  orderId: string;
  extension: string;
  random?: string;
}): string {
  const rand =
    input.random ??
    (() => {
      const b = new Uint8Array(12);
      crypto.getRandomValues(b);
      return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    })();
  return `${input.ownerId}/${input.orderId}/${rand}.${input.extension}`;
}

/** The order id must be the second segment — used when authorising a review URL. */
export function orderIdFromKey(key: string): string | null {
  const parts = key.split("/");
  return parts.length === 3 ? (parts[1] ?? null) : null;
}

/** Simple fixed-window limiter for guest submissions. */
export function isRateLimited(
  recent: Array<{ submitted_at: string }>,
  now = Date.now(),
  windowMs = 10 * 60 * 1000,
  max = 5,
): boolean {
  return recent.filter((r) => now - Date.parse(r.submitted_at) < windowMs).length >= max;
}
