import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { TENANT_PRIMARY_ROLE } from "./app-role";
import type { DatabaseClient } from "./database.types";
import type { PromoPrices, ServiceKey, Tier } from "./services/entitlements";

/**
 * Account-tier services: Monthly and Annual.
 *
 * Everything here is manual bank transfer. A submission only ever creates a
 * PENDING row — tier, expiry, quota and device access are untouched until the
 * app developer approves it. Approval is the single place entitlements are
 * written, and it is owner/admin only.
 */

const SERVICE = z.enum(["monthly", "annual"]);
const MAGIC_COIN_PURCHASE = z.object({
  quantity: z.number().int().min(1).max(1_000_000),
  reference: z.string().trim().max(120).optional(),
  receipt: z.object({
    mime: z.string().min(3).max(120),
    size: z.number().int().min(1),
    dataBase64: z.string().min(16).max(12_000_000),
  }),
});

async function promoPrices() {
  const { PRICING_PROMO_FALLBACK, applyPromoWindow } = await import("./pricing.functions");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("pricing_promo")
    .select(
      "active, starts_on, ends_on, label, monthly_promo_mmk, monthly_standard_mmk, annual_promo_mmk, annual_standard_mmk",
    )
    .maybeSingle();
  return applyPromoWindow(data ?? PRICING_PROMO_FALLBACK);
}

async function entitlementOf(supabase: DatabaseClient, userId: string) {
  const { data } = await supabase
    .from("account_entitlements")
    .select("tier, tier_expires_at, plus, plus_since")
    .eq("user_id", userId)
    .maybeSingle();
  if (data)
    return {
      tier: (data.tier === "monthly" || data.tier === "annual" ? data.tier : "trial") as Tier,
      tier_expires_at: data.tier_expires_at,
      plus: data.plus,
    };
  // Accounts created before entitlements existed fall back to the role window.
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role, expires_at")
    .eq("user_id", userId);
  const row = (roles ?? []).find((r) => r.role === "client");
  return { tier: "trial" as const, tier_expires_at: row?.expires_at ?? null, plus: false };
}

/** Catalogue + this account's live status. Never trusts anything from the client. */
export const listServices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { serviceCatalog, accountStatus } = await import("./services/entitlements");
    const { getRoles, isPlatformAdminUser } = await import("./guards.server");
    const [promo, roles, ent, isPlatformAdmin, walletResult, profileResult] = await Promise.all([
      promoPrices(),
      getRoles(context.supabase, context.userId),
      entitlementOf(context.supabase, context.userId),
      isPlatformAdminUser(context.supabase, context.userId),
      context.supabase.rpc("get_magic_coin_wallet"),
      context.supabase.from("profiles").select("created_at").eq("id", context.userId).maybeSingle(),
    ]);
    if (walletResult.error) throw new Error(walletResult.error.message);

    const status = accountStatus({
      roles,
      entitlement: ent,
      created_at: profileResult.data?.created_at ?? null,
      isPlatformAdmin,
    });
    const { data: purchases } = await context.supabase
      .from("service_purchases")
      .select(
        "id, service_key, service_label, price_mmk, coin_amount, payment_method, status, reference, reject_reason, created_at, decided_at, activated_expires_at",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);

    const pending = new Set(
      (purchases ?? []).filter((p) => p.status === "pending").map((p) => p.service_key),
    );

    return {
      services: serviceCatalog(promo as PromoPrices).map((offer) => {
        return {
          ...offer,
          pending: pending.has(offer.key),
          owned: status.tier === offer.key,
        };
      }),
      promo: {
        active: promo.active,
        starts_on: promo.starts_on,
        ends_on: promo.ends_on,
        label: promo.label,
      },
      status,
      roles,
      isPlatformAdmin,
      purchases: purchases ?? [],
      wallet: walletResult.data as { balance: number; mmk_value: number },
    };
  });

/** Dedicated platform payee accounts for Services checkout. Read via admin so
 * a client never reads tenant voucher-bank rows directly. */
export const developerBankAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("platform_service_bank_accounts")
      .select("id, holder_name, bank_name, account_number, sort")
      .eq("enabled", true)
      .order("sort", { ascending: true });
    return { accounts: data ?? [] };
  });

/** Platform-only source of truth for Services checkout bank details. */
export const listPlatformServiceBankAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isPlatformAdminUser } = await import("./guards.server");
    if (!(await isPlatformAdminUser(context.supabase, context.userId))) {
      throw new Error("Only the Developer account can manage Services billing accounts.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("platform_service_bank_accounts")
      .select("id, slot, holder_name, bank_name, account_number, enabled, sort")
      .order("slot", { ascending: true });
    if (error) throw new Error(error.message);
    return { accounts: data ?? [] };
  });

export const savePlatformServiceBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        slot: z.number().int().min(1).max(2),
        holder_name: z.string().trim().min(1).max(120),
        bank_name: z.string().trim().min(1).max(120),
        account_number: z.string().trim().min(3).max(60),
        enabled: z.boolean(),
        sort: z.number().int().min(0).max(10),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { isPlatformAdminUser } = await import("./guards.server");
    if (!(await isPlatformAdminUser(context.supabase, context.userId))) {
      throw new Error("Only the Developer account can manage Services billing accounts.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("platform_service_bank_accounts")
      .upsert({ ...data, configured_by: context.userId }, { onConflict: "slot" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Submit a purchase with its payment slip. Creates a pending request only. */
export const submitServicePurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        service: SERVICE,
        reference: z.string().trim().max(120).optional(),
        receipt: z.object({
          mime: z.string().min(3).max(120),
          size: z.number().int().min(1),
          dataBase64: z.string().min(16).max(12_000_000),
        }),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { offerFor } = await import("./services/entitlements");
    const { validateReceipt } = await import("./payments/receipts");
    const { effectiveOwner } = await import("./guards.server");

    const check = validateReceipt({ mime: data.receipt.mime, size: data.receipt.size });
    if (!check.ok) {
      throw new Error(
        check.reason === "too_large"
          ? "The payment slip is larger than 8 MB."
          : check.reason === "empty_file"
            ? "The payment slip is empty."
            : "Only JPG, PNG, WebP, HEIC or PDF payment slips are accepted.",
      );
    }

    const ent = await entitlementOf(context.supabase, context.userId);
    const promo = await promoPrices();
    const offer = offerFor(promo as PromoPrices, data.service);
    const owner_id = await effectiveOwner(context.supabase, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: platformAdmins }, { data: reviewers }] = await Promise.all([
      supabaseAdmin.from("platform_admins").select("user_id"),
      supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .in("role", [TENANT_PRIMARY_ROLE])
        .or(`user_id.eq.${owner_id},owner_id.eq.${owner_id}`),
    ]);
    const reviewerIds = [
      ...new Set([
        ...(platformAdmins ?? []).map((r) => r.user_id),
        ...(reviewers ?? []).map((r) => r.user_id),
      ]),
    ];
    const developer_id =
      (platformAdmins ?? [])[0]?.user_id ??
      (reviewers ?? []).find((r) => r.role === TENANT_PRIMARY_ROLE)?.user_id ??
      (reviewers ?? [])[0]?.user_id ??
      null;

    // Duplicate-submit protection: one pending request per service is enforced
    // by a partial unique index, so a double click loses the race safely.
    const { data: row, error } = await supabaseAdmin
      .from("service_purchases")
      .insert({
        user_id: context.userId,
        owner_id,
        developer_id,
        service_key: offer.key,
        service_label: offer.label,
        price_mmk: offer.price_mmk,
        status: "pending",
        reference: data.reference ?? null,
        idempotency_key: `${offer.key}:${Date.now()}`,
        receipt_mime: data.receipt.mime,
        receipt_size_bytes: data.receipt.size,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new Error(`You already have a pending ${offer.label} request awaiting review.`);
      }
      throw new Error(error.message);
    }

    // Generated key — never derived from the uploaded filename.
    const key = `services/${context.userId}/${row.id}.${check.extension}`;
    const bytes = Buffer.from(data.receipt.dataBase64, "base64");
    const { error: upErr } = await supabaseAdmin.storage
      .from("payment-receipts")
      .upload(key, bytes, { contentType: data.receipt.mime, upsert: true });
    if (upErr) {
      await supabaseAdmin.from("service_purchases").delete().eq("id", row.id);
      throw new Error(upErr.message);
    }
    await supabaseAdmin
      .from("service_purchases")
      .update({ receipt_object_key: key })
      .eq("id", row.id);

    await supabaseAdmin.from("service_purchase_audit").insert({
      purchase_id: row.id,
      actor_user_id: context.userId,
      action: "submitted",
      note: `${offer.label} · ${offer.price_mmk} MMK`,
    });

    const notes: Array<{
      recipient_id: string;
      kind: string;
      title: string;
      body: string;
      data: { purchase_id: string; service: ServiceKey; status: string };
    }> = [
      {
        recipient_id: context.userId,
        kind: "service_purchase_pending",
        title: `${offer.label} request received`,
        body: "Your payment slip is waiting for the app developer to review it. Nothing changes until it is approved.",
        data: { purchase_id: row.id, service: offer.key, status: "pending" },
      },
    ];
    for (const user_id of reviewerIds) {
      if (user_id === context.userId) continue;
      notes.push({
        recipient_id: user_id,
        kind: "service_purchase_review",
        title: `New ${offer.label} purchase to review`,
        body: `${offer.price_mmk} MMK submitted with a bank slip.`,
        data: { purchase_id: row.id, service: offer.key, status: "pending" },
      });
    }
    await supabaseAdmin.from("admin_notifications").insert(notes);

    // Owner Telegram alert: the payment slip plus inline Approve / Reject
    // buttons. Best effort — a Telegram outage never fails the purchase.
    try {
      const { sendPurchaseReview, purchaseSigningMaterial } =
        await import("@/lib/notify/telegram.server");
      const { purchaseCallbackData } = await import("@/lib/notify/purchase-tokens");
      const material = purchaseSigningMaterial();
      const [approveData, rejectData] = await Promise.all([
        purchaseCallbackData("approve", row.id, material),
        purchaseCallbackData("reject", row.id, material),
      ]);
      if (approveData && rejectData) {
        const { accountLabel } = await import("./services/account-label.server");
        const who = await accountLabel(supabaseAdmin, context.userId);
        await sendPurchaseReview({
          purchaseId: row.id,
          caption: [
            "New service purchase awaiting review",
            `Account: ${who}`,
            `Service: ${offer.label}`,
            `Amount: ${offer.price_mmk} MMK`,
            `Request: ${row.id.slice(0, 8)}`,
            data.reference ? `Reference: ${data.reference}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          approveData,
          rejectData,
          receipt: {
            bytes: new Uint8Array(bytes),
            filename: `receipt-${row.id.slice(0, 8)}.${check.extension}`,
            mime: data.receipt.mime,
          },
        });
      }
    } catch {
      // notification is best-effort
    }

    return { ok: true, purchase_id: row.id, status: "pending" as const };
  });

/** Pay from the authenticated account's Magic Coin wallet. The SQL function
 * locks the balance, writes the immutable debit and creates the pending
 * purchase together. Service activation deliberately remains reviewer-gated. */
export const purchaseServiceWithMagicCoins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ service: SERVICE }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("pay_service_with_magic_coins", {
      _service: data.service,
    });
    if (error) {
      if (error.message.includes("INSUFFICIENT_MAGIC_COINS")) {
        throw new Error("Your Magic Coin wallet does not have enough coins for this service.");
      }
      throw new Error(error.message);
    }
    return result as { ok: true; purchase_id: string; price_coins: number; balance: number };
  });

/**
 * Buy Coins by bank transfer. The quantity and 1,000-MMK rate are calculated
 * on the server, and approval is what triggers the immutable wallet credit.
 * A browser can never credit a wallet directly.
 */
export const submitMagicCoinPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => MAGIC_COIN_PURCHASE.parse(raw))
  .handler(async ({ data, context }) => {
    const { MAGIC_COIN_MMK_RATE } = await import("./magic-coins");
    const { validateReceipt } = await import("./payments/receipts");
    const { effectiveOwner } = await import("./guards.server");
    const check = validateReceipt({ mime: data.receipt.mime, size: data.receipt.size });
    if (!check.ok) {
      throw new Error(
        check.reason === "too_large"
          ? "The payment slip is larger than 8 MB."
          : check.reason === "empty_file"
            ? "The payment slip is empty."
            : "Only JPG, PNG, WebP, HEIC or PDF payment slips are accepted.",
      );
    }

    const price_mmk = data.quantity * MAGIC_COIN_MMK_RATE;
    const owner_id = await effectiveOwner(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: platformAdmins }, { data: reviewers }] = await Promise.all([
      supabaseAdmin.from("platform_admins").select("user_id"),
      supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .in("role", [TENANT_PRIMARY_ROLE])
        .or(`user_id.eq.${owner_id},owner_id.eq.${owner_id}`),
    ]);
    const reviewerIds = [
      ...new Set([
        ...(platformAdmins ?? []).map((r) => r.user_id),
        ...(reviewers ?? []).map((r) => r.user_id),
      ]),
    ];
    const developer_id =
      (platformAdmins ?? [])[0]?.user_id ??
      (reviewers ?? []).find((r) => r.role === TENANT_PRIMARY_ROLE)?.user_id ??
      (reviewers ?? [])[0]?.user_id ??
      null;

    const { data: row, error } = await supabaseAdmin
      .from("service_purchases")
      .insert({
        user_id: context.userId,
        owner_id,
        developer_id,
        service_key: "magic_coins",
        service_label: `${data.quantity.toLocaleString("en-US")} Magic Coins`,
        price_mmk,
        magic_coin_purchase_amount: data.quantity,
        payment_method: "bank_transfer",
        status: "pending",
        reference: data.reference ?? null,
        idempotency_key: `magic-coins:${Date.now()}`,
        receipt_mime: data.receipt.mime,
        receipt_size_bytes: data.receipt.size,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new Error("You already have a pending Magic Coin purchase awaiting review.");
      }
      throw new Error(error.message);
    }

    const key = `services/${context.userId}/${row.id}.${check.extension}`;
    const bytes = Buffer.from(data.receipt.dataBase64, "base64");
    const { error: upErr } = await supabaseAdmin.storage
      .from("payment-receipts")
      .upload(key, bytes, { contentType: data.receipt.mime, upsert: true });
    if (upErr) {
      await supabaseAdmin.from("service_purchases").delete().eq("id", row.id);
      throw new Error(upErr.message);
    }
    await supabaseAdmin
      .from("service_purchases")
      .update({ receipt_object_key: key })
      .eq("id", row.id);
    await supabaseAdmin.from("service_purchase_audit").insert({
      purchase_id: row.id,
      actor_user_id: context.userId,
      action: "submitted",
      note: `${data.quantity} Magic Coins · ${price_mmk} MMK`,
    });
    await supabaseAdmin.from("admin_notifications").insert(
      reviewerIds
        .filter((recipient_id) => recipient_id !== context.userId)
        .map((recipient_id) => ({
          recipient_id,
          kind: "service_purchase_review",
          title: "New Magic Coin purchase to review",
          body: `${data.quantity.toLocaleString("en-US")} Magic Coins · ${price_mmk.toLocaleString("en-US")} MMK submitted with a bank slip.`,
          data: { purchase_id: row.id, service: "magic_coins", status: "pending" },
        })),
    );

    // Keep Magic Coin bank-transfer purchases on the same Telegram review path
    // as tier plans. The callback is generic and approval remains the only
    // path that credits the wallet; this alert never changes a balance itself.
    try {
      const { sendPurchaseReview, purchaseSigningMaterial } =
        await import("@/lib/notify/telegram.server");
      const { purchaseCallbackData } = await import("@/lib/notify/purchase-tokens");
      const material = purchaseSigningMaterial();
      const [approveData, rejectData] = await Promise.all([
        purchaseCallbackData("approve", row.id, material),
        purchaseCallbackData("reject", row.id, material),
      ]);
      if (approveData && rejectData) {
        const { accountLabel } = await import("./services/account-label.server");
        const who = await accountLabel(supabaseAdmin, context.userId);
        await sendPurchaseReview({
          purchaseId: row.id,
          caption: [
            "New Magic Coin purchase awaiting review",
            `Account: ${who}`,
            `Coins: ${data.quantity.toLocaleString("en-US")} Magic Coins`,
            `Amount: ${price_mmk.toLocaleString("en-US")} MMK`,
            `Request: ${row.id.slice(0, 8)}`,
            data.reference ? `Reference: ${data.reference}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
          approveData,
          rejectData,
          receipt: {
            bytes: new Uint8Array(bytes),
            filename: `receipt-${row.id.slice(0, 8)}.${check.extension}`,
            mime: data.receipt.mime,
          },
        });
      }
    } catch {
      // Notification delivery is best-effort and must never block checkout.
    }

    return { ok: true, purchase_id: row.id, status: "pending" as const };
  });

/**
 * Short-lived receipt URL. The buyer of the row, or an owner/admin reviewer of
 * the SAME tenant. Platform administrators are the only cross-tenant exception.
 */
export const serviceReceiptUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ purchase_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("service_purchases")
      .select("id, user_id, owner_id, receipt_object_key")
      .eq("id", data.purchase_id)
      .maybeSingle();
    if (!row || !row.receipt_object_key) throw new Error("Receipt not found.");

    if (row.user_id !== context.userId) {
      const { resolveAdminScope } = await import("./admin-scope.server");
      const { canReadReceipt } = await import("./tenant-scope");
      const scope = await resolveAdminScope(context);
      if (!canReadReceipt(scope, { user_id: row.user_id, owner_id: row.owner_id })) {
        throw new Error("Forbidden: that request belongs to another business.");
      }
    }

    const { data: signed, error } = await supabaseAdmin.storage
      .from("payment-receipts")
      .createSignedUrl(row.receipt_object_key, 120);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl, expires_in: 120 };
  });

const PURCHASE_COLUMNS =
  "id, user_id, owner_id, service_key, service_label, price_mmk, coin_amount, magic_coin_purchase_amount, payment_method, status, reference, reject_reason, receipt_object_key, receipt_mime, created_at, decided_at, decided_by, activated_expires_at";

/**
 * Owner/admin review queue, limited to the caller's own tenant. The query runs
 * with the service role, so the tenant filter is applied in code — RLS is not
 * relied upon here.
 */
export const listServicePurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({ status: z.enum(["pending", "approved", "rejected", "all"]).default("pending") })
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { resolveAdminScope } = await import("./admin-scope.server");
    const { applyTenantFilter } = await import("./tenant-scope");
    const scope = await resolveAdminScope(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = applyTenantFilter(
      supabaseAdmin
        .from("service_purchases")
        .select(PURCHASE_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(200),
      scope,
    );
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const purchases = rows ?? [];
    if (!purchases.length) return [];

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, username")
      .in("id", [...new Set(purchases.map((p) => p.user_id))]);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    return purchases.map((p) => ({
      ...p,
      buyer: byId.get(p.user_id)?.display_name ?? byId.get(p.user_id)?.username ?? p.user_id,
    }));
  });

/** Approve: atomically flips the row and writes the entitlement + quota. */
export const approveServicePurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ purchase_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { resolveAdminScope } = await import("./admin-scope.server");
    const scope = await resolveAdminScope(context);
    const { approvePurchase } = await import("./services/purchase-review.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { activation, purchase } = await approvePurchase(supabaseAdmin, {
      purchaseId: data.purchase_id,
      actorUserId: context.userId,
      scope,
      channel: "web",
    });

    try {
      const { sendOwnerMessage } = await import("@/lib/notify/telegram.server");
      const { accountLabel } = await import("./services/account-label.server");
      const who = await accountLabel(supabaseAdmin, purchase.user_id);
      await sendOwnerMessage(
        [
          "Service purchase approved",
          `Account: ${who}`,
          `Service: ${purchase.service_label}`,
          `Amount: ${purchase.price_mmk} MMK`,
          `Request: ${purchase.id.slice(0, 8)}`,
        ].join("\n"),
      );
    } catch {
      // notification is best-effort
    }

    return { ok: true, activation };
  });

/** Reject: entitlement, expiry and quota stay exactly as they were. */
export const rejectServicePurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({ purchase_id: z.string().uuid(), reason: z.string().trim().min(3).max(300) })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { resolveAdminScope } = await import("./admin-scope.server");
    const scope = await resolveAdminScope(context);
    const { rejectPurchase } = await import("./services/purchase-review.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { purchase } = await rejectPurchase(supabaseAdmin, {
      purchaseId: data.purchase_id,
      actorUserId: context.userId,
      scope,
      channel: "web",
      reason: data.reason,
    });

    try {
      const { sendOwnerMessage } = await import("@/lib/notify/telegram.server");
      const { accountLabel } = await import("./services/account-label.server");
      const who = await accountLabel(supabaseAdmin, purchase.user_id);
      await sendOwnerMessage(
        [
          "Service purchase rejected",
          `Account: ${who}`,
          `Service: ${purchase.service_label}`,
          `Request: ${purchase.id.slice(0, 8)}`,
        ].join("\n"),
      );
    } catch {
      // notification is best-effort
    }

    return { ok: true };
  });

/**
 * Refund an already-approved Tier Pass purchase. Privileged and tenant-scoped:
 * the claim itself carries the tenant filter, so a reviewer can never refund
 * another business's purchase. The status flip and the compensating Magic
 * Point rows happen together, and a repeat call reverses nothing twice.
 *
 * Guest voucher refunds (payment_orders) are a separate flow and untouched.
 */
export const refundServicePurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({ purchase_id: z.string().uuid(), reason: z.string().trim().min(3).max(300) })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { resolveAdminScope } = await import("./admin-scope.server");
    const { applyTenantFilter } = await import("./tenant-scope");
    const scope = await resolveAdminScope(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();

    const claim = applyTenantFilter(
      supabaseAdmin
        .from("service_purchases")
        .update({
          status: "refunded",
          refunded_at: now,
          refunded_by: context.userId,
          refund_reason: data.reason,
        })
        .eq("id", data.purchase_id)
        .eq("status", "approved"),
      scope,
    );
    const { data: claimed, error } = await claim.select("id, user_id, service_label").maybeSingle();
    if (error) throw new Error(error.message);
    if (!claimed)
      throw new Error("Only an approved purchase of your own business can be refunded.");

    const { reverseTierPassPoints } = await import("./agent-points.server");
    const reversal = await reverseTierPassPoints(supabaseAdmin, claimed.id, "Tier Pass refunded");

    await supabaseAdmin.from("service_purchase_audit").insert({
      purchase_id: claimed.id,
      actor_user_id: context.userId,
      action: "refunded",
      note: data.reason,
    });
    await supabaseAdmin.from("admin_notifications").insert({
      recipient_id: claimed.user_id,
      kind: "service_purchase_refunded",
      title: `${claimed.service_label} refunded`,
      body: data.reason,
      data: { purchase_id: claimed.id, status: "refunded" },
    });

    return { ok: true, reversed_points: reversal.reversed };
  });
