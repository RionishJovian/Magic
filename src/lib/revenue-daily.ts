/** Bucket financially eligible Used vouchers into ascending daily MMK totals. */
export function bucketVoucherRevenueByDay(
  vouchers: ReadonlyArray<{
    status?: string | null;
    first_seen_at: string | null;
    expires_at?: string | null;
    price_mmk: number | null;
  }>,
  dayStarts: readonly number[],
  now = Date.now(),
): number[] {
  const buckets = Array.from({ length: dayStarts.length }, () => 0);
  for (const v of vouchers) {
    if (["cancelled", "deleted"].includes((v.status ?? "").toLowerCase())) continue;
    if (!v.first_seen_at) continue;
    const expiresAt = v.expires_at ? new Date(v.expires_at).getTime() : null;
    const isUsed =
      (v.status ?? "").toLowerCase() === "expired" ||
      (expiresAt != null && Number.isFinite(expiresAt) && expiresAt <= now);
    if (!isUsed) continue;
    const at =
      expiresAt != null && Number.isFinite(expiresAt)
        ? expiresAt
        : new Date(v.first_seen_at).getTime();
    if (!Number.isFinite(at)) continue;
    const price = v.price_mmk ?? 0;
    for (let i = 0; i < dayStarts.length; i++) {
      const start = dayStarts[i]!;
      const end = i < dayStarts.length - 1 ? dayStarts[i + 1]! : now + 1;
      if (at >= start && at < end) {
        buckets[i]! += price;
        break;
      }
    }
  }
  return buckets;
}

/**
 * Buckets the already-reconciled accounting stream. Home uses this so its
 * sparkline cannot disagree with the Revenue page because of a separate
 * voucher-status calculation.
 */
export function bucketRevenueEntriesByDay(
  entries: ReadonlyArray<{ at: number; amount: number }>,
  dayStarts: readonly number[],
  now = Date.now(),
): number[] {
  const buckets = Array.from({ length: dayStarts.length }, () => 0);
  for (const entry of entries) {
    if (!Number.isFinite(entry.at) || !Number.isFinite(entry.amount)) continue;
    for (let i = 0; i < dayStarts.length; i++) {
      const start = dayStarts[i]!;
      const end = i < dayStarts.length - 1 ? dayStarts[i + 1]! : now + 1;
      if (entry.at >= start && entry.at < end) {
        buckets[i]! += entry.amount;
        break;
      }
    }
  }
  return buckets;
}
