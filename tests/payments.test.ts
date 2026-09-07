import { describe, it, expect } from "vitest";
import { handlePaymentEvent, cashSettlementEvent, type PaymentStore } from "@/lib/payments/core";
import type { NormalizedEvent, OrderRecord } from "@/lib/payments/types";
import { reconcileSessions, type StoredSession } from "@/lib/payments/sessions";
import { buildRevenueEntries, totalsFor, breakdownBySource } from "@/lib/payments/accounting";
import { availableProviders, providerById } from "@/lib/payments/providers";

function makeOrder(over: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "order-1",
    owner_id: "owner-1",
    status: "pending",
    method: "online",
    provider: "hosted",
    provider_ref: "order-1",
    amount_minor: 1000,
    currency: "MMK",
    plan_id: "plan-1",
    plan_key: "1d",
    plan_label: "1 Day",
    router_id: null,
    site_id: null,
    device_mac: null,
    voucher_code_id: null,
    issued_code: null,
    fulfilled_at: null,
    settled_at: null,
    refunded_at: null,
    failure_reason: null,
    note: null,
    contact_hint: null,
    checkout_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  } as OrderRecord;
}

function memoryStore(order: OrderRecord | null) {
  const events = new Set<string>();
  const state = { order, issued: 0, failNextIssue: false };
  const store: PaymentStore = {
    async findOrder(ref) {
      if (!state.order) return null;
      return state.order.id === ref || state.order.provider_ref === ref ? state.order : null;
    },
    async patchOrder(_id, patch) {
      state.order = { ...(state.order as OrderRecord), ...(patch as object) } as OrderRecord;
    },
    async claimEvent(e) {
      const key = `${e.provider}:${e.eventId}`;
      if (events.has(key)) return false;
      events.add(key);
      return true;
    },
    async finishEvent() {},
    async releaseEvent(provider, eventId) {
      events.delete(`${provider}:${eventId}`);
    },
    async issueVoucher() {
      if (state.failNextIssue) {
        state.failNextIssue = false;
        throw new Error("RouterOS unreachable");
      }
      state.issued += 1;
      return { voucherId: `v-${state.issued}`, code: `CODE${state.issued}` };
    },
  };
  return { store, state };
}

const settled = (id: string, ref = "order-1"): NormalizedEvent => ({
  provider: "hosted",
  eventId: id,
  type: "payment.settled",
  orderRef: ref,
});

describe("webhook idempotency and fulfilment", () => {
  it("issues a voucher exactly once for a repeated event", async () => {
    const { store, state } = memoryStore(makeOrder());
    const first = await handlePaymentEvent(store, settled("evt-1"));
    const second = await handlePaymentEvent(store, settled("evt-1"));
    expect(first.outcome).toBe("fulfilled");
    expect(second.outcome).toBe("duplicate_event");
    expect(state.issued).toBe(1);
    expect(state.order?.status).toBe("settled");
    expect(state.order?.issued_code).toBe("CODE1");
  });

  it("does not re-issue when a different event settles an already fulfilled order", async () => {
    const { store, state } = memoryStore(makeOrder());
    await handlePaymentEvent(store, settled("evt-1"));
    const again = await handlePaymentEvent(store, settled("evt-2"));
    expect(again.outcome).toBe("already_fulfilled");
    expect(state.issued).toBe(1);
  });

  it("ignores unknown orders instead of throwing", async () => {
    const { store } = memoryStore(null);
    const res = await handlePaymentEvent(store, settled("evt-x", "missing"));
    expect(res.outcome).toBe("unknown_order");
  });

  it("marks failure without issuing a voucher", async () => {
    const { store, state } = memoryStore(makeOrder());
    const res = await handlePaymentEvent(store, {
      provider: "hosted",
      eventId: "evt-f",
      type: "payment.failed",
      orderRef: "order-1",
      reason: "card declined",
    });
    expect(res.outcome).toBe("failed");
    expect(state.issued).toBe(0);
    expect(state.order?.status).toBe("failed");
  });

  it("refunds a settled order without deleting the issued code", async () => {
    const { store, state } = memoryStore(makeOrder());
    await handlePaymentEvent(store, settled("evt-1"));
    const res = await handlePaymentEvent(store, {
      provider: "hosted",
      eventId: "evt-r",
      type: "payment.refunded",
      orderRef: "order-1",
    });
    expect(res.outcome).toBe("refunded");
    expect(state.order?.status).toBe("refunded");
    expect(state.order?.issued_code).toBe("CODE1");
  });

  it("settles cash sales through the same path, once", async () => {
    const { store, state } = memoryStore(makeOrder({ method: "cash", provider: "manual" }));
    const a = await handlePaymentEvent(store, cashSettlementEvent("order-1"));
    const b = await handlePaymentEvent(store, cashSettlementEvent("order-1"));
    expect(a.outcome).toBe("fulfilled");
    expect(b.outcome).toBe("duplicate_event");
    expect(state.issued).toBe(1);
  });

  it("releases the claim when RouterOS issue fails so cash can retry", async () => {
    const { store, state } = memoryStore(makeOrder({ method: "cash", provider: "manual" }));
    state.failNextIssue = true;
    await expect(handlePaymentEvent(store, cashSettlementEvent("order-1"))).rejects.toThrow(
      /RouterOS unreachable/,
    );
    expect(state.issued).toBe(0);
    expect(state.order?.status).toBe("pending");
    expect(state.order?.failure_reason).toMatch(/RouterOS unreachable/);
    const retry = await handlePaymentEvent(store, cashSettlementEvent("order-1"));
    expect(retry.outcome).toBe("fulfilled");
    expect(state.issued).toBe(1);
    expect(state.order?.issued_code).toBe("CODE1");
  });
});

describe("payment providers", () => {
  it("offers no online payment gateway — cash and manual bank transfer only", () => {
    const ids = availableProviders().map((p) => p.id);
    expect(ids).toEqual(["manual"]);
    expect(availableProviders().some((p) => p.supportsOnline)).toBe(false);
    expect(providerById("hosted").id).toBe("manual");
  });
});

describe("session reconciliation", () => {
  const base: StoredSession = {
    id: "s1",
    external_session_id: "*1",
    device_mac: "AA:BB",
    code: "CODE1",
    started_at: new Date().toISOString(),
    ended_at: null,
    bytes_in: 100,
    bytes_out: 50,
    duration_seconds: 60,
    reconcile_status: "open",
    source_seen_at: null,
    termination_reason: null,
  };

  it("closes sessions the router no longer reports", () => {
    const { updates } = reconcileSessions({ stored: [base], samples: [], reachable: true });
    expect(updates[0]?.reconcile_status).toBe("closed");
    expect(updates[0]?.termination_reason).toBe("router-report");
  });

  it("marks sessions stale instead of closing them when the router is offline", () => {
    const { updates, inserts } = reconcileSessions({
      stored: [base],
      samples: [],
      reachable: false,
    });
    expect(inserts).toHaveLength(0);
    expect(updates[0]?.reconcile_status).toBe("stale");
    expect(updates[0]?.ended_at).toBeUndefined();
  });

  it("reopens a stale session on reconnect and keeps counters monotonic", () => {
    const stale = { ...base, reconcile_status: "stale" as const };
    const { updates } = reconcileSessions({
      stored: [stale],
      samples: [
        {
          external_session_id: "*1",
          device_mac: "AA:BB",
          device_ip: "10.0.0.2",
          username: "CODE1",
          code: "CODE1",
          bytes_in: 20, // router rebooted: counter went backwards
          bytes_out: 400,
          duration_seconds: 30,
        },
      ],
      reachable: true,
    });
    expect(updates[0]?.reconcile_status).toBe("open");
    expect(updates[0]?.bytes_in).toBe(120); // 100 + 20, not 20
    expect(updates[0]?.bytes_out).toBe(400);
    expect(updates[0]?.duration_seconds).toBe(60);
  });

  it("inserts sessions it has never seen", () => {
    const { inserts } = reconcileSessions({
      stored: [],
      samples: [
        {
          external_session_id: "*9",
          device_mac: null,
          device_ip: null,
          username: null,
          code: null,
          bytes_in: 1,
          bytes_out: 2,
          duration_seconds: 3,
        },
      ],
      reachable: true,
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.reconcile_status).toBe("open");
  });

  it("does not create duplicate work when the same poll is applied twice", () => {
    const sample = {
      external_session_id: "*9",
      device_mac: "AA:BB",
      device_ip: "10.0.0.2",
      username: "CODE1",
      code: "CODE1",
      bytes_in: 10,
      bytes_out: 20,
      duration_seconds: 4,
    };
    const first = reconcileSessions({ stored: [], samples: [sample], reachable: true, now: 1000 });
    const second = reconcileSessions({
      stored: [
        {
          ...base,
          id: "created-by-first-apply",
          external_session_id: sample.external_session_id,
          bytes_in: sample.bytes_in,
          bytes_out: sample.bytes_out,
          duration_seconds: sample.duration_seconds,
        },
      ],
      samples: [sample],
      reachable: true,
      now: 1000,
    });
    expect(first.inserts).toHaveLength(1);
    expect(second.inserts).toHaveLength(0);
    expect(second.updates).toHaveLength(1);
    expect(second.updates[0]?.id).toBe("created-by-first-apply");
  });
});

describe("revenue accounting", () => {
  const day = 86_400_000;
  const t0 = Date.UTC(2026, 0, 10);
  const iso = (ms: number) => new Date(ms).toISOString();

  const entries = buildRevenueEntries({
    orders: [
      {
        id: "o1",
        status: "settled",
        method: "online",
        amount_minor: 1000,
        plan_label: "1 Day",
        issued_code: "A1",
        site_id: null,
        router_id: null,
        settled_at: iso(t0),
        refunded_at: null,
        created_at: iso(t0),
      },
      {
        id: "o2",
        status: "settled",
        method: "cash",
        amount_minor: 5000,
        plan_label: "7 Days",
        issued_code: "B2",
        site_id: null,
        router_id: null,
        settled_at: iso(t0 + day),
        refunded_at: null,
        created_at: iso(t0 + day),
      },
      {
        id: "o3",
        status: "refunded",
        method: "online",
        amount_minor: 1000,
        plan_label: "1 Day",
        issued_code: "C3",
        site_id: null,
        router_id: null,
        settled_at: iso(t0 + 2 * day),
        refunded_at: iso(t0 + 3 * day),
        created_at: iso(t0 + 2 * day),
      },
      {
        id: "o4",
        status: "pending",
        method: "online",
        amount_minor: 9999,
        plan_label: "1 Day",
        issued_code: null,
        site_id: null,
        router_id: null,
        settled_at: null,
        refunded_at: null,
        created_at: iso(t0 + 4 * day),
      },
    ],
    vouchers: [
      // paid through o1 — must not be counted twice
      {
        code: "A1",
        plan_label: "1 Day",
        plan_key: "1d",
        price_mmk: 1000,
        first_seen_at: iso(t0),
        status: "expired",
        site_id: null,
        router_id: null,
        order_id: "o1",
      },
      // legacy redemption with no order behind it
      {
        code: "L1",
        plan_label: "1 Day",
        plan_key: "1d",
        price_mmk: 700,
        first_seen_at: iso(t0),
        status: "expired",
        site_id: null,
        router_id: null,
        order_id: null,
      },
      // Orders only enter revenue after their issued code is redeemed.
      {
        code: "B2",
        plan_label: "7 Days",
        plan_key: "7d",
        price_mmk: 5000,
        first_seen_at: iso(t0 + day),
        status: "expired",
        site_id: null,
        router_id: null,
        order_id: "o2",
      },
      {
        code: "C3",
        plan_label: "1 Day",
        plan_key: "1d",
        price_mmk: 1000,
        first_seen_at: iso(t0 + 2 * day),
        status: "expired",
        site_id: null,
        router_id: null,
        order_id: "o3",
      },
      {
        code: "M9",
        plan_label: "1 Day",
        plan_key: "1d",
        price_mmk: 300,
        first_seen_at: iso(t0),
        status: "expired",
        site_id: null,
        router_id: null,
        order_id: null,
      },
    ],
    legacySales: [
      // duplicate of the o2 order — skipped
      {
        code: "B2",
        profile: "7d",
        price_cents: 5000,
        sold_at: iso(t0 + day),
        site_id: null,
        router_id: null,
      },
      {
        code: "M9",
        profile: "1d",
        price_cents: 300,
        sold_at: iso(t0),
        site_id: null,
        router_id: null,
      },
    ],
  });

  it("excludes legacy revenue for a cancelled voucher code", () => {
    const entries = buildRevenueEntries({
      orders: [],
      vouchers: [
        {
          code: "TEST-CANCELLED",
          plan_label: "Test",
          plan_key: "test",
          price_mmk: 5000,
          first_seen_at: iso(t0),
          site_id: null,
          router_id: null,
          order_id: null,
          status: "cancelled",
        },
      ],
      legacySales: [
        {
          code: "TEST-CANCELLED",
          profile: "test",
          price_cents: 5000,
          sold_at: iso(t0),
          site_id: null,
          router_id: null,
        },
      ],
    });
    expect(entries).toEqual([]);
  });

  it("does not count a settled order whose linked voucher was cancelled", () => {
    const entries = buildRevenueEntries({
      orders: [
        {
          id: "paid-cancelled",
          status: "settled",
          method: "cash",
          amount_minor: 5000,
          plan_label: "Test",
          issued_code: "PAID-CANCELLED",
          site_id: null,
          router_id: null,
          settled_at: iso(t0),
          refunded_at: null,
          created_at: iso(t0),
        },
      ],
      vouchers: [
        {
          code: "PAID-CANCELLED",
          plan_label: "Test",
          plan_key: "test",
          price_mmk: 5000,
          first_seen_at: null,
          site_id: null,
          router_id: null,
          order_id: "paid-cancelled",
          status: "cancelled",
        },
      ],
      legacySales: [],
    });
    expect(entries).toEqual([]);
  });

  it("never counts an order and its voucher or legacy sale twice", () => {
    expect(entries.filter((e) => e.code === "A1")).toHaveLength(1);
    expect(entries.filter((e) => e.code === "B2")).toHaveLength(1);
  });

  it("excludes a settled voucher order until its code is Used", () => {
    const unpaidUse = buildRevenueEntries({
      orders: [
        {
          id: "paid-unused",
          status: "settled",
          method: "cash",
          amount_minor: 2500,
          plan_label: "1 Day",
          issued_code: "UNUSED",
          site_id: null,
          router_id: null,
          settled_at: iso(t0),
          refunded_at: null,
          created_at: iso(t0),
        },
      ],
      vouchers: [
        {
          code: "UNUSED",
          plan_label: "1 Day",
          plan_key: "1d",
          price_mmk: 2500,
          first_seen_at: null,
          site_id: null,
          router_id: null,
          order_id: "paid-unused",
          status: "active",
        },
      ],
      legacySales: [],
    });
    expect(totalsFor(unpaidUse)).toMatchObject({ gross: 0, net: 0, count: 0 });
  });

  it("excludes a settled voucher while its access is still active", () => {
    const activeAccess = buildRevenueEntries({
      orders: [
        {
          id: "paid-active",
          status: "settled",
          method: "cash",
          amount_minor: 2500,
          plan_label: "1 Day",
          issued_code: "ACTIVE",
          site_id: null,
          router_id: null,
          settled_at: iso(t0),
          refunded_at: null,
          created_at: iso(t0),
        },
      ],
      vouchers: [
        {
          code: "ACTIVE",
          plan_label: "1 Day",
          plan_key: "1d",
          price_mmk: 2500,
          first_seen_at: iso(t0),
          expires_at: new Date(Date.now() + day).toISOString(),
          site_id: null,
          router_id: null,
          order_id: "paid-active",
          status: "active",
        },
      ],
      legacySales: [],
    });
    expect(totalsFor(activeAccess)).toMatchObject({ gross: 0, net: 0, count: 0 });
  });

  it("excludes a legacy voucher while its access is still active", () => {
    const activeLegacy = buildRevenueEntries({
      orders: [],
      vouchers: [
        {
          code: "LEGACY-ACTIVE",
          plan_label: "1 Day",
          plan_key: "1d",
          price_mmk: 2500,
          first_seen_at: iso(t0),
          expires_at: new Date(Date.now() + day).toISOString(),
          site_id: null,
          router_id: null,
          order_id: null,
          status: "active",
        },
      ],
      legacySales: [],
    });
    expect(totalsFor(activeLegacy)).toMatchObject({ gross: 0, net: 0, count: 0 });
  });

  it("excludes pending orders and subtracts refunds from net only", () => {
    const t = totalsFor(entries);
    // gross = 1000 + 5000 + 1000 + 700 + 300
    expect(t.gross).toBe(8000);
    expect(t.refunds).toBe(1000);
    expect(t.net).toBe(7000);
    expect(t.count).toBe(5);
  });

  it("splits totals by source", () => {
    const t = totalsFor(entries);
    expect(t.online).toBe(2000);
    expect(t.cash).toBe(5000);
    expect(t.legacy).toBe(1000);
    const by = breakdownBySource(entries);
    expect(by.legacy_voucher).toBe(700);
    expect(by.legacy_manual).toBe(300);
    expect(by.refund).toBe(-1000);
  });

  it("windows totals by time", () => {
    const onlyFirstDay = totalsFor(entries, t0, t0 + day);
    expect(onlyFirstDay.gross).toBe(2000); // 1000 online + 700 legacy + 300 manual
  });
});
