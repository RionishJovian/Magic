// Server-only Magic Coins ledger for paid Tier Pass purchases.
//
// A paid, admin-approved service purchase is the ONLY normal award source:
//   monthly (Emerald) = 15 points
//   annual  (Sapphire) = 150 points
//   plus / vouchers / payment_orders / manual activation = 0
//
// Every award row carries the full Agent -> Client -> purchase -> Tier Pass ->
// points -> date -> status chain, and the database enforces one positive award
// per purchase and billing period, plus one reversal per award.
import type { DatabaseClient } from "./database.types";

export const TIER_PASS_POINTS = {
  monthly: 15,
  annual: 150,
  plus: 0,
} as const;

export type TierPassKey = keyof typeof TIER_PASS_POINTS;

export const AWARD_KIND = "tier_pass_award";
export const REVERSAL_KIND = "tier_pass_reversal";

/** Only Emerald (monthly) and Sapphire (annual) Tier Passes earn commission. */
export function pointsForService(serviceKey: string): number {
  return TIER_PASS_POINTS[serviceKey as TierPassKey] ?? 0;
}

/**
 * Billing period the award belongs to. Monthly passes earn once per calendar
 * month, annual passes once per calendar year — so a genuine later renewal
 * lands in a distinct period and earns again, while a repeat order inside the
 * same period is deduped by the unique index.
 */
export function billingPeriodFor(serviceKey: string, at: Date = new Date()): string {
  const y = at.getUTCFullYear();
  if (serviceKey === "annual") return String(y);
  return `${y}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function referringAgent(
  admin: DatabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("account_referrals")
    .select("agent_id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.agent_id as string | undefined) ?? null;
}

/** Canonical tenant id for a member account — the same value Tier Pass purchases use. */
export async function tenantOwnerOf(admin: DatabaseClient, userId: string): Promise<string> {
  const { data } = await admin.rpc("effective_owner", { _user_id: userId });
  return (data as string | null) ?? userId;
}

export type TierPassAward =
  | { awarded: false; reason: "not_eligible_service" | "no_agent" | "duplicate_period" }
  | { awarded: true; points: number; billing_period: string; point_id: string };

/**
 * Award Magic Coins for an APPROVED Tier Pass purchase. Idempotent: a second
 * call for the same purchase and billing period is absorbed by the unique
 * index and reported as a duplicate rather than a second row.
 */
export async function awardTierPassPoints(
  admin: DatabaseClient,
  purchase: {
    id: string;
    user_id: string;
    owner_id: string;
    service_key: string;
    service_label?: string | null;
    status?: string;
    decided_at?: string | null;
  },
): Promise<TierPassAward> {
  const points = pointsForService(purchase.service_key);
  if (points <= 0) return { awarded: false, reason: "not_eligible_service" };

  const agentId = await referringAgent(admin, purchase.user_id);
  if (!agentId) return { awarded: false, reason: "no_agent" };

  const at = purchase.decided_at ? new Date(purchase.decided_at) : new Date();
  const billing_period = billingPeriodFor(purchase.service_key, at);

  const { data, error } = await admin
    .from("agent_points")
    .insert({
      agent_id: agentId,
      referred_user_id: purchase.user_id,
      owner_id: purchase.owner_id,
      kind: AWARD_KIND,
      points,
      service_purchase_id: purchase.id,
      service_key: purchase.service_key,
      billing_period,
      source_status: purchase.status ?? "approved",
      note: `${purchase.service_label ?? purchase.service_key} · ${billing_period}`,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { awarded: false, reason: "duplicate_period" };
    throw new Error(error.message);
  }
  return { awarded: true, points, billing_period, point_id: data!.id as string };
}

export type TierPassReversal = { reversed: number; already: number };

/**
 * Compensating negative rows for every prior award of a refunded purchase.
 * Exactly one reversal per award — the unique index makes a repeat call a
 * no-op instead of double-reversing.
 */
export async function reverseTierPassPoints(
  admin: DatabaseClient,
  purchaseId: string,
  note = "Tier Pass refunded",
): Promise<TierPassReversal> {
  const { data: awards } = await admin
    .from("agent_points")
    .select("id, agent_id, referred_user_id, owner_id, points, service_key, billing_period")
    .eq("service_purchase_id", purchaseId)
    .eq("kind", AWARD_KIND);

  let reversed = 0;
  let already = 0;
  for (const a of awards ?? []) {
    const { error } = await admin.from("agent_points").insert({
      agent_id: a.agent_id,
      referred_user_id: a.referred_user_id,
      owner_id: a.owner_id,
      kind: REVERSAL_KIND,
      points: -Number(a.points),
      service_purchase_id: purchaseId,
      service_key: a.service_key,
      billing_period: a.billing_period,
      source_status: "refunded",
      reverses_point_id: a.id,
      note,
    });
    if (error) {
      if (error.code === "23505") already++;
      else throw new Error(error.message);
    } else reversed++;
  }
  return { reversed, already };
}
