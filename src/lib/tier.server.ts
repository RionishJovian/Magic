import type { DatabaseClient } from "@/lib/database.types";

export type Tier = "spark" | "sovereign";

export const TIER_LIMITS = {
  spark: {
    maxRouters: 1,
    monthlyVouchers: 50,
    proactiveAlerts: false,
  },
  sovereign: {
    maxRouters: Infinity,
    monthlyVouchers: Infinity,
    proactiveAlerts: true,
  },
} as const;

export function getTier(entitlement: string | null | undefined, expiresAt?: string | null): Tier {
  const paid = entitlement === "monthly" || entitlement === "annual";
  const active = !expiresAt || Date.parse(expiresAt) > Date.now();
  return paid && active ? "sovereign" : "spark";
}

/**
 * Validates if a user can perform an action based on their tier.
 * Throws a specific error if the limit is reached to trigger the Upgrade Modal.
 */
export async function enforceTierLimit(
  supabase: DatabaseClient,
  userId: string,
  action: "add_router" | "generate_vouchers",
) {
  const { effectiveOwner } = await import("./guards.server");
  const ownerId = await effectiveOwner(supabase, userId);
  const { data: entitlement, error } = await supabase
    .from("account_entitlements")
    .select("tier, tier_expires_at")
    .eq("user_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (getTier(entitlement?.tier, entitlement?.tier_expires_at) === "sovereign") return true;

  // 2. Check specific limits for 'spark'
  if (action === "add_router") {
    const { count } = await supabase
      .from("router_connections")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId);

    if ((count ?? 0) >= TIER_LIMITS.spark.maxRouters) {
      throw new Error("LIMIT_REACHED:SOVEREIGN_UPGRADE_REQUIRED");
    }
  }

  if (action === "generate_vouchers") {
    // Logic for monthly voucher count would go here
    // For now, we'll focus on the router limit as the primary gate
  }

  return true;
}
