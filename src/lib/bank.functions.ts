import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { maskAccountNumber, type BankAccount } from "./payments/bank";
import type { DatabaseClient } from "./database.types";

/**
 * Bank-transfer settings and receipt review. Bank account numbers are only
 * ever returned in full to the owner/admin of the tenant; every other surface
 * (and every log line) sees the masked form.
 */

const BANK_COLUMNS = "id, slot, holder_name, bank_name, account_number, enabled, sort";

async function ownerOf(supabase: DatabaseClient, userId: string): Promise<string> {
  const { data } = await supabase.rpc("effective_owner", { _user_id: userId });
  return (data as string | null) ?? userId;
}

export const listBankAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { hasFeature } = await import("./guards.server");
    const canEdit = await hasFeature(context.supabase, context.userId, "bank_edit");
    const { data, error } = await context.supabase
      .from("payment_bank_accounts")
      .select(BANK_COLUMNS)
      .order("sort", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as BankAccount[];
    return {
      can_edit: canEdit,
      accounts: rows.map((a) => ({
        ...a,
        account_number: canEdit ? a.account_number : maskAccountNumber(a.account_number),
      })),
    };
  });

export const saveBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        slot: z.number().int().min(1).max(2),
        holder_name: z.string().trim().max(120).default(""),
        bank_name: z.string().trim().max(120).default(""),
        account_number: z.string().trim().max(60).default(""),
        enabled: z.boolean().default(false),
        sort: z.number().int().min(0).max(10).default(0),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("./guards.server");
    await requireFeature(context.supabase, context.userId, "bank_edit");
    const owner_id = await ownerOf(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("payment_bank_accounts")
      .upsert({ owner_id, ...data }, { onConflict: "owner_id,slot" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const notifierStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requirePrivileged } = await import("./guards.server");
    await requirePrivileged(context.supabase, context.userId);
    const { telegramConfigured } = await import("./notify/telegram.server");
    return {
      telegram: telegramConfigured(),
      hint: telegramConfigured()
        ? "Telegram approvals are active."
        : "Telegram is not configured. Connect the Telegram connector and set TELEGRAM_OWNER_CHAT_ID in Project Settings → Secrets. Review here keeps working meanwhile.",
    };
  });

const RECEIPT_COLUMNS =
  "id, order_id, owner_id, object_key, mime_type, size_bytes, status, reference, reject_reason, submitted_at, reviewed_at";

export const listReceiptReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({ status: z.enum(["active", "approved", "rejected", "superseded"]).optional() })
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("./guards.server");
    await requireFeature(context.supabase, context.userId, "cash_sales");
    let q = context.supabase
      .from("payment_receipts")
      .select(RECEIPT_COLUMNS)
      .order("submitted_at", { ascending: false })
      .limit(200);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const receipts = rows ?? [];
    if (!receipts.length) return [];

    const { data: orders } = await context.supabase
      .from("payment_orders")
      .select(
        "id, status, plan_label, amount_minor, currency, site_id, issued_code, contact_hint, created_at",
      )
      .in(
        "id",
        receipts.map((r) => r.order_id),
      );
    const byId = new Map((orders ?? []).map((o) => [o.id, o]));
    return receipts.map((r) => ({ ...r, order: byId.get(r.order_id) ?? null }));
  });

export const getReceiptUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ receipt_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    // Receipts are back-office data: owner/admin only, then RLS scopes the
    // select to the caller's tenant.
    const { requireFeature } = await import("./guards.server");
    await requireFeature(context.supabase, context.userId, "cash_sales");
    const { data: receipt, error } = await context.supabase
      .from("payment_receipts")
      .select("id, object_key, owner_id")
      .eq("id", data.receipt_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!receipt) throw new Error("Receipt not found.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { signedReceiptUrl } = await import("./payments/review.server");
    return { url: await signedReceiptUrl(supabaseAdmin as never, receipt.object_key, 120) };
  });

export const reviewOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        order_id: z.string().uuid(),
        decision: z.enum(["approve", "reject"]),
        reason: z.string().trim().max(300).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { requireFeature } = await import("./guards.server");
    await requireFeature(context.supabase, context.userId, "cash_sales");
    const owner_id = await ownerOf(context.supabase, context.userId);

    // Confirm the order is visible to this tenant before touching it.
    const { data: order } = await context.supabase
      .from("payment_orders")
      .select("id, owner_id, status")
      .eq("id", data.order_id)
      .maybeSingle();
    if (!order) throw new Error("Order not found.");

    const { data: receipt } = await context.supabase
      .from("payment_receipts")
      .select("id")
      .eq("order_id", data.order_id)
      .eq("status", "active")
      .maybeSingle();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createReviewStore } = await import("./payments/orders.server");
    const { applyReview } = await import("./payments/review");

    const result = await applyReview(createReviewStore(supabaseAdmin, { serviceRole: true }), {
      orderId: order.id,
      ownerId: order.owner_id ?? owner_id,
      receiptId: receipt?.id ?? null,
      tokenId: `web:${context.userId}:${order.id}`,
      decision: data.decision,
      actor: "web",
      actorUserId: context.userId,
      reason: data.reason ?? null,
    });
    return result;
  });
