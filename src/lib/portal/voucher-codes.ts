/**
 * Voucher code alphabet + uniqueness helpers (shared by desk issue and paid fulfilment).
 * Alphabet omits I/O/0/1 to reduce guest mistypes.
 */
export const VOUCHER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomCode(len = 8): string {
  let out = "";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i++) {
    out += VOUCHER_CODE_ALPHABET[bytes[i]! % VOUCHER_CODE_ALPHABET.length];
  }
  return out;
}

/** Allocate `count` codes not present in `existing` (case-insensitive via uppercase set). */
export function allocateUniqueCodes(input: {
  count: number;
  existing: ReadonlySet<string>;
  generate?: () => string;
  maxAttempts?: number;
}): string[] {
  const out: string[] = [];
  const used = new Set([...input.existing].map((c) => c.trim().toUpperCase()).filter(Boolean));
  const gen = input.generate ?? (() => randomCode());
  const maxAttempts = input.maxAttempts ?? Math.max(40, input.count * 25);
  let attempts = 0;
  while (out.length < input.count && attempts < maxAttempts) {
    attempts += 1;
    const code = gen().trim().toUpperCase();
    if (!code || used.has(code)) continue;
    used.add(code);
    out.push(code);
  }
  if (out.length < input.count) {
    throw new Error("Could not allocate unique voucher codes — try a smaller batch.");
  }
  return out;
}

/** Unused-stock window from plan.validity_days (session length still uses duration_minutes). */
export function expiresAtFromValidityDays(
  validityDays: number | null | undefined,
  nowMs = Date.now(),
): string | null {
  if (validityDays == null || validityDays <= 0) return null;
  return new Date(nowMs + validityDays * 86_400_000).toISOString();
}
