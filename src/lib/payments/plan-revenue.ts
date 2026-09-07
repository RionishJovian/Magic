// Pure, owner-plan-scoped voucher accounting.
//
// Everything here works on plain rows so it can be unit tested without a
// database. A voucher contributes to revenue only after it reaches the
// dashboard's `used` state. First use while access remains active is
// operational activity, not recognised revenue.

export type VoucherState = "unused" | "active" | "used" | "expired" | "cancelled";

export interface PlanProfileLike {
  plan_key: string | null;
  label: string;
  status?: string | null;
}

export interface PlanVoucherLike {
  id?: string;
  code: string;
  plan_key: string | null;
  plan_label: string | null;
  price_mmk: number | null;
  status: string | null;
  created_at: string;
  first_seen_at: string | null;
  expires_at: string | null;
  device_mac?: string | null;
  site_id?: string | null;
  router_id?: string | null;
  order_id?: string | null;
}

export interface PlanOrderLike {
  id?: string;
  plan_key: string | null;
  plan_label: string | null;
  status: string;
  amount_minor: number;
  issued_code?: string | null;
  settled_at?: string | null;
  refunded_at: string | null;
}

export interface PlanPerformance {
  plan_key: string;
  label: string;
  status: "active" | "inactive" | "archived";
  issued: number;
  active: number;
  used: number;
  expired: number;
  cancelled: number;
  unused: number;
  gross: number;
  refunded: number;
  net: number;
  redemption_rate: number;
  lost_mmk: number;
}

const time = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
};

/** Key a voucher is grouped under. Falls back to its label so nothing is lost. */
export function planKeyOf(v: { plan_key: string | null; plan_label: string | null }): string {
  return v.plan_key || v.plan_label || "unknown";
}

/**
 * One state per voucher:
 * - `cancelled` — voided by the owner, never billable
 * - `active`    — redeemed and still inside its validity window
 * - `used`      — redeemed and now past its validity window
 * - `expired`   — never redeemed and past its validity window (lost potential)
 * - `unused`    — issued, still redeemable
 */
export function voucherState(v: PlanVoucherLike, now = Date.now()): VoucherState {
  // `deleted` was the historical soft-delete marker. Treat it as cancelled
  // while the data migration brings existing rows forward.
  if (["cancelled", "deleted"].includes((v.status ?? "").toLowerCase())) return "cancelled";
  const first = time(v.first_seen_at);
  const expires = time(v.expires_at);
  const past = (v.status ?? "").toLowerCase() === "expired" || (expires != null && expires <= now);
  if (first != null) return past ? "used" : "active";
  return past ? "expired" : "unused";
}

/** A redemption is a voucher-use signal, not necessarily recognised revenue. */
export function isRedeemed(state: VoucherState): boolean {
  return state === "active" || state === "used";
}

/** Revenue is recognised only once the dashboard shows the code as Used. */
export function isRevenueEligible(state: VoucherState): boolean {
  return state === "used";
}

export function planPerformance(
  vouchers: readonly PlanVoucherLike[],
  orders: readonly PlanOrderLike[] = [],
  plans: readonly PlanProfileLike[] = [],
  now = Date.now(),
): PlanPerformance[] {
  const out = new Map<string, PlanPerformance>();

  const blank = (key: string, label: string, status: PlanPerformance["status"]) => ({
    plan_key: key,
    label,
    status,
    issued: 0,
    active: 0,
    used: 0,
    expired: 0,
    cancelled: 0,
    unused: 0,
    gross: 0,
    refunded: 0,
    net: 0,
    redemption_rate: 0,
    lost_mmk: 0,
  });

  // Every owner-created plan appears, even with no activity yet.
  for (const p of plans) {
    const key = p.plan_key || p.label;
    out.set(key, blank(key, p.label, p.status === "inactive" ? "inactive" : "active"));
  }

  const voucherByCode = new Map(vouchers.map((voucher) => [voucher.code, voucher]));
  const voucherByOrderId = new Map(
    vouchers
      .filter((voucher) => Boolean(voucher.order_id))
      .map((voucher) => [voucher.order_id!, voucher]),
  );
  const orderCodes = new Set(
    orders.map((order) => order.issued_code).filter((code): code is string => Boolean(code)),
  );

  for (const v of vouchers) {
    const key = planKeyOf(v);
    const row = out.get(key) ?? blank(key, v.plan_label || key, "archived");
    out.set(key, row);
    row.issued += 1;
    const state = voucherState(v, now);
    row[state] += 1;
    const price = v.price_mmk ?? 0;
    // Legacy stock has no order. It is financially recognised only after it
    // reaches the same Used state as every other voucher.
    if (isRevenueEligible(state) && !v.order_id && !orderCodes.has(v.code)) row.gross += price;
    if (state === "expired") row.lost_mmk += price;
  }

  for (const o of orders) {
    const voucher =
      (o.id ? voucherByOrderId.get(o.id) : undefined) ??
      (o.issued_code ? voucherByCode.get(o.issued_code) : undefined);
    // Paid stock and active access are not revenue. The voucher must reach
    // the same Used state shown in the owner dashboard.
    if (!voucher || !isRevenueEligible(voucherState(voucher, now))) continue;
    const key = planKeyOf(voucher);
    const row = out.get(key) ?? blank(key, voucher.plan_label || key, "archived");
    out.set(key, row);
    if ((o.status === "settled" || o.status === "refunded") && o.settled_at) {
      row.gross += o.amount_minor ?? 0;
    }
    if (o.refunded_at || o.status === "refunded") row.refunded += o.amount_minor ?? 0;
  }

  for (const row of out.values()) {
    row.net = row.gross - row.refunded;
    row.redemption_rate = row.issued ? Math.round(((row.active + row.used) / row.issued) * 100) : 0;
  }

  return [...out.values()].sort((a, b) => b.net - a.net || a.label.localeCompare(b.label));
}

export interface VoucherFilter {
  /** `all` keeps every state. */
  state?: VoucherState | "all" | "redeemed";
  plan_key?: string | null;
  search?: string | null;
}

export interface InspectableVoucher extends PlanVoucherLike {
  state: VoucherState;
}

/** Voucher inspector rows: newest first, with the derived state attached. */
export function filterVouchers(
  vouchers: readonly PlanVoucherLike[],
  filter: VoucherFilter = {},
  now = Date.now(),
): InspectableVoucher[] {
  const needle = (filter.search ?? "").trim().toLowerCase();
  return vouchers
    .map((v) => ({ ...v, state: voucherState(v, now) }))
    .filter((v) => {
      if (filter.plan_key && planKeyOf(v) !== filter.plan_key) return false;
      if (filter.state && filter.state !== "all") {
        if (filter.state === "redeemed") {
          if (!isRedeemed(v.state)) return false;
        } else if (v.state !== filter.state) return false;
      }
      if (needle) {
        const hay = [v.code, v.plan_label ?? "", v.device_mac ?? ""].join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    })
    .sort((a, b) => (time(b.created_at) ?? 0) - (time(a.created_at) ?? 0));
}
