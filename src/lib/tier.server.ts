import { createServerFn } from "@tanstack/react-start";
import { DatabaseClient } from "@/lib/database.types";

export type Tier = 'spark' | 'sovereign';

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

export function getTier(role: string | undefined): Tier {
  if (role === 'sovereign' || role === 'admin' || role === 'owner') return 'sovereign';
  return 'spark';
}

/**
 * Validates if a user can perform an action based on their tier.
 * Throws a specific error if the limit is reached to trigger the Upgrade Modal.
 */
export async function enforceTierLimit(
  supabase: DatabaseClient, 
  userId: string, 
  action: 'add_router' | 'generate_vouchers'
) {
  // 1. Get user role/tier
  const { data: user } = await supabase
    .from('profiles') // Assuming profiles table holds the role
    .select('role')
    .eq('id', userId)
    .single();

  const tier = getTier(user?.role);
  if (tier === 'sovereign') return true;

  // 2. Check specific limits for 'spark'
  if (action === 'add_router') {
    const { count } = await supabase
      .from('router_connections')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', userId);
    
    if ((count ?? 0) >= TIER_LIMITS.spark.maxRouters) {
      throw new Error('LIMIT_REACHED:SOVEREIGN_UPGRADE_REQUIRED');
    }
  }

  if (action === 'generate_vouchers') {
    // Logic for monthly voucher count would go here
    // For now, we'll focus on the router limit as the primary gate
  }

  return true;
}
