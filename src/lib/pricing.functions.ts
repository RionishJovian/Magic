import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { appDayKey } from "@/lib/time";

export type PricingPromo = {
  active: boolean;
  starts_on: string;
  ends_on: string;
  label: string;
  monthly_promo_mmk: number;
  monthly_standard_mmk: number;
  annual_promo_mmk: number;
  annual_standard_mmk: number;
};

/** Grand opening window: 30% off Monthly & Annual for ~one month. Inclusive (Asia/Yangon). */
export const PRICING_PROMO_FALLBACK: PricingPromo = {
  active: true,
  starts_on: "2026-08-23",
  ends_on: "2026-09-24",
  label: "Grand opening gift — 30% off Monthly & Annual",
  monthly_promo_mmk: 66500,
  monthly_standard_mmk: 95000,
  annual_promo_mmk: 731500,
  annual_standard_mmk: 1045000,
};

/**
 * Promo sells only when the kill switch is on AND today (Asia/Yangon) is
 * within starts_on…ends_on inclusive. Dates alone never sold without `active`.
 */
export function isPromoWindowLive(
  promo: Pick<PricingPromo, "active" | "starts_on" | "ends_on">,
  now: number | Date = Date.now(),
): boolean {
  if (!promo.active) return false;
  const start = String(promo.starts_on || "").trim();
  const end = String(promo.ends_on || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return false;
  const today = appDayKey(now);
  return today >= start && today <= end;
}

/** Returns a copy with `active` gated by the Yangon calendar window. */
export function applyPromoWindow<T extends PricingPromo>(
  promo: T,
  now: number | Date = Date.now(),
): T {
  return { ...promo, active: isPromoWindowLive(promo, now) };
}

export const getPricingPromo = createServerFn({ method: "GET" }).handler(
  async (): Promise<PricingPromo> => {
    const url = process.env["VITE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
    const key =
      process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return applyPromoWindow(PRICING_PROMO_FALLBACK);

    try {
      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { apikey: key } },
      });
      const { data, error } = await client
        .from("pricing_promo")
        .select(
          "active, starts_on, ends_on, label, monthly_promo_mmk, monthly_standard_mmk, annual_promo_mmk, annual_standard_mmk",
        )
        .maybeSingle();
      if (error || !data) return applyPromoWindow(PRICING_PROMO_FALLBACK);
      return applyPromoWindow(data as PricingPromo);
    } catch {
      return applyPromoWindow(PRICING_PROMO_FALLBACK);
    }
  },
);
