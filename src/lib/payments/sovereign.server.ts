import { createServerFn } from "@tanstack/react-start";
import { DatabaseClient } from "@/lib/database.types";
import { __supabase } from "@/lib/supabase.server"; // Assuming this helper exists for server-side client

export type AscensionPlan = {
  id: string;
  label: string;
  price_mmk: number;
  interval: 'monthly' | 'annual';
};

export const SOVEREIGN_PLANS: Record<string, AscensionPlan> = {
  monthly: {
    id: 'plan_sovereign_monthly',
    label: 'The Sovereign Monthly',
    price_mmk: 95000,
    interval: 'monthly',
  },
  annual: {
    id: 'plan_sovereign_annual',
    label: 'The Sovereign Annual',
    price_mmk: 1045000,
    interval: 'annual',
  },
};

/**
 * Initiates the ascension process by creating a pending payment order
 * and returning a checkout URL.
 */
export const createAscensionSession = createServerFn({ method: "POST" })
  .middleware([async ({ context }) => {
    // Ensure user is authenticated
    if (!context.userId) throw new Error("Unauthorized");
    return { userId: context.userId, supabase: context.supabase };
  }])
  .handler(async ({ data, userId, supabase }) => {
    const planKey = (data.plan || 'monthly') as keyof typeof SOVEREIGN_PLANS;
    const plan = SOVEREIGN_PLANS[planKey];

    if (!plan) throw new Error("Invalid ascension plan selected");

    // 1. Create a pending payment order in the existing payment_orders table
    const { data: order, error: orderError } = await supabase
      .from('payment_orders')
      .insert({
        owner_id: userId,
        status: 'pending',
        method: 'online',
        provider: 'sovereign_bridge',
        amount_minor: plan.price_mmk * 100, // store in cents/pyasa
        plan_id: plan.id,
        plan_label: plan.label,
        note: 'Sovereign Ascension Request',
      })
      .select()
      .single();

    if (orderError || !order) {
      throw new Error(`Failed to initiate treasury record: ${orderError?.message}`);
    }

    // 2. Generate the checkout URL. 
    // In a real production environment, this would call Stripe/LemonSqueezy API.
    // For now, we implement the luxury scaffold that redirects to a hosted checkout.
    const checkoutUrl = `https://checkout.mikromagic.app/ascend?order_id=${order.id}&user_id=${userId}`;

    return {
      orderId: order.id,
      checkoutUrl,
      plan: plan,
    };
  });

/**
 * Internal function to complete the ascension once payment is verified.
 * This is called by the webhook handler.
 */
export async function completeSovereignAscension(supabase: DatabaseClient, userId: string, orderId: string) {
  // 1. Mark the order as settled
  const { error: orderError } = await supabase
    .from('payment_orders')
    .update({ status: 'settled', settled_at: new Date().toISOString() })
    .eq('id', orderId);

  if (orderError) throw new Error(`Treasury settlement failed: ${orderError.message}`);

  // 2. Grant the Sovereign Role
  const { error: roleError } = await supabase
    .from('profiles')
    .update({ role: 'sovereign' })
    .eq('id', userId);

  if (roleError) throw new Error(`Coronation failed: ${roleError.message}`);

  return { success: true };
}
