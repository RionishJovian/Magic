// Pure revenue accounting. Kept free of Supabase so it can be unit-tested and
// reused by both the revenue dashboard and the orders screen.

export type RevenueSource =
  | "online" // settled order paid through a payment provider
  | "cash" // settled order recorded manually by an operator
  | "refund" // negative amount, always a settled order that was refunded
  | "legacy_voucher" // voucher redeemed before orders existed
  | "legacy_manual"; // row in voucher_sales with no order behind it

export interface RevenueEntry {
  at: number;
  /** Minor units. Refunds are negative. */
  amount: number;
  source: RevenueSource;
  plan: string;
  code: string | null;
  site_id: string | null;
  router_id: string | null;
}

export interface OrderLike {
  id: string;
  status: string;
  method: string;
  amount_minor: number;
  plan_label: string;
  issued_code: string | null;
  site_id: string | null;
  router_id: string | null;
  settled_at: string | null;
  refunded_at: string | null;
  created_at: string;
}

export interface VoucherLike {
  code: string;
  plan_label: string | null;
  plan_key: string | null;
  price_mmk: number | null;
  first_seen_at: string | null;
  expires_at?: string | null;
  site_id: string | null;
  router_id: string | null;
  order_id: string | null;
  status?: string | null;
}

export interface LegacySaleLike {
  code: string;
  profile: string | null;
  price_cents: number | null;
  sold_at: string;
  site_id: string | null;
  router_id: string | null;
}

const ms = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * Builds the single stream of revenue entries.
 *
 * Eligibility and double-counting rules:
 *  - a voucher is financially eligible only when its access has finished
 *    (`used`): it was first seen and is now expired;
 *  - a voucher that carries `order_id` is paid for by that order, so its
 *    redemption is never counted again;
 *  - a legacy manual sale must also point to an eligible voucher and is
 *    skipped when an order covers that code;
 *  - a refund for an eligible voucher adds a negative entry, it does not
 *    delete the original gross entry.
 */
export function buildRevenueEntries(input: {
  orders: OrderLike[];
  vouchers: VoucherLike[];
  legacySales: LegacySaleLike[];
}): RevenueEntry[] {
  const entries: RevenueEntry[] = [];
  const orderCodes = new Set<string>();
  const cancelledVoucherCodes = new Set(
    input.vouchers
      .filter((voucher) => ["cancelled", "deleted"].includes((voucher.status ?? "").toLowerCase()))
      .map((voucher) => voucher.code),
  );
  const cancelledVoucherOrderIds = new Set(
    input.vouchers
      .filter((voucher) => ["cancelled", "deleted"].includes((voucher.status ?? "").toLowerCase()))
      .map((voucher) => voucher.order_id)
      .filter((id): id is string => Boolean(id)),
  );
  const vouchersByCode = new Map(input.vouchers.map((voucher) => [voucher.code, voucher]));
  const vouchersByOrderId = new Map(
    input.vouchers
      .filter((voucher) => Boolean(voucher.order_id))
      .map((voucher) => [voucher.order_id!, voucher]),
  );
  const legacySaleCodes = new Set(input.legacySales.map((sale) => sale.code));
  const isEligibleVoucher = (voucher: VoucherLike | undefined) => {
    const status = (voucher?.status ?? "").toLowerCase();
    const expiresAt = ms(voucher?.expires_at ?? null);
    return Boolean(
      voucher &&
      !["cancelled", "deleted"].includes(status) &&
      ms(voucher.first_seen_at) != null &&
      (status === "expired" || (expiresAt != null && expiresAt <= Date.now())),
    );
  };

  for (const o of input.orders) {
    if (o.issued_code) orderCodes.add(o.issued_code);
    // A cancelled code is not a completed voucher sale. Paid codes are
    // protected from cancellation by the server action, while this guard also
    // keeps historical bad data out of the financial rollup.
    if (
      (o.issued_code && cancelledVoucherCodes.has(o.issued_code)) ||
      cancelledVoucherOrderIds.has(o.id)
    ) {
      continue;
    }
    const voucher =
      vouchersByOrderId.get(o.id) ??
      (o.issued_code ? vouchersByCode.get(o.issued_code) : undefined);
    // A paid code is not income until a guest actually uses it. This also
    // prevents unrelated Tier Pass or manual orders from entering hotspot
    // voucher revenue.
    if (!isEligibleVoucher(voucher)) continue;
    const settledAt = ms(o.settled_at);
    const isSettled = (o.status === "settled" || o.status === "refunded") && settledAt != null;
    if (isSettled) {
      entries.push({
        at: settledAt!,
        amount: o.amount_minor,
        source: o.method === "cash" ? "cash" : "online",
        plan: o.plan_label,
        code: o.issued_code,
        site_id: o.site_id,
        router_id: o.router_id,
      });
    }
    if (o.status === "refunded") {
      const at = ms(o.refunded_at) ?? settledAt ?? ms(o.created_at) ?? Date.now();
      entries.push({
        at,
        amount: -o.amount_minor,
        source: "refund",
        plan: o.plan_label,
        code: o.issued_code,
        site_id: o.site_id,
        router_id: o.router_id,
      });
    }
  }

  for (const v of input.vouchers) {
    if (["cancelled", "deleted"].includes((v.status ?? "").toLowerCase())) continue;
    if (v.order_id) continue; // already counted through its order
    // A recorded historical cash sale supplies the amount for this redeemed
    // code, so do not also add its face value as a legacy voucher entry.
    if (legacySaleCodes.has(v.code)) continue;
    // Historical vouchers follow the exact same recognition rule as ordered
    // vouchers: a guest may be online, but revenue is recognised only once
    // that voucher has reached the dashboard's Used state.
    if (!isEligibleVoucher(v)) continue;
    const at = ms(v.first_seen_at);
    if (at == null) continue;
    entries.push({
      at,
      amount: v.price_mmk ?? 0,
      source: "legacy_voucher",
      plan: v.plan_label || v.plan_key || "Unknown",
      code: v.code,
      site_id: v.site_id,
      router_id: v.router_id,
    });
  }

  for (const s of input.legacySales) {
    const voucher = vouchersByCode.get(s.code);
    if (!isEligibleVoucher(voucher)) continue;
    if (orderCodes.has(s.code)) continue; // the order is the source of truth
    const at = ms(s.sold_at);
    if (at == null) continue;
    entries.push({
      at,
      amount: s.price_cents ?? 0,
      source: "legacy_manual",
      plan: s.profile || "Manual",
      code: s.code,
      site_id: s.site_id,
      router_id: s.router_id,
    });
  }

  return entries.sort((a, b) => a.at - b.at);
}

export interface RevenueTotals {
  net: number;
  gross: number;
  refunds: number;
  online: number;
  cash: number;
  legacy: number;
  count: number;
}

export function totalsFor(
  entries: RevenueEntry[],
  from = 0,
  to = Number.MAX_SAFE_INTEGER,
): RevenueTotals {
  const t: RevenueTotals = {
    net: 0,
    gross: 0,
    refunds: 0,
    online: 0,
    cash: 0,
    legacy: 0,
    count: 0,
  };
  for (const e of entries) {
    if (e.at < from || e.at >= to) continue;
    t.net += e.amount;
    if (e.source === "refund") {
      t.refunds += -e.amount;
      continue;
    }
    t.gross += e.amount;
    t.count += 1;
    if (e.source === "online") t.online += e.amount;
    else if (e.source === "cash") t.cash += e.amount;
    else t.legacy += e.amount;
  }
  return t;
}

export function breakdownBySource(entries: RevenueEntry[]): Record<RevenueSource, number> {
  const out: Record<RevenueSource, number> = {
    online: 0,
    cash: 0,
    refund: 0,
    legacy_voucher: 0,
    legacy_manual: 0,
  };
  for (const e of entries) out[e.source] += e.amount;
  return out;
}
