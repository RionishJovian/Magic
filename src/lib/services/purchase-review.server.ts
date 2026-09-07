// Server-only core of the Tier Pass purchase review flow.
//
// The same code backs the in-app reviewer buttons and the Telegram inline
// approve/reject buttons, so both paths share one claim-then-write state
// machine: the row is only ever decided once, and the tenant filter is part of
// the claim.

import { z } from "zod";
import { TENANT_PRIMARY_ROLE } from "../app-role";
import type { DatabaseClient } from "../database.types";
import type { Tier } from "./entitlements";
import { applyTenantFilter, type TenantScope } from "../tenant-scope";

type Activation = ReturnType<typeof import("./entitlements").computeActivation>;

const SERVICE = z.enum(["monthly", "annual"]);

export async function entitlementOf(supabase: DatabaseClient, userId: string) {
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

export interface DecisionInput {
  purchaseId: string;
  actorUserId: string;
  scope: TenantScope;
  /** "web" (reviewer in the app) or "telegram". Recorded in the audit note. */
  channel?: "web" | "telegram";
}

export async function approvePurchase(
  supabaseAdmin: DatabaseClient,
  input: DecisionInput,
): Promise<{
  ok: true;
  activation: Activation | null;
  purchase: { id: string; user_id: string; service_label: string; price_mmk: number };
}> {
  const { computeActivation } = await import("./entitlements");

  // Never rely on a client-controlled payment_method label. Wallet checkout
  // must have created the matching immutable debit before any reviewer can
  // approve it. The database trigger repeats this check for every channel.
  const pendingPurchase = applyTenantFilter(
    supabaseAdmin
      .from("service_purchases")
      .select("id, user_id, price_mmk, coin_amount, magic_coin_purchase_amount, payment_method")
      .eq("id", input.purchaseId)
      .eq("status", "pending"),
    input.scope,
  );
  const { data: pending, error: pendingErr } = await pendingPurchase.maybeSingle();
  if (pendingErr) throw new Error(pendingErr.message);
  if (!pending) throw new Error("This request is no longer pending.");
  if (pending.payment_method === "magic_coins") {
    const { data: debit, error: debitErr } = await supabaseAdmin
      .from("magic_coin_transactions")
      .select("id")
      .eq("service_purchase_id", pending.id)
      .eq("user_id", pending.user_id)
      .eq("kind", "service_payment")
      .eq("delta", -Number(pending.coin_amount))
      .maybeSingle();
    if (debitErr) throw new Error(debitErr.message);
    if (!debit)
      throw new Error("Magic Coin payment verification failed; this request cannot be approved.");
  }

  // Claim the row first: a second reviewer clicking approve gets no rows.
  const claim = applyTenantFilter(
    supabaseAdmin
      .from("service_purchases")
      .update({
        status: "approved",
        decided_by: input.actorUserId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", input.purchaseId)
      .eq("status", "pending"),
    input.scope,
  );
  const { data: claimed, error: claimErr } = await claim
    .select(
      "id, user_id, owner_id, service_key, service_label, price_mmk, magic_coin_purchase_amount, payment_method",
    )
    .maybeSingle();
  if (claimErr) throw new Error(claimErr.message);
  if (!claimed) throw new Error("This request is no longer pending.");

  // The database approval trigger credits this purchase atomically with the
  // status change. This branch intentionally does not touch entitlements.
  if (claimed.service_key === "magic_coins") {
    const amount = Number(claimed.magic_coin_purchase_amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Magic Coin purchase is missing its requested quantity.");
    }
    await supabaseAdmin.from("service_purchase_audit").insert({
      purchase_id: claimed.id,
      actor_user_id: input.actorUserId,
      action: "approved",
      note: `${amount.toLocaleString("en-US")} Magic Coins credited${input.channel === "telegram" ? " from Telegram" : ""}`,
    });
    await supabaseAdmin.from("admin_notifications").insert({
      recipient_id: claimed.user_id,
      kind: "magic_coins_credited",
      title: "Magic Coins credited",
      body: `${amount.toLocaleString("en-US")} Magic Coins are now in your wallet.`,
      data: { purchase_id: claimed.id, service: claimed.service_key, status: "approved" },
    });
    return { ok: true, activation: null, purchase: claimed };
  }

  const current = await entitlementOf(supabaseAdmin, claimed.user_id);
  const { data: allowance } = await supabaseAdmin
    .from("device_allowances")
    .select("routers, controllers, sites")
    .eq("owner_id", claimed.owner_id)
    .maybeSingle();

  const activation = computeActivation({
    service: SERVICE.parse(claimed.service_key),
    current: {
      tier: current.tier,
      tier_expires_at: current.tier_expires_at ?? null,
      plus: false,
    },
    currentQuota: allowance ?? undefined,
  });

  await supabaseAdmin.from("account_entitlements").upsert(
    {
      user_id: claimed.user_id,
      owner_id: claimed.owner_id,
      tier: activation.tier,
      tier_expires_at: activation.tier_expires_at,
      plus: false,
      plus_since: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  await supabaseAdmin.from("device_allowances").upsert(
    {
      owner_id: claimed.owner_id,
      routers: activation.quota.routers,
      controllers: activation.quota.controllers,
      sites: activation.quota.sites,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id" },
  );

  // Tier purchases restore an active account window.
  if (activation.tier_expires_at) {
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", claimed.user_id);
    const isOwner = (roles ?? []).some((r) => r.role === TENANT_PRIMARY_ROLE);
    if (!isOwner) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", claimed.user_id);
      await supabaseAdmin.from("user_roles").insert({
        user_id: claimed.user_id,
        role: "client",
        owner_id: claimed.owner_id,
        expires_at: activation.tier_expires_at,
      });
    }
  }

  // Bank-paid Tier Passes may award a referring agent. Wallet-paid orders do
  // not create coins, preventing internal Coin spend from minting more Coins.
  if (claimed.payment_method !== "magic_coins") {
    const decided_at = new Date().toISOString();
    const { awardTierPassPoints } = await import("../agent-points.server");
    await awardTierPassPoints(supabaseAdmin, {
      id: claimed.id,
      user_id: claimed.user_id,
      owner_id: claimed.owner_id,
      service_key: claimed.service_key,
      service_label: claimed.service_label,
      status: "approved",
      decided_at,
    });
  }

  await supabaseAdmin
    .from("service_purchases")
    .update({ activated_expires_at: activation.tier_expires_at })
    .eq("id", claimed.id);

  await supabaseAdmin.from("service_purchase_audit").insert({
    purchase_id: claimed.id,
    actor_user_id: input.actorUserId,
    action: "approved",
    note: `${claimed.service_label} activated${input.channel === "telegram" ? " from Telegram" : ""}`,
  });

  await supabaseAdmin.from("admin_notifications").insert({
    recipient_id: claimed.user_id,
    kind: "service_purchase_approved",
    title: `${claimed.service_label} approved`,
    body: `Your account is active until ${new Date(activation.tier_expires_at!).toLocaleDateString()}.`,
    data: { purchase_id: claimed.id, service: claimed.service_key, status: "approved" },
  });

  return { ok: true, activation, purchase: claimed };
}

export async function rejectPurchase(
  supabaseAdmin: DatabaseClient,
  input: DecisionInput & { reason: string },
): Promise<{ ok: true; purchase: { id: string; user_id: string; service_label: string } }> {
  const claim = applyTenantFilter(
    supabaseAdmin
      .from("service_purchases")
      .update({
        status: "rejected",
        reject_reason: input.reason,
        decided_by: input.actorUserId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", input.purchaseId)
      .eq("status", "pending"),
    input.scope,
  );
  const { data: claimed, error } = await claim.select("id, user_id, service_label").maybeSingle();
  if (error) throw new Error(error.message);
  if (!claimed) throw new Error("This request is no longer pending.");

  await supabaseAdmin.from("service_purchase_audit").insert({
    purchase_id: claimed.id,
    actor_user_id: input.actorUserId,
    action: "rejected",
    note: input.reason,
  });
  await supabaseAdmin.from("admin_notifications").insert({
    recipient_id: claimed.user_id,
    kind: "service_purchase_rejected",
    title: `${claimed.service_label} request rejected`,
    body: input.reason,
    data: { purchase_id: claimed.id, status: "rejected" },
  });

  return { ok: true, purchase: claimed };
}
