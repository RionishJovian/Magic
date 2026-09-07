import { describe, it, expect } from "vitest";
import { maskAccountNumber, toPublicBanks, toMaskedBanks, amountDue } from "@/lib/payments/bank";
import { validateReceipt, receiptObjectKey, isRateLimited } from "@/lib/payments/receipts";
import {
  hashToken,
  newReviewToken,
  checkToken,
  applyReview,
  type ReviewStore,
} from "@/lib/payments/review";
import type { OrderRecord } from "@/lib/payments/types";

const banks = [
  {
    id: "b1",
    slot: 1,
    holder_name: "Aung Aung",
    bank_name: "KBZ",
    account_number: "1234567890123",
    enabled: true,
    sort: 0,
  },
  {
    id: "b2",
    slot: 2,
    holder_name: "Aung Aung",
    bank_name: "AYA",
    account_number: "9876543210",
    enabled: false,
    sort: 1,
  },
];

describe("bank display and amount", () => {
  it("masks all but the last four digits", () => {
    expect(maskAccountNumber("1234567890123")).toMatch(/0123$/);
    expect(maskAccountNumber("1234567890123")).not.toContain("123456789");
    expect(maskAccountNumber("12")).not.toContain("12");
  });

  it("shows guests only enabled accounts, in order, with full numbers", () => {
    const pub = toPublicBanks(banks as never);
    expect(pub).toHaveLength(1);
    expect(pub[0]!.account_number).toBe("1234567890123");
    expect(pub[0]!.slot).toBe(1);
  });

  it("never leaks a full number in the masked view", () => {
    const masked = toMaskedBanks(banks as never);
    expect(masked.every((m) => !m.account_number_masked.includes("123456789"))).toBe(true);
  });

  it("derives the order amount from the plan, not the client", () => {
    expect(amountDue({ price_mmk: 1500 })).toMatchObject({ amount_minor: 1500, currency: "MMK" });
    expect(amountDue({ price_mmk: null }).amount_minor).toBe(0);
  });
});

describe("receipt upload validation", () => {
  it("accepts phone photos and PDFs", () => {
    expect(validateReceipt({ mime: "image/jpeg", size: 500_000 }).ok).toBe(true);
    expect(validateReceipt({ mime: "application/pdf", size: 500_000 }).ok).toBe(true);
  });

  it("rejects SVG, HTML and other renderable payloads", () => {
    expect(validateReceipt({ mime: "image/svg+xml", size: 100 }).ok).toBe(false);
    expect(validateReceipt({ mime: "text/html", size: 100 }).ok).toBe(false);
  });

  it("rejects oversized files", () => {
    const r = validateReceipt({ mime: "image/png", size: 20 * 1024 * 1024 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("too_large");
  });

  it("generates unguessable, tenant-scoped object keys", () => {
    const a = receiptObjectKey({ ownerId: "own", orderId: "ord", extension: "jpg" });
    const b = receiptObjectKey({ ownerId: "own", orderId: "ord", extension: "jpg" });
    expect(a).not.toBe(b);
    expect(a.startsWith("own/ord/")).toBe(true);
    expect(a.endsWith(".jpg")).toBe(true);
  });

  it("rate limits repeated submissions for one order", () => {
    const now = Date.now();
    const many = Array.from({ length: 5 }, (_, i) => ({
      submitted_at: new Date(now - i * 1000).toISOString(),
    }));
    expect(isRateLimited(many)).toBe(true);
    expect(isRateLimited([{ submitted_at: new Date(now - 86_400_000).toISOString() }])).toBe(false);
  });
});

function reviewStore(order: OrderRecord) {
  const state = {
    order,
    issued: 0,
    receipts: [] as Array<{ id: string; status?: string; reject_reason?: string | null }>,
    audits: [] as Array<Parameters<ReviewStore["audit"]>[0]>,
  };
  const store: ReviewStore = {
    async findOrder(ref) {
      return state.order.id === ref ? state.order : null;
    },
    async patchOrder(_id, patch) {
      state.order = { ...state.order, ...(patch as object) } as OrderRecord;
    },
    async claimEvent() {
      return true;
    },
    async finishEvent() {},
    async issueVoucher() {
      state.issued += 1;
      return { voucherId: `v${state.issued}`, code: `CODE${state.issued}` };
    },
    async patchReceipt(id, patch) {
      state.receipts.push({ id, ...patch });
    },
    async audit(entry) {
      state.audits.push(entry);
    },
  };
  return { store, state };
}

const order = (over: Partial<OrderRecord> = {}): OrderRecord =>
  ({
    id: "11111111-1111-4111-8111-111111111111",
    owner_id: "owner-1",
    status: "pending_review",
    method: "bank_transfer",
    provider: "bank_transfer",
    provider_ref: null,
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
  }) as OrderRecord;

describe("review token security", () => {
  const future = () => new Date(Date.now() + 60_000).toISOString();
  const past = () => new Date(Date.now() - 60_000).toISOString();
  const row = (over: Record<string, unknown> = {}) => ({
    id: "tok-1",
    order_id: "o1",
    owner_id: "owner-1",
    receipt_id: "r1",
    actor_ref: "chat-1",
    expires_at: future(),
    used_at: null,
    ...over,
  });

  it("hashes tokens so the raw value is never stored", async () => {
    const { token, hash } = await newReviewToken();
    expect(hash).not.toBe(token);
    expect(await hashToken(token)).toBe(hash);
  });

  it("rejects unknown, expired, used and mismatched-actor tokens", () => {
    expect(checkToken(null, { actor: "chat-1" }).reason).toBe("unknown");
    expect(checkToken(row({ expires_at: past() }) as never, { actor: "chat-1" }).reason).toBe(
      "expired",
    );
    expect(checkToken(row({ used_at: past() }) as never, { actor: "chat-1" }).reason).toBe("used");
    expect(checkToken(row() as never, { actor: "someone-else" }).reason).toBe("actor_mismatch");
    expect(checkToken(row() as never, { actor: "chat-1" }).ok).toBe(true);
  });
});

describe("approve / reject fulfilment", () => {
  it("issues a voucher exactly once no matter how often approve is applied", async () => {
    const { store, state } = reviewStore(order());
    const first = await applyReview(store, {
      orderId: state.order.id,
      ownerId: "owner-1",
      receiptId: "r1",
      tokenId: "tok-1",
      decision: "approve",
      actor: "telegram",
    });
    const second = await applyReview(store, {
      orderId: state.order.id,
      ownerId: "owner-1",
      receiptId: "r1",
      tokenId: "tok-2",
      decision: "approve",
      actor: "web",
    });
    expect(first.outcome).toBe("approved");
    expect(second.outcome).toBe("already_approved");
    expect(state.issued).toBe(1);
    expect(state.order.issued_code).toBe("CODE1");
  });

  it("records a reason on rejection and issues nothing", async () => {
    const { store, state } = reviewStore(order());
    const r = await applyReview(store, {
      orderId: state.order.id,
      ownerId: "owner-1",
      receiptId: "r1",
      tokenId: "tok-1",
      decision: "reject",
      actor: "web",
      reason: "Amount does not match",
    });
    expect(r.outcome).toBe("rejected");
    expect(state.issued).toBe(0);
    expect(state.order.status).toBe("rejected");
    expect(state.order.failure_reason).toBe("Amount does not match");
    expect(state.audits.at(-1)?.to).toBe("rejected");
  });

  it("allows a rejected order to be approved after a fresh receipt", async () => {
    const { store, state } = reviewStore(order({ status: "rejected" }));
    const r = await applyReview(store, {
      orderId: state.order.id,
      ownerId: "owner-1",
      receiptId: "r2",
      tokenId: "tok-3",
      decision: "approve",
      actor: "web",
    });
    expect(r.outcome).toBe("approved");
    expect(state.issued).toBe(1);
  });

  it("audits every state change", async () => {
    const { store, state } = reviewStore(order());
    await applyReview(store, {
      orderId: state.order.id,
      ownerId: "owner-1",
      receiptId: "r1",
      tokenId: "tok-1",
      decision: "approve",
      actor: "telegram",
    });
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0].actor).toBe("telegram");
  });
});
