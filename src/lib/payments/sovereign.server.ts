import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { DatabaseClient } from "@/lib/database.types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AscensionPlan = {
  id: string;
  label: string;
  price_mmk: number;
  interval: "monthly" | "annual";
};

export const SOVEREIGN_PLANS: Record<string, AscensionPlan> = {
  monthly: {
    id: "plan_sovereign_monthly",
    label: "The Sovereign Monthly",
    price_mmk: 95000,
    interval: "monthly",
  },
  annual: {
    id: "plan_sovereign_annual",
    label: "The Sovereign Annual",
    price_mmk: 1045000,
    interval: "annual",
  },
};

/**
 * Initiates the ascension process by creating a pending payment order
 * and returning a checkout URL.
 */
export const createAscensionSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ plan: z.enum(["monthly", "annual"]) }).parse(raw))
  .handler(async ({ context }) => {
    await (await import("@/lib/guards.server")).requireNotExpired(context.supabase, context.userId);
    throw new Error("Sovereign checkout is not configured. No payment order was created.");
  });

/**
 * Internal function to complete the ascension once payment is verified.
 * This is called by the webhook handler.
 */
export async function completeSovereignAscension(
  supabase: DatabaseClient,
  userId: string,
  orderId: string,
) {
  void supabase;
  void userId;
  void orderId;
  throw new Error("Sovereign settlement is not configured; no entitlement was changed.");
}
